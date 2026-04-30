using Discord;
using Microsoft.Data.Sqlite;

/// <summary>
/// Domain logic for building, updating, and deleting buy list entries.
/// </summary>
public class BuyService
{
    private readonly DatabaseService _db;
    private readonly UndoService _undo;

    public BuyService(DatabaseService db, UndoService undo)
    {
        _db = db;
        _undo = undo;
    }

    /// <summary>
    /// Adds a buy item after normalizing optional fields.
    /// </summary>
    public void AddItem(
        string name,
        string quantity,
        string store,
        ulong? assignedTo,
        string tags,
        string notes,
        ulong createdBy)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var finalQuantity = string.IsNullOrWhiteSpace(quantity) ? "1" : quantity;

        var normalizedTags = string.Join(",",
            tags.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(t => t.Trim().ToLower().Replace("#", ""))
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Distinct()
        );

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
        INSERT INTO BuyItems 
        (Name, Quantity, Store, AssignedTo, Tags, Notes, CreatedBy, Status)
        VALUES ($name, $quantity, $store, $assignedTo, $tags, $notes, $createdBy, 'active');";

        cmd.Parameters.AddWithValue("$name", name);
        cmd.Parameters.AddWithValue("$quantity", finalQuantity);
        cmd.Parameters.AddWithValue("$store", store);

        if (assignedTo.HasValue)
            cmd.Parameters.AddWithValue("$assignedTo", (long)assignedTo.Value);
        else
            cmd.Parameters.AddWithValue("$assignedTo", DBNull.Value);

        cmd.Parameters.AddWithValue("$tags", normalizedTags);
        cmd.Parameters.AddWithValue("$notes", notes);
        cmd.Parameters.AddWithValue("$createdBy", (long)createdBy);

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Builds the filtered and paginated buy list UI payload.
    /// </summary>
    public async Task<(Embed embed, MessageComponent components)> BuildBuyList(
        ulong? assignedTo = null,
        string store = "",
        string tag = "",
        string sort = "",
        int page = 0)
    {
        var result = GetBuyList(assignedTo, store, tag, sort, page);
        var rows = result.Items.Select(FormatDiscordRow).ToList();
        var ids = result.Items.Select(x => x.Id).ToList();

        var embed = ListUIBuilder.BuildEmbed("🛒 Things To Buy", rows);
        var components = ListUIBuilder.BuildButtons(ids, "buy", page, result.HasNext, result.HasPrev);

        return (embed, components);
    }

    /// <summary>
    /// Returns a filtered and paginated buy list result for API and UI adapters.
    /// </summary>
    public PagedResult<BuyListItemModel> GetBuyList(
        ulong? assignedTo = null,
        string store = "",
        string tag = "",
        string sort = "",
        int page = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var configConn = _db.GetConnection();
        configConn.Open();

        int pageSize = 5;

        var configCmd = configConn.CreateCommand();
        configCmd.CommandText = "SELECT Value FROM Settings WHERE Key = 'page_size'";
        var result = configCmd.ExecuteScalar();

        if (result != null && int.TryParse(result.ToString(), out int parsed))
            pageSize = parsed;

        var cmd = conn.CreateCommand();

        var conditions = new List<string> { "Status = 'active'" };

        if (assignedTo.HasValue)
        {
            conditions.Add("AssignedTo = $assignedTo");
            cmd.Parameters.AddWithValue("$assignedTo", (long)assignedTo.Value);
        }

        if (!string.IsNullOrWhiteSpace(store))
        {
            conditions.Add("LOWER(Store) LIKE LOWER($store)");
            cmd.Parameters.AddWithValue("$store", $"%{store}%");
        }

        if (!string.IsNullOrWhiteSpace(tag))
        {
            var cleanTag = tag.Replace("#", "").ToLower();
            conditions.Add("(',' || Tags || ',') LIKE $tag");
            cmd.Parameters.AddWithValue("$tag", $"%,{cleanTag},%");
        }

        var orderBy = sort switch
        {
            "store" => "Store",
            "assigned" => "AssignedTo",
            "created" => "CreatedAt",
            _ => "Id"
        };

        cmd.CommandText = $@"
            SELECT Id, Name, Quantity, Store, AssignedTo, Tags, Notes, PurchasedBy
            FROM BuyItems
            WHERE {string.Join(" AND ", conditions)}
            ORDER BY {orderBy}";

        using var reader = cmd.ExecuteReader();

        var allItems = new List<BuyListItemModel>();

        while (reader.Read())
        {
            var rawTags = reader.IsDBNull(5) ? "" : reader.GetString(5);
            var tagsList = rawTags
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(t => t.Trim().ToLower())
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .ToList();

            allItems.Add(new BuyListItemModel
            {
                Id = reader.GetInt32(0),
                Name = reader.IsDBNull(1) ? "(no name)" : reader.GetString(1),
                Quantity = reader.IsDBNull(2) ? "1" : reader.GetString(2),
                Store = reader.IsDBNull(3) ? "" : reader.GetString(3),
                AssignedTo = reader.IsDBNull(4) ? null : (ulong?)reader.GetInt64(4),
                Tags = tagsList,
                Notes = reader.IsDBNull(6) ? "" : reader.GetString(6),
                PurchasedBy = reader.IsDBNull(7) ? null : (ulong?)reader.GetInt64(7)
            });
        }

        var paged = allItems
            .Skip(page * pageSize)
            .Take(pageSize)
            .ToList();

        bool hasNext = allItems.Count > (page + 1) * pageSize;
        bool hasPrev = page > 0;

        return new PagedResult<BuyListItemModel>
        {
            Items = paged,
            Page = page,
            PageSize = pageSize,
            TotalCount = allItems.Count,
            HasNext = hasNext,
            HasPrev = hasPrev
        };
    }

