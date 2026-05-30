using System.Globalization;
using Microsoft.Data.Sqlite;

/// <summary>Persistent household audit log (web sign-ins, admin actions, etc.).</summary>
public sealed class HouseholdAuditService
{
    private readonly DatabaseService _db;

    public HouseholdAuditService(DatabaseService db)
    {
        _db = db;
    }

    public void Log(string category, string action, ulong? actorUserId, string? actorUsername, string? detail)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO HouseholdAuditLog (Category, Action, ActorUserId, ActorUsername, Detail)
            VALUES ($c, $a, $u, $n, $d)";
        cmd.Parameters.AddWithValue("$c", category.Trim());
        cmd.Parameters.AddWithValue("$a", action.Trim());
        cmd.Parameters.AddWithValue("$u", actorUserId.HasValue ? (long)actorUserId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("$n", (object?)actorUsername ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$d", (object?)detail ?? DBNull.Value);
        cmd.ExecuteNonQuery();
    }

    public List<HouseholdAuditEntryModel> GetRecent(int limit = 100)
    {
        limit = Math.Clamp(limit, 1, 500);
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Category, Action, ActorUserId, ActorUsername, Detail, CreatedAt
            FROM HouseholdAuditLog ORDER BY Id DESC LIMIT $lim";
        cmd.Parameters.AddWithValue("$lim", limit);
        using var r = cmd.ExecuteReader();
        var list = new List<HouseholdAuditEntryModel>();
        while (r.Read())
        {
            list.Add(new HouseholdAuditEntryModel
            {
                Id = r.GetInt32(0),
                Category = r.GetString(1),
                Action = r.GetString(2),
                ActorUserId = r.IsDBNull(3) ? null : (ulong)r.GetInt64(3),
                ActorUsername = r.IsDBNull(4) ? null : r.GetString(4),
                Detail = r.IsDBNull(5) ? null : r.GetString(5),
                CreatedAt = r.GetString(6),
            });
        }

        return list;
    }
}

public sealed class HouseholdAuditEntryModel
{
    public int Id { get; set; }
    public string Category { get; set; } = "";
    public string Action { get; set; } = "";
    public ulong? ActorUserId { get; set; }
    public string? ActorUsername { get; set; }
    public string? Detail { get; set; }
    public string CreatedAt { get; set; } = "";
}
