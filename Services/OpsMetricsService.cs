using System.Globalization;
using System.Text;
using Microsoft.Data.Sqlite;

/// <summary>Operational health and Prometheus-style metrics for monitoring.</summary>
public sealed class OpsMetricsService
{
    private readonly DatabaseService _db;
    private readonly BackupStatsService _backups;
    private readonly GoogleCalendarSyncService? _gcal;

    private static long _requestCount;
    private static long _mutationCount;
    private static DateTimeOffset _startedAt = DateTimeOffset.UtcNow;

    public OpsMetricsService(
        DatabaseService db,
        BackupStatsService backups,
        GoogleCalendarSyncService gcal)
    {
        _db = db;
        _backups = backups;
        _gcal = gcal;
    }

    public static void RecordRequest(bool isMutation)
    {
        Interlocked.Increment(ref _requestCount);
        if (isMutation)
            Interlocked.Increment(ref _mutationCount);
    }

    public OpsHealthModel GetDetailedHealth()
    {
        var backup = _backups.GetLocalBackupStats();
        var dbPath = _db.GetDatabaseFilePath();
        long dbBytes = 0;
        if (!string.IsNullOrEmpty(dbPath) && File.Exists(dbPath))
            dbBytes = new FileInfo(dbPath).Length;

        return new OpsHealthModel
        {
            Service = "homebot-api",
            UptimeSeconds = (long)(DateTimeOffset.UtcNow - _startedAt).TotalSeconds,
            DatabaseBytes = dbBytes,
            DatabasePath = dbPath ?? "",
            TableCounts = GetTableCounts(),
            Backups = backup,
            GoogleCalendar = _gcal?.GetStatus(),
            Workers = new Dictionary<string, object>
            {
                ["buyRecurring"] = new { pollMinutes = ReadEnvInt("HOMEBOT_BUY_RECURRING_POLL_MINUTES", 60) },
                ["reminders"] = new { pollSeconds = ReadEnvInt("HOMEBOT_REMINDER_POLL_SECONDS", 30) },
                ["googleCalendar"] = _gcal?.GetStatus() ?? new { connected = false },
            },
        };
    }

    public string RenderPrometheusText()
    {
        var h = GetDetailedHealth();
        var sb = new StringBuilder();
        sb.AppendLine("# HELP homebot_uptime_seconds Process uptime.");
        sb.AppendLine("# TYPE homebot_uptime_seconds gauge");
        sb.AppendLine(CultureInfo.InvariantCulture, $"homebot_uptime_seconds {h.UptimeSeconds}");
        sb.AppendLine("# HELP homebot_http_requests_total Total HTTP requests seen by metrics middleware.");
        sb.AppendLine("# TYPE homebot_http_requests_total counter");
        sb.AppendLine(CultureInfo.InvariantCulture, $"homebot_http_requests_total {Volatile.Read(ref _requestCount)}");
        sb.AppendLine("# HELP homebot_http_mutations_total Total mutation HTTP requests.");
        sb.AppendLine("# TYPE homebot_http_mutations_total counter");
        sb.AppendLine(CultureInfo.InvariantCulture, $"homebot_http_mutations_total {Volatile.Read(ref _mutationCount)}");
        sb.AppendLine("# HELP homebot_database_bytes SQLite file size.");
        sb.AppendLine("# TYPE homebot_database_bytes gauge");
        sb.AppendLine(CultureInfo.InvariantCulture, $"homebot_database_bytes {h.DatabaseBytes}");
        if (h.Backups is IDictionary<string, object> bk && bk.TryGetValue("fileCount", out var fc))
        {
            sb.AppendLine("# HELP homebot_backup_file_count Local backup files.");
            sb.AppendLine("# TYPE homebot_backup_file_count gauge");
            sb.AppendLine(CultureInfo.InvariantCulture, $"homebot_backup_file_count {fc}");
        }

        return sb.ToString();
    }

    private Dictionary<string, long> GetTableCounts()
    {
        var tables = new[]
        {
            "BuyItems", "WishlistItems", "Transactions", "BudgetTransactions",
            "CalendarItems", "WebUsers", "MealRecipes", "MealPlanEntries",
        };
        var counts = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        using var conn = _db.GetConnection();
        conn.Open();
        foreach (var t in tables)
        {
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"SELECT COUNT(*) FROM {t}";
                counts[t] = Convert.ToInt64(cmd.ExecuteScalar(), CultureInfo.InvariantCulture);
            }
            catch
            {
                counts[t] = -1;
            }
        }

        return counts;
    }

    private static int ReadEnvInt(string name, int fallback)
    {
        var raw = Environment.GetEnvironmentVariable(name);
        return int.TryParse(raw, out var n) ? n : fallback;
    }
}

public sealed class OpsHealthModel
{
    public string Service { get; set; } = "";
    public long UptimeSeconds { get; set; }
    public long DatabaseBytes { get; set; }
    public string DatabasePath { get; set; } = "";
    public Dictionary<string, long> TableCounts { get; set; } = new();
    public object? Backups { get; set; }
    public object? GoogleCalendar { get; set; }
    public Dictionary<string, object> Workers { get; set; } = new();
}
