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
                    var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        INSERT INTO BuyItems (Id, Name, Status)
                        VALUES ($id, $name, 'active')";

                    cmd.Parameters.AddWithValue("$id", id);
                    cmd.Parameters.AddWithValue("$name", data);

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
                        (Name, Owner, Price, Link, Description, Notes, Priority, Tags, Status)
                        VALUES ($name, $owner, $price, $link, $desc, $notes, $priority, $tags, 'active')";

                    cmd.Parameters.AddWithValue("$name", item.Name);
                    cmd.Parameters.AddWithValue("$owner", (long)item.Owner);
                    cmd.Parameters.AddWithValue("$price", item.Price);
                    cmd.Parameters.AddWithValue("$link", item.Link);
                    cmd.Parameters.AddWithValue("$desc", item.Description);
                    cmd.Parameters.AddWithValue("$notes", item.Notes);
                    cmd.Parameters.AddWithValue("$priority", item.Priority);
                    cmd.Parameters.AddWithValue("$tags", item.Tags);

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
                        (Name, Description, Notes, Amount, AmountInput, PaidBy, OwedBy, Type, CreatedAt)
                        VALUES ($name, $desc, $notes, $amount, $input, $paidBy, $owedBy, $type, CURRENT_TIMESTAMP)";

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
                    var item = System.Text.Json.JsonSerializer.Deserialize<dynamic>(data);

                    var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        INSERT INTO CalendarItems
                        (Title, Type, StartDateTime, EndDateTime, AllDay, AssignedTo, Description, Notes, Status)
                        VALUES ($title, $type, $start, $end, $allDay, $assigned, $desc, $notes, 'active')";

                    cmd.Parameters.AddWithValue("$title", (string)item.Title);
                    cmd.Parameters.AddWithValue("$type", (string)item.Type);
                    cmd.Parameters.AddWithValue("$start", (string)item.Start);
                    cmd.Parameters.AddWithValue("$end", (string)item.End);
                    cmd.Parameters.AddWithValue("$allDay", (int)item.AllDay);

                    if (item.Assigned == null)
                        cmd.Parameters.AddWithValue("$assigned", DBNull.Value);
                    else
                        cmd.Parameters.AddWithValue("$assigned", (long)item.Assigned);

                    cmd.Parameters.AddWithValue("$desc", (string)item.Description);
                    cmd.Parameters.AddWithValue("$notes", (string)item.Notes);

                    cmd.ExecuteNonQuery();
                }
                else if (type == "complete")
                {
                    var prev = System.Text.Json.JsonSerializer.Deserialize<dynamic>(data);

                    var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        UPDATE CalendarItems
                        SET Status = $status
                        WHERE Id = $id";

                    cmd.Parameters.AddWithValue("$id", id);
                    cmd.Parameters.AddWithValue("$status", (string)prev.Status);

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