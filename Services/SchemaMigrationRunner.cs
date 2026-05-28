using Microsoft.Data.Sqlite;

/// <summary>
/// Applies versioned, additive SQLite schema migrations tracked in <c>SchemaMigrations</c>.
/// </summary>
public static class SchemaMigrationRunner
{
    public sealed record Migration(string Id, Action<SqliteConnection> Apply);

    public static void Run(SqliteConnection conn, IReadOnlyList<Migration> migrations, Action<string>? log = null)
    {
        EnsureRegistry(conn);

        var applied = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using (var listCmd = conn.CreateCommand())
        {
            listCmd.CommandText = "SELECT Id FROM SchemaMigrations";
            using var reader = listCmd.ExecuteReader();
            while (reader.Read())
                applied.Add(reader.GetString(0));
        }

        foreach (var m in migrations)
        {
            if (applied.Contains(m.Id))
                continue;

            log?.Invoke($"Applying schema migration: {m.Id}");
            using var tx = conn.BeginTransaction();
            try
            {
                m.Apply(conn);
                using var ins = conn.CreateCommand();
                ins.Transaction = tx;
                ins.CommandText =
                    "INSERT INTO SchemaMigrations (Id, AppliedAt) VALUES ($id, $at)";
                ins.Parameters.AddWithValue("$id", m.Id);
                ins.Parameters.AddWithValue("$at", DateTime.UtcNow.ToString("o"));
                ins.ExecuteNonQuery();
                tx.Commit();
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }
    }

    private static void EnsureRegistry(SqliteConnection conn)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS SchemaMigrations (
                Id TEXT PRIMARY KEY,
                AppliedAt TEXT NOT NULL
            );";
        cmd.ExecuteNonQuery();
    }

    /// <summary>Idempotent ALTER ADD COLUMN (ignores duplicate column).</summary>
    public static void TryAddColumn(SqliteConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        try
        {
            cmd.ExecuteNonQuery();
        }
        catch (SqliteException ex) when (
            ex.Message.Contains("duplicate column name", StringComparison.OrdinalIgnoreCase))
        {
        }
    }

    public static void Execute(SqliteConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }
}