    /// <summary>
    /// Marks a buy item as completed and logs undo metadata.
    /// </summary>
    public void CompleteItem(int id, ulong userId)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        _undo.LogAction(userId, "complete", "buy", id, "");

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE BuyItems 
            SET Status = 'completed', PurchasedBy = $userId 
            WHERE Id = $id";

        cmd.Parameters.AddWithValue("$id", id);
        cmd.Parameters.AddWithValue("$userId", (long)userId);

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Deletes a buy item and logs enough data to restore it.
    /// </summary>
    public void DeleteItem(int id, ulong userId)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        // Save data before deleting
        var getCmd = conn.CreateCommand();
        getCmd.CommandText = "SELECT Name FROM BuyItems WHERE Id = $id";
        getCmd.Parameters.AddWithValue("$id", id);

        var name = getCmd.ExecuteScalar()?.ToString() ?? "";

        // Log action
        _undo.LogAction(userId, "delete", "buy", id, name);

        var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM BuyItems WHERE Id = $id";
        cmd.Parameters.AddWithValue("$id", id);

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Deletes all completed buy items.
    /// </summary>
    public void ClearCompleted()
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM BuyItems WHERE Status = 'completed'";
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Applies partial updates to a buy item and returns false when no changes were provided.
    /// </summary>
    public bool EditItem(
        int id,
        string name,
        string quantity,
        string store,
        ulong? assignedTo,
        string tags,
        string notes)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var updates = new List<string>();
        var cmd = conn.CreateCommand();

        if (!string.IsNullOrWhiteSpace(name))
        {
            updates.Add("Name = $name");
            cmd.Parameters.AddWithValue("$name", name);
        }

        if (!string.IsNullOrWhiteSpace(quantity))
        {
            updates.Add("Quantity = $quantity");
            cmd.Parameters.AddWithValue("$quantity", quantity);
        }

        if (!string.IsNullOrWhiteSpace(store))
        {
            updates.Add("Store = $store");
            cmd.Parameters.AddWithValue("$store", store);
        }

        if (assignedTo.HasValue)
        {
            updates.Add("AssignedTo = $assignedTo");
            cmd.Parameters.AddWithValue("$assignedTo", (long)assignedTo.Value);
        }

        if (!string.IsNullOrWhiteSpace(tags))
        {
            var normalizedTags = string.Join(",",
                tags.Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(t => t.Trim().ToLower().Replace("#", ""))
                    .Where(t => !string.IsNullOrWhiteSpace(t))
            );

            updates.Add("Tags = $tags");
            cmd.Parameters.AddWithValue("$tags", normalizedTags);
        }

        if (!string.IsNullOrWhiteSpace(notes))
        {
            updates.Add("Notes = $notes");
            cmd.Parameters.AddWithValue("$notes", notes);
        }

        if (updates.Count == 0)
            return false;

        cmd.CommandText = $@"
            UPDATE BuyItems 
            SET {string.Join(", ", updates)} 
            WHERE Id = $id";

        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();

        return true;
    }

    private static string FormatDiscordRow(BuyListItemModel item)
    {
        string FormatCell(string value, int width)
        {
            if (string.IsNullOrWhiteSpace(value))
                value = "-";

            if (value.Length > width)
                return value.Substring(0, width - 3) + "...";

            return value.PadRight(width);
        }

        var assigned = item.AssignedTo.HasValue ? $"<@{item.AssignedTo.Value}>" : "anyone";
        var storeDisplay = string.IsNullOrWhiteSpace(item.Store) ? "-" : item.Store;

        var line =
            $"`{item.Id.ToString().PadRight(3)}` " +
            $"{FormatCell(item.Name, 18)} " +
            $"📦 {FormatCell(item.Quantity, 8)} " +
            $"🏬 {FormatCell(storeDisplay, 10)} " +
            $"👤 {assigned}";

        if (item.Tags.Count > 0)
        {
            var formattedTags = string.Join(" ", item.Tags.Select(t => $"#{t}"));
            line += $" | 🏷 {formattedTags}";
        }

        if (!string.IsNullOrWhiteSpace(item.Notes))
            line += $" | 📝 {item.Notes}";

        if (item.PurchasedBy.HasValue)
            line += $" | ✔ <@{item.PurchasedBy.Value}>";

        return line;
    }
}