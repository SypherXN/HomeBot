using System.Globalization;
using Microsoft.Data.Sqlite;

/// <summary>
/// Recurring buy-list templates that re-add items on a schedule.
/// </summary>
public sealed class BuyRecurringService
{
    private readonly DatabaseService _db;
    private readonly BuyService _buy;

    public BuyRecurringService(DatabaseService db, BuyService buy)
    {
        _db = db;
        _buy = buy;
    }

    public IReadOnlyList<BuyRecurringItemModel> List(bool activeOnly = true)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = activeOnly
            ? "SELECT * FROM BuyRecurringItems WHERE IsActive = 1 ORDER BY NextDueDate ASC, Id ASC"
            : "SELECT * FROM BuyRecurringItems ORDER BY IsActive DESC, NextDueDate ASC, Id ASC";
        return ReadAll(cmd);
    }

    public int Create(BuyRecurringItemCreateModel model, ulong actor)
    {
        var cadence = NormalizeCadence(model.Cadence);
        var nextDue = NormalizeDate(model.NextDueDate);

        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BuyRecurringItems
            (Name, Quantity, Store, AssignedTo, Tags, Notes, Cadence, NextDueDate, CreatedBy)
            VALUES ($n, $q, $s, $a, $t, $notes, $c, $due, $by)";
        BindItemParams(cmd, model.Name, model.Quantity, model.Store, model.AssignedTo, model.Tags, model.Notes);
        cmd.Parameters.AddWithValue("$c", cadence);
        cmd.Parameters.AddWithValue("$due", nextDue);
        cmd.Parameters.AddWithValue("$by", (long)actor);
        cmd.ExecuteNonQuery();
        return ReadLastId(conn);
    }

    public bool Update(int id, BuyRecurringItemUpdateModel model)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE BuyRecurringItems SET
                Name = COALESCE($n, Name),
                Quantity = COALESCE($q, Quantity),
                Store = COALESCE($s, Store),
                AssignedTo = CASE WHEN $hasA = 1 THEN $a ELSE AssignedTo END,
                Tags = COALESCE($t, Tags),
                Notes = COALESCE($notes, Notes),
                Cadence = COALESCE($c, Cadence),
                NextDueDate = COALESCE($due, NextDueDate),
                IsActive = COALESCE($active, IsActive)
            WHERE Id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.Parameters.AddWithValue("$n", (object?)model.Name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$q", (object?)model.Quantity ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$s", (object?)model.Store ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$hasA", model.AssignedTo.HasValue ? 1 : 0);
        if (model.AssignedTo.HasValue)
            cmd.Parameters.AddWithValue("$a", (long)model.AssignedTo.Value);
        else
            cmd.Parameters.AddWithValue("$a", DBNull.Value);
        cmd.Parameters.AddWithValue("$t", (object?)model.Tags ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$notes", (object?)model.Notes ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$c", model.Cadence == null ? DBNull.Value : NormalizeCadence(model.Cadence));
        cmd.Parameters.AddWithValue("$due", model.NextDueDate == null ? DBNull.Value : NormalizeDate(model.NextDueDate));
        cmd.Parameters.AddWithValue("$active", model.IsActive.HasValue ? (model.IsActive.Value ? 1 : 0) : DBNull.Value);
        return cmd.ExecuteNonQuery() > 0;
    }

    public bool Deactivate(int id) => Update(id, new BuyRecurringItemUpdateModel { IsActive = false });

    /// <summary>Processes due recurring items and advances their next due date.</summary>
    public int ProcessDueItems()
    {
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var due = List(activeOnly: true).Where(i => string.CompareOrdinal(i.NextDueDate, today) <= 0).ToList();
        var count = 0;

        foreach (var item in due)
        {
            _buy.AddItem(
                item.Name,
                item.Quantity ?? "1",
                item.Store ?? "",
                item.AssignedTo,
                item.Tags ?? "",
                item.Notes ?? "",
                item.CreatedBy ?? 0);

            var next = AdvanceDate(item.NextDueDate, item.Cadence);
            Update(item.Id, new BuyRecurringItemUpdateModel { NextDueDate = next });
            count++;
        }

        return count;
    }

    public async Task StartWorkerAsync(CancellationToken ct = default)
    {
        var pollMinutes = ReadPollMinutes();
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var n = ProcessDueItems();
                if (n > 0)
                    Console.WriteLine($"ℹ️ Buy recurring: added {n} item(s) to the buy list.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠️ Buy recurring worker error: {ex.Message}");
            }

            try
            {
                await Task.Delay(TimeSpan.FromMinutes(pollMinutes), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private static int ReadPollMinutes()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_BUY_RECURRING_POLL_MINUTES");
        if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
            return Math.Clamp(n, 5, 1440);
        return 60;
    }

    private static string AdvanceDate(string date, string cadence)
    {
        if (!DateTime.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            d = DateTime.UtcNow.Date;
        d = cadence == "daily" ? d.AddDays(1) : d.AddDays(7);
        return d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static string NormalizeCadence(string? cadence)
    {
        var c = (cadence ?? "weekly").Trim().ToLowerInvariant();
        return c == "daily" ? "daily" : "weekly";
    }

    private static string NormalizeDate(string? date)
    {
        if (!string.IsNullOrWhiteSpace(date) &&
            DateTime.TryParseExact(date.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
        {
            return d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        return DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static void BindItemParams(
        SqliteCommand cmd,
        string name,
        string? quantity,
        string? store,
        ulong? assignedTo,
        string? tags,
        string? notes)
    {
        cmd.Parameters.AddWithValue("$n", name.Trim());
        cmd.Parameters.AddWithValue("$q", string.IsNullOrWhiteSpace(quantity) ? "1" : quantity.Trim());
        cmd.Parameters.AddWithValue("$s", store ?? "");
        if (assignedTo.HasValue)
            cmd.Parameters.AddWithValue("$a", (long)assignedTo.Value);
        else
            cmd.Parameters.AddWithValue("$a", DBNull.Value);
        cmd.Parameters.AddWithValue("$t", tags ?? "");
        cmd.Parameters.AddWithValue("$notes", notes ?? "");
    }

    private static int ReadLastId(SqliteConnection conn)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT last_insert_rowid()";
        return Convert.ToInt32(cmd.ExecuteScalar(), CultureInfo.InvariantCulture);
    }

    private static List<BuyRecurringItemModel> ReadAll(SqliteCommand cmd)
    {
        using var r = cmd.ExecuteReader();
        var list = new List<BuyRecurringItemModel>();
        while (r.Read())
        {
            list.Add(new BuyRecurringItemModel
            {
                Id = r.GetInt32(r.GetOrdinal("Id")),
                Name = r.GetString(r.GetOrdinal("Name")),
                Quantity = r.IsDBNull(r.GetOrdinal("Quantity")) ? null : r.GetString(r.GetOrdinal("Quantity")),
                Store = r.IsDBNull(r.GetOrdinal("Store")) ? null : r.GetString(r.GetOrdinal("Store")),
                AssignedTo = r.IsDBNull(r.GetOrdinal("AssignedTo")) ? null : (ulong)r.GetInt64(r.GetOrdinal("AssignedTo")),
                Tags = r.IsDBNull(r.GetOrdinal("Tags")) ? null : r.GetString(r.GetOrdinal("Tags")),
                Notes = r.IsDBNull(r.GetOrdinal("Notes")) ? null : r.GetString(r.GetOrdinal("Notes")),
                Cadence = r.GetString(r.GetOrdinal("Cadence")),
                NextDueDate = r.GetString(r.GetOrdinal("NextDueDate")),
                IsActive = r.GetInt32(r.GetOrdinal("IsActive")) == 1,
                CreatedBy = r.IsDBNull(r.GetOrdinal("CreatedBy")) ? null : (ulong)r.GetInt64(r.GetOrdinal("CreatedBy")),
                CreatedAt = r.GetString(r.GetOrdinal("CreatedAt")),
            });
        }

        return list;
    }
}

public sealed class BuyRecurringItemModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Quantity { get; set; }
    public string? Store { get; set; }
    public ulong? AssignedTo { get; set; }
    public string? Tags { get; set; }
    public string? Notes { get; set; }
    public string Cadence { get; set; } = "weekly";
    public string NextDueDate { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public ulong? CreatedBy { get; set; }
    public string CreatedAt { get; set; } = "";
}

public sealed class BuyRecurringItemCreateModel
{
    public string Name { get; set; } = "";
    public string? Quantity { get; set; }
    public string? Store { get; set; }
    public ulong? AssignedTo { get; set; }
    public string? Tags { get; set; }
    public string? Notes { get; set; }
    public string? Cadence { get; set; }
    public string? NextDueDate { get; set; }
}

public sealed class BuyRecurringItemUpdateModel
{
    public string? Name { get; set; }
    public string? Quantity { get; set; }
    public string? Store { get; set; }
    public ulong? AssignedTo { get; set; }
    public string? Tags { get; set; }
    public string? Notes { get; set; }
    public string? Cadence { get; set; }
    public string? NextDueDate { get; set; }
    public bool? IsActive { get; set; }
}
