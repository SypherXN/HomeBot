using Microsoft.Data.Sqlite;

/// <summary>
/// Stores and retrieves user actions that can be reverted.
/// </summary>
public class UndoService
{
    private readonly DatabaseService _db;

    public UndoService(DatabaseService db)
    {
        _db = db;
    }

    /// <summary>
    /// Persists one undo action record.
    /// </summary>
    public void LogAction(ulong userId, string actionType, string entityType, int entityId, string data)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();

        cmd.CommandText = @"
            INSERT INTO ActionLog (UserId, ActionType, EntityType, EntityId, Data)
            VALUES ($userId, $actionType, $entityType, $entityId, $data)";

        cmd.Parameters.AddWithValue("$userId", (long)userId);
        cmd.Parameters.AddWithValue("$actionType", actionType);
        cmd.Parameters.AddWithValue("$entityType", entityType.Trim().ToLower());
        cmd.Parameters.AddWithValue("$entityId", entityId);

        cmd.Parameters.AddWithValue("$data", data is null ? "" : data.ToString());

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Returns the latest undo action for the specified user.
    /// </summary>
    public (string actionType, string entityType, int entityId, string data)? GetLastAction(ulong userId)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT ActionType, EntityType, EntityId, Data
            FROM ActionLog
            WHERE UserId = $userId
            ORDER BY Id DESC
            LIMIT 1";

        cmd.Parameters.AddWithValue("$userId", (long)userId);

        using var reader = cmd.ExecuteReader();

        if (!reader.Read())
            return null;

        return (
            reader.GetString(0),
            reader.GetString(1),
            reader.GetInt32(2),
            reader.GetString(3)
        );
    }

    /// <summary>
    /// Deletes the most recent undo action for the specified user.
    /// </summary>
    public void DeleteLastAction(ulong userId)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            DELETE FROM ActionLog
            WHERE Id = (
                SELECT Id FROM ActionLog
                WHERE UserId = $userId
                ORDER BY Id DESC
                LIMIT 1
            )";

        cmd.Parameters.AddWithValue("$userId", (long)userId);
        cmd.ExecuteNonQuery();
    }
}