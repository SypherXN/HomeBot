using Microsoft.Data.Sqlite;

/// <summary>
/// Persists and resolves command feature to Discord channel bindings.
/// </summary>
public class ChannelBindingService
{
    private readonly DatabaseService _db;

    public ChannelBindingService(DatabaseService db)
    {
        _db = db;
    }

    /// <summary>
    /// Creates or updates the bound channel for a feature.
    /// </summary>
    public void SetChannel(string feature, ulong channelId)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO ChannelBindings (Feature, ChannelId)
            VALUES ($feature, $channelId)
            ON CONFLICT(Feature) DO UPDATE SET ChannelId = $channelId";

        cmd.Parameters.AddWithValue("$feature", feature);
        cmd.Parameters.AddWithValue("$channelId", (long)channelId);

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Gets the configured channel id for a feature, if present.
    /// </summary>
    public ulong? GetChannel(string feature)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT ChannelId FROM ChannelBindings WHERE Feature = $feature";
        cmd.Parameters.AddWithValue("$feature", feature);

        var result = cmd.ExecuteScalar();

        return result != null ? (ulong?)(long)result : null;
    }

    /// <summary>
    /// Gets all configured feature channel bindings.
    /// </summary>
    public Dictionary<string, ulong> GetAll()
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Feature, ChannelId FROM ChannelBindings";

        using var reader = cmd.ExecuteReader();

        var dict = new Dictionary<string, ulong>();

        while (reader.Read())
        {
            dict[reader.GetString(0)] = (ulong)reader.GetInt64(1);
        }

        return dict;
    }
}