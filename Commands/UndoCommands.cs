using Discord.Interactions;

/// <summary>
/// Provides undo support for recent actions across bot modules.
/// </summary>
public class UndoCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly UndoService _undo;
    private readonly DatabaseService _db;
    private readonly MoneyService _money;

    public UndoCommands(UndoService undo, DatabaseService db, MoneyService money)
    {
        _undo = undo;
        _db = db;
        _money = money;
    }

    /// <summary>
    /// Reverts the last undoable action for the current user.
    /// </summary>
    [SlashCommand("undo", "Undo last action")]
    public async Task Undo()
    {
        var action = _undo.GetLastAction(Context.User.Id);

        if (action == null)
        {
            await RespondAsync("Nothing to undo.");
            return;
        }

        var (type, entityRaw, id, data) = action.Value;

        string entity = entityRaw.Trim().ToLower();

        using var conn = _db.GetConnection();
        conn.Open();

        try
        {
            // ================= BUY =================
            if (entity == "buy")
            {
                if (type == "delete")
                {
                    var item = System.Text.Json.JsonSerializer.Deserialize<BuyUndoModel>(data);

                    if (item == null)
                    {
                        await RespondAsync("❌ Failed to restore buy item.");
                        return;
                    }

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
                }
            }

            // ================= WISHLIST =================
            else if (entity == "wishlist")
            {
                if (type == "delete")
                {
                    var item = System.Text.Json.JsonSerializer.Deserialize<WishlistUndoModel>(data);

                    if (item == null)
                    {
                        await RespondAsync("❌ Failed to restore item.");
                        return;
                    }

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
                }
                else if (type == "complete")
                {
                    var previous = System.Text.Json.JsonSerializer.Deserialize<WishlistCompleteUndoModel>(data);

                    if (previous == null)
                    {
                        await RespondAsync("❌ Failed to undo complete.");
                        return;
                    }

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
                }
            }

            // ================= MONEY =================
            else if (entity == "money")
            {
                if (type == "delete")
                {
                    var item = System.Text.Json.JsonSerializer.Deserialize<MoneyUndoModel>(data);

                    if (item == null)
                    {
                        await RespondAsync("❌ Failed to restore transaction.");
                        return;
                    }

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
                }
                else if (type == "create")
                {
                    var cmd = conn.CreateCommand();
                    cmd.CommandText = "DELETE FROM Transactions WHERE Id = $id";
                    cmd.Parameters.AddWithValue("$id", id);

                    cmd.ExecuteNonQuery();
                }
            }
            else if (entity == "calendar")
            {
                if (type == "delete")
                {
                    var item = System.Text.Json.JsonSerializer.Deserialize<CalendarDeleteUndoModel>(data);
                    if (item == null)
                    {
                        await RespondAsync("❌ Failed to restore calendar item.");
                        return;
                    }

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
                }
                else if (type == "complete")
                {
                    var prev = System.Text.Json.JsonSerializer.Deserialize<CalendarCompleteUndoModel>(data);
                    if (prev == null)
                    {
                        await RespondAsync("❌ Failed to undo calendar complete.");
                        return;
                    }

                    var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        UPDATE CalendarItems
                        SET Status = $status
                        WHERE Id = $id";

                    cmd.Parameters.AddWithValue("$id", id);
                    cmd.Parameters.AddWithValue("$status", prev.Status);

                    cmd.ExecuteNonQuery();
                }
            }

            _undo.DeleteLastAction(Context.User.Id);

            // Refresh money UI (safe default)
            var result = await _money.BuildTransactions();
            await RespondAsync(embed: result.embed, components: result.components);
        }
        catch (Exception)
        {
            await RespondAsync("❌ Undo failed.");
        }
    }
}