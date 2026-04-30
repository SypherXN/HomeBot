using Microsoft.Data.Sqlite;
using System.Text.Json;

/// <summary>
/// Stores and retrieves user actions that can be reverted, and applies undo operations.
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

    /// <summary>
    /// Reverts the last undoable action for the user, or returns a structured failure.
    /// </summary>
    public UndoApplyResult ApplyLastUndo(ulong userId)
    {
        var action = GetLastAction(userId);

        if (action == null)
            return UndoApplyResult.NothingToUndo();

        var (type, entityRaw, id, data) = action.Value;
        var entity = entityRaw.Trim().ToLower();
        var applied = false;

        // Do not call DeleteLastAction while this connection is open — a second
        // connection to the same SQLite file can deadlock under default locking.
        using (var conn = _db.GetConnection())
        {
            conn.Open();

            try
            {
            if (entity == "buy")
            {
                if (type == "delete")
                {
                    var item = JsonSerializer.Deserialize<BuyUndoModel>(data);

                    if (item == null)
                        return UndoApplyResult.Fail("❌ Failed to restore buy item.");

                    var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        INSERT INTO BuyItems
                        (Id, Name, Quantity, Store, AssignedTo, Tags, Notes, CreatedBy, PurchasedBy, Status)
                        VALUES
                        ($id, $name, $quantity, $store, $assignedTo, $tags, $notes, $createdBy, $purchasedBy, $status)";

                    cmd.Parameters.AddWithValue("$id", id);
                    cmd.Parameters.AddWithValue("$name", item.Name);
                    cmd.Parameters.AddWithValue("$quantity", item.Quantity);
                    cmd.Parameters.AddWithValue("$store", item.Store);
                    cmd.Parameters.AddWithValue("$tags", item.Tags);
                    cmd.Parameters.AddWithValue("$notes", item.Notes);
                    cmd.Parameters.AddWithValue("$status", item.Status);

                    if (item.AssignedTo.HasValue)
                        cmd.Parameters.AddWithValue("$assignedTo", (long)item.AssignedTo.Value);
                    else
                        cmd.Parameters.AddWithValue("$assignedTo", DBNull.Value);

                    if (item.CreatedBy.HasValue)
                        cmd.Parameters.AddWithValue("$createdBy", (long)item.CreatedBy.Value);
                    else
                        cmd.Parameters.AddWithValue("$createdBy", DBNull.Value);

                    if (item.PurchasedBy.HasValue)
                        cmd.Parameters.AddWithValue("$purchasedBy", (long)item.PurchasedBy.Value);
                    else
                        cmd.Parameters.AddWithValue("$purchasedBy", DBNull.Value);

                    cmd.ExecuteNonQuery();
                    applied = true;
                }
                else if (type == "complete")
                {
                    var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        UPDATE BuyItems 
                        SET Status = 'active', PurchasedBy = NULL 
                        WHERE Id = $id";

                    cmd.Parameters.AddWithValue("$id", id);
                    cmd.ExecuteNonQuery();
                    applied = true;
                }
            }
            else if (entity == "wishlist")
            {
                if (type == "delete")
                {
                    var item = JsonSerializer.Deserialize<WishlistUndoModel>(data);

                    if (item == null)
                        return UndoApplyResult.Fail("❌ Failed to restore item.");

                    var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        INSERT INTO WishlistItems 
                        (Id, Name, Owner, Price, Link, Description, Notes, Priority, Tags, PurchasedBy, Status)
                        VALUES ($id, $name, $owner, $price, $link, $desc, $notes, $priority, $tags, $purchasedBy, $status)";

                    cmd.Parameters.AddWithValue("$id", id);
                    cmd.Parameters.AddWithValue("$name", item.Name);
                    cmd.Parameters.AddWithValue("$owner", (long)item.Owner);
                    cmd.Parameters.AddWithValue("$price", item.Price);
                    cmd.Parameters.AddWithValue("$link", item.Link);
                    cmd.Parameters.AddWithValue("$desc", item.Description);
                    cmd.Parameters.AddWithValue("$notes", item.Notes);
                    cmd.Parameters.AddWithValue("$priority", item.Priority);
                    cmd.Parameters.AddWithValue("$tags", item.Tags);
                    cmd.Parameters.AddWithValue("$status", item.Status);

                    if (item.PurchasedBy == null)
                        cmd.Parameters.AddWithValue("$purchasedBy", DBNull.Value);
                    else
                        cmd.Parameters.AddWithValue("$purchasedBy", (long)item.PurchasedBy.Value);

                    cmd.ExecuteNonQuery();
                    applied = true;
                }
                else if (type == "complete")
                {
                    var previous = JsonSerializer.Deserialize<WishlistCompleteUndoModel>(data);

                    if (previous == null)
                        return UndoApplyResult.Fail("❌ Failed to undo complete.");

                    var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        UPDATE WishlistItems 
                        SET Status = $status, PurchasedBy = $purchasedBy 
                        WHERE Id = $id";

                    cmd.Parameters.AddWithValue("$id", id);
                    cmd.Parameters.AddWithValue("$status", previous.Status);

                    if (previous.PurchasedBy == null)
                        cmd.Parameters.AddWithValue("$purchasedBy", DBNull.Value);
                    else
                        cmd.Parameters.AddWithValue("$purchasedBy", (long)previous.PurchasedBy);

                    cmd.ExecuteNonQuery();
                    applied = true;
                }
            }
            else if (entity == "money")
            {
                if (type == "delete")
                {
                    var item = JsonSerializer.Deserialize<MoneyUndoModel>(data);

                    if (item == null)
                        return UndoApplyResult.Fail("❌ Failed to restore transaction.");

                    var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        INSERT INTO Transactions 
                        (Id, Name, Description, Notes, Amount, AmountInput, PaidBy, OwedBy, Type, CreatedAt)
                        VALUES ($id, $name, $desc, $notes, $amount, $input, $paidBy, $owedBy, $type, CURRENT_TIMESTAMP)";

                    cmd.Parameters.AddWithValue("$id", id);
                    cmd.Parameters.AddWithValue("$name", item.Name);
                    cmd.Parameters.AddWithValue("$desc", item.Description);
                    cmd.Parameters.AddWithValue("$notes", item.Notes);
                    cmd.Parameters.AddWithValue("$amount", item.Amount);
                    cmd.Parameters.AddWithValue("$input", item.AmountInput);
                    cmd.Parameters.AddWithValue("$paidBy", (long)item.PaidBy);
                    cmd.Parameters.AddWithValue("$owedBy", (long)item.OwedBy);
                    cmd.Parameters.AddWithValue("$type", item.Type);

                    cmd.ExecuteNonQuery();
                    applied = true;
                }
                else if (type == "create")
                {
                    var cmd = conn.CreateCommand();
                    cmd.CommandText = "DELETE FROM Transactions WHERE Id = $id";
                    cmd.Parameters.AddWithValue("$id", id);

                    cmd.ExecuteNonQuery();
                    applied = true;
                }
            }
            else if (entity == "calendar")
            {
                if (type == "delete")
                {
                    var item = JsonSerializer.Deserialize<CalendarDeleteUndoModel>(data);
                    if (item == null)
                        return UndoApplyResult.Fail("❌ Failed to restore calendar item.");

                    var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        INSERT INTO CalendarItems
                        (Id, Title, Type, StartDateTime, EndDateTime, AllDay, AssignedTo, Description, Notes, Link, ReminderOffset, Recurrence, Timezone, Status)
                        VALUES ($id, $title, $type, $start, $end, $allDay, $assigned, $desc, $notes, $link, $reminder, $recurrence, $timezone, $status)";

                    cmd.Parameters.AddWithValue("$id", id);
                    cmd.Parameters.AddWithValue("$title", item.Title);
                    cmd.Parameters.AddWithValue("$type", item.Type);
                    cmd.Parameters.AddWithValue("$start", item.Start);
                    cmd.Parameters.AddWithValue("$end", item.End);
                    cmd.Parameters.AddWithValue("$allDay", item.AllDay);

                    if (item.Assigned == null)
                        cmd.Parameters.AddWithValue("$assigned", DBNull.Value);
                    else
                        cmd.Parameters.AddWithValue("$assigned", (long)item.Assigned.Value);

                    cmd.Parameters.AddWithValue("$desc", item.Description);
                    cmd.Parameters.AddWithValue("$notes", item.Notes);
                    cmd.Parameters.AddWithValue("$link", item.Link);
                    cmd.Parameters.AddWithValue("$reminder", item.ReminderOffset);
                    cmd.Parameters.AddWithValue("$recurrence", item.Recurrence);
                    cmd.Parameters.AddWithValue("$timezone", item.Timezone);
                    cmd.Parameters.AddWithValue("$status", item.Status);

                    cmd.ExecuteNonQuery();
                    applied = true;
                }
                else if (type == "complete")
                {
                    var prev = JsonSerializer.Deserialize<CalendarCompleteUndoModel>(data);
                    if (prev == null)
                        return UndoApplyResult.Fail("❌ Failed to undo calendar complete.");

                    var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        UPDATE CalendarItems
                        SET Status = $status
                        WHERE Id = $id";

                    cmd.Parameters.AddWithValue("$id", id);
                    cmd.Parameters.AddWithValue("$status", prev.Status);

                    cmd.ExecuteNonQuery();
                    applied = true;
                }
            }

                if (!applied)
                    return UndoApplyResult.Fail("❌ Nothing to undo for that action.");
            }
            catch (Exception)
            {
                return UndoApplyResult.Fail("❌ Undo failed.");
            }
        }

        DeleteLastAction(userId);
        return UndoApplyResult.Ok();
    }
}
