using Microsoft.Data.Sqlite;

/// <summary>Per-member notification toggles stored in SQLite.</summary>
public sealed class NotificationPreferencesService
{
    private readonly DatabaseService _db;

    public NotificationPreferencesService(DatabaseService db)
    {
        _db = db;
    }

    public NotificationPreferencesModel Get(ulong discordUserId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT BudgetAlerts, CalendarDm, WeeklyDigest
            FROM NotificationPreferences WHERE DiscordUserId = $d";
        cmd.Parameters.AddWithValue("$d", discordUserId.ToString());
        using var r = cmd.ExecuteReader();
        if (!r.Read())
        {
            return new NotificationPreferencesModel
            {
                DiscordUserId = discordUserId.ToString(),
                BudgetAlerts = true,
                CalendarDm = true,
                WeeklyDigest = true,
            };
        }

        return new NotificationPreferencesModel
        {
            DiscordUserId = discordUserId.ToString(),
            BudgetAlerts = r.GetInt32(0) == 1,
            CalendarDm = r.GetInt32(1) == 1,
            WeeklyDigest = r.GetInt32(2) == 1,
        };
    }

    public void Save(NotificationPreferencesModel prefs)
    {
        if (!ulong.TryParse(prefs.DiscordUserId, out var uid) || uid == 0)
            throw new ArgumentException("discordUserId required.");

        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO NotificationPreferences (DiscordUserId, BudgetAlerts, CalendarDm, WeeklyDigest)
            VALUES ($d, $b, $c, $w)
            ON CONFLICT(DiscordUserId) DO UPDATE SET
                BudgetAlerts = $b, CalendarDm = $c, WeeklyDigest = $w";
        cmd.Parameters.AddWithValue("$d", uid.ToString());
        cmd.Parameters.AddWithValue("$b", prefs.BudgetAlerts ? 1 : 0);
        cmd.Parameters.AddWithValue("$c", prefs.CalendarDm ? 1 : 0);
        cmd.Parameters.AddWithValue("$w", prefs.WeeklyDigest ? 1 : 0);
        cmd.ExecuteNonQuery();
    }

    public bool ShouldReceive(ulong discordUserId, string kind) =>
        kind switch
        {
            "budget_alerts" => Get(discordUserId).BudgetAlerts,
            "calendar_dm" => Get(discordUserId).CalendarDm,
            "weekly_digest" => Get(discordUserId).WeeklyDigest,
            _ => true,
        };

    /// <summary>Discord user ids known to the household (web accounts + saved prefs).</summary>
    public List<ulong> ListHouseholdDiscordUserIds()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT DiscordUserId FROM WebUsers WHERE DiscordUserId IS NOT NULL AND DiscordUserId != '' AND DiscordUserId != '0'
            UNION
            SELECT DiscordUserId FROM NotificationPreferences WHERE DiscordUserId != '' AND DiscordUserId != '0'";
        using var r = cmd.ExecuteReader();
        var set = new HashSet<ulong>();
        while (r.Read())
        {
            var raw = r.GetString(0);
            if (ulong.TryParse(raw, out var uid) && uid != 0)
                set.Add(uid);
        }

        return set.ToList();
    }
}

public sealed class NotificationPreferencesModel
{
    public string DiscordUserId { get; set; } = "";
    public bool BudgetAlerts { get; set; } = true;
    public bool CalendarDm { get; set; } = true;
    public bool WeeklyDigest { get; set; } = true;
}
