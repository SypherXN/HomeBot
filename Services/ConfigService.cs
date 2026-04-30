using Microsoft.Data.Sqlite;

/// <summary>
/// Handles key-value application settings stored in SQLite.
/// </summary>
public class ConfigService
{
    private readonly DatabaseService _db;

    public ConfigService(DatabaseService db)
    {
        _db = db;
    }

    /// <summary>
    /// Creates or updates a configuration setting.
    /// </summary>
    public void Set(string key, string value)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO Settings (Key, Value)
            VALUES ($key, $value)
            ON CONFLICT(Key) DO UPDATE SET Value = $value";

        cmd.Parameters.AddWithValue("$key", key);
        cmd.Parameters.AddWithValue("$value", value);

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Returns one configuration value by key.
    /// </summary>
    public string? Get(string key)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Value FROM Settings WHERE Key = $key";
        cmd.Parameters.AddWithValue("$key", key);

        var result = cmd.ExecuteScalar();

        return result?.ToString();
    }

    /// <summary>
    /// Returns all configuration key-value pairs.
    /// </summary>
    public Dictionary<string, string> GetAll()
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Key, Value FROM Settings";

        using var reader = cmd.ExecuteReader();

        var dict = new Dictionary<string, string>();

        while (reader.Read())
        {
            dict[reader.GetString(0)] = reader.GetString(1);
        }

        return dict;
    }
}