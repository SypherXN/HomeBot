using Microsoft.Data.Sqlite;
using Discord;

/// <summary>
/// Domain logic for wishlist querying, persistence, and undo support.
/// </summary>
public class WishlistService
{
    private readonly DatabaseService _db;
    private readonly UndoService _undo;

    public WishlistService(DatabaseService db, UndoService undo)
    {
        _db = db;
        _undo = undo;
    }

    /// <summary>
    /// Builds the filtered and paginated wishlist UI payload.
    /// </summary>
    public async Task<(Embed embed, MessageComponent components)> BuildWishlist(
        ulong? owner = null,
        string tag = "",
        string sort = "",
        int page = 0)
    {
        var result = GetWishlist(owner, tag, sort, page);
        var rows = result.Items.Select(FormatDiscordRow).ToList();
        var ids = result.Items.Select(x => x.Id).ToList();

        var embed = ListUIBuilder.BuildEmbed("🎁 Wishlist", rows);

        var components = ListUIBuilder.BuildButtons(
            ids,
            "wishlist",
            page,
            result.HasNext,
            result.HasPrev
        );

        return (embed, components);
    }

    /// <summary>
    /// Returns filtered wishlist data for API and UI adapters.
    /// </summary>
    public PagedResult<WishlistListItemModel> GetWishlist(
        ulong? owner = null,
        string tag = "",
        string sort = "",
        int page = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        // --- Get page size from config ---
        int pageSize = 5;

        var configCmd = conn.CreateCommand();
        configCmd.CommandText = "SELECT Value FROM Settings WHERE Key = 'page_size'";
        var result = configCmd.ExecuteScalar();

        if (result != null && int.TryParse(result.ToString(), out int parsed))
            pageSize = parsed;

        var cmd = conn.CreateCommand();

        var conditions = new List<string> { "Status = 'active'" };

        if (owner.HasValue)
        {
            conditions.Add("Owner = $owner");
            cmd.Parameters.AddWithValue("$owner", (long)owner.Value);
        }

        if (!string.IsNullOrWhiteSpace(tag))
        {
            var cleanTag = tag.Replace("#", "").ToLower();
            conditions.Add("(',' || Tags || ',') LIKE $tag");
            cmd.Parameters.AddWithValue("$tag", $"%,{cleanTag},%");
        }

        var orderBy = sort switch
        {
            "priority" => "CASE WHEN Priority IS NULL OR Priority = '' THEN 999 ELSE CAST(Priority AS INTEGER) END",
            "price" => "CAST(REPLACE(Price, '$', '') AS REAL)",
            _ => "Id"
        };

        cmd.CommandText = $@"
            SELECT Id, Name, Owner, Price, Link, Notes, Priority, Tags, PurchasedBy
            FROM WishlistItems
            WHERE {string.Join(" AND ", conditions)}
            ORDER BY {orderBy}";

        using var reader = cmd.ExecuteReader();

        var allItems = new List<WishlistListItemModel>();

        while (reader.Read())
        {
            var rawTags = reader.IsDBNull(7) ? "" : reader.GetString(7);
            var tagsList = rawTags
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(t => t.Trim().ToLower())
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .ToList();

            allItems.Add(new WishlistListItemModel
            {
                Id = reader.GetInt32(0),
                Name = reader.GetString(1),
                Owner = (ulong)reader.GetInt64(2),
                Price = reader.IsDBNull(3) ? "" : reader.GetString(3),
                Link = reader.IsDBNull(4) ? "" : reader.GetString(4),
                Notes = reader.IsDBNull(5) ? "" : reader.GetString(5),
                Priority = reader.IsDBNull(6) ? "" : reader.GetString(6),
                Tags = tagsList,
                PurchasedBy = reader.IsDBNull(8) ? null : (ulong?)reader.GetInt64(8)
            });
        }

        // --- PAGINATION ---
        var paged = allItems
            .Skip(page * pageSize)
            .Take(pageSize)
            .ToList();

        bool hasNext = allItems.Count > (page + 1) * pageSize;
        bool hasPrev = page > 0;

        return new PagedResult<WishlistListItemModel>
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
    /// Inserts a new wishlist item.
    /// </summary>
    public void AddItem(
        string name,
        ulong owner,
        string price,
        string link,
        string description,
        string notes,
        string priority,
        string tags)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var normalizedTags = string.Join(",",
            tags.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(t => t.Trim().ToLower().Replace("#", ""))
                .Distinct()
        );

        var cmd = conn.CreateCommand();

        cmd.CommandText = @"
        INSERT INTO WishlistItems 
        (Name, Owner, Price, Link, Description, Notes, Priority, Tags, Status)
        VALUES ($name, $owner, $price, $link, $desc, $notes, $priority, $tags, 'active')";

        cmd.Parameters.AddWithValue("$name", name);
        cmd.Parameters.AddWithValue("$owner", (long)owner);
        cmd.Parameters.AddWithValue("$price", price);
        cmd.Parameters.AddWithValue("$link", link);
        cmd.Parameters.AddWithValue("$desc", description);
        cmd.Parameters.AddWithValue("$notes", notes);
        cmd.Parameters.AddWithValue("$priority", priority);
        cmd.Parameters.AddWithValue("$tags", normalizedTags);

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Returns one wishlist item for detailed view output.
    /// </summary>
    public WishlistItemDetailModel? GetItem(int id)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Name, Owner, Price, Link, Description, Notes, Priority
            FROM WishlistItems
            WHERE Id = $id";

        cmd.Parameters.AddWithValue("$id", id);

        using var reader = cmd.ExecuteReader();

        if (!reader.Read())
            return null;

        return new WishlistItemDetailModel
        {
            Name = reader.GetString(0),
            Owner = (ulong)reader.GetInt64(1),
            Price = reader.IsDBNull(2) ? "" : reader.GetString(2),
            Link = reader.IsDBNull(3) ? "" : reader.GetString(3),
            Description = reader.IsDBNull(4) ? "" : reader.GetString(4),
            Notes = reader.IsDBNull(5) ? "" : reader.GetString(5),
            Priority = reader.IsDBNull(6) ? "" : reader.GetString(6)
        };
    }

    /// <summary>
    /// Marks an item as complete and writes undo history in one transaction.
    /// </summary>
    public void MarkComplete(int id, ulong userId)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        using var transaction = conn.BeginTransaction();

        var getCmd = conn.CreateCommand();
        getCmd.Transaction = transaction;

        getCmd.CommandText = @"
            SELECT Status, PurchasedBy
            FROM WishlistItems
            WHERE Id = $id";

        getCmd.Parameters.AddWithValue("$id", id);

        using var reader = getCmd.ExecuteReader();

        if (!reader.Read())
            return;

        var previous = new WishlistCompleteUndoModel
        {
            Status = reader.GetString(0),
            PurchasedBy = reader.IsDBNull(1) ? null : (ulong?)reader.GetInt64(1)
        };

        reader.Close();

        var json = System.Text.Json.JsonSerializer.Serialize(previous);

        var logCmd = conn.CreateCommand();
        logCmd.Transaction = transaction;

        logCmd.CommandText = @"
            INSERT INTO ActionLog (UserId, ActionType, EntityType, EntityId, Data)
            VALUES ($userId, 'complete', 'wishlist', $id, $data)";

        logCmd.Parameters.AddWithValue("$userId", (long)userId);
        logCmd.Parameters.AddWithValue("$id", id);
        logCmd.Parameters.AddWithValue("$data", json);

        logCmd.ExecuteNonQuery();

        var updateCmd = conn.CreateCommand();
        updateCmd.Transaction = transaction;

        updateCmd.CommandText = @"
            UPDATE WishlistItems 
            SET Status = 'completed', PurchasedBy = $userId 
            WHERE Id = $id";

        updateCmd.Parameters.AddWithValue("$id", id);
        updateCmd.Parameters.AddWithValue("$userId", (long)userId);

        updateCmd.ExecuteNonQuery();

        transaction.Commit();
    }

    /// <summary>
    /// Deletes an item and writes restore data for undo.
    /// </summary>
    public void DeleteItem(int id, ulong userId)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        using var transaction = conn.BeginTransaction();

        var getCmd = conn.CreateCommand();
        getCmd.Transaction = transaction;

        getCmd.CommandText = @"
            SELECT Name, Owner, Price, Link, Description, Notes, Priority, Tags, PurchasedBy, Status
            FROM WishlistItems
            WHERE Id = $id";

        getCmd.Parameters.AddWithValue("$id", id);

        using var reader = getCmd.ExecuteReader();

        if (!reader.Read())
            return;

        var model = new WishlistUndoModel
        {
            Name = reader.GetString(0),
            Owner = (ulong)reader.GetInt64(1),
            Price = reader.IsDBNull(2) ? "" : reader.GetString(2),
            Link = reader.IsDBNull(3) ? "" : reader.GetString(3),
            Description = reader.IsDBNull(4) ? "" : reader.GetString(4),
            Notes = reader.IsDBNull(5) ? "" : reader.GetString(5),
            Priority = reader.IsDBNull(6) ? "" : reader.GetString(6),
            Tags = reader.IsDBNull(7) ? "" : reader.GetString(7),
            PurchasedBy = reader.IsDBNull(8) ? null : (ulong?)reader.GetInt64(8),
            Status = reader.IsDBNull(9) ? "active" : reader.GetString(9)
        };

        reader.Close();

        var json = System.Text.Json.JsonSerializer.Serialize(model);

        var logCmd = conn.CreateCommand();
        logCmd.Transaction = transaction;

        logCmd.CommandText = @"
            INSERT INTO ActionLog (UserId, ActionType, EntityType, EntityId, Data)
            VALUES ($userId, 'delete', 'wishlist', $id, $data)";

        logCmd.Parameters.AddWithValue("$userId", (long)userId);
        logCmd.Parameters.AddWithValue("$id", id);
        logCmd.Parameters.AddWithValue("$data", json);

        logCmd.ExecuteNonQuery();

        var deleteCmd = conn.CreateCommand();
        deleteCmd.Transaction = transaction;

        deleteCmd.CommandText = "DELETE FROM WishlistItems WHERE Id = $id";
        deleteCmd.Parameters.AddWithValue("$id", id);

        deleteCmd.ExecuteNonQuery();

        transaction.Commit();
    }

    /// <summary>
    /// Deletes all completed wishlist items.
    /// </summary>
    public void ClearCompleted()
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM WishlistItems WHERE Status = 'completed'";
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Applies partial updates to editable wishlist fields.
    /// </summary>
    public void EditItem(
        int id,
        string name,
        ulong? owner,
        string price,
        string link,
        string description,
        string notes,
        string priority,
        string tags)
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

        if (owner.HasValue)
        {
            updates.Add("Owner = $owner");
            cmd.Parameters.AddWithValue("$owner", (long)owner.Value);
        }

        if (!string.IsNullOrWhiteSpace(price))
        {
            updates.Add("Price = $price");
            cmd.Parameters.AddWithValue("$price", price);
        }

        if (!string.IsNullOrWhiteSpace(link))
        {
            updates.Add("Link = $link");
            cmd.Parameters.AddWithValue("$link", link);
        }

        if (!string.IsNullOrWhiteSpace(description))
        {
            updates.Add("Description = $desc");
            cmd.Parameters.AddWithValue("$desc", description);
        }

        if (!string.IsNullOrWhiteSpace(notes))
        {
            updates.Add("Notes = $notes");
            cmd.Parameters.AddWithValue("$notes", notes);
        }

        if (!string.IsNullOrWhiteSpace(priority))
        {
            updates.Add("Priority = $priority");
            cmd.Parameters.AddWithValue("$priority", priority);
        }

        if (!string.IsNullOrWhiteSpace(tags))
        {
            var normalizedTags = string.Join(",",
                tags.Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(t => t.Trim().ToLower().Replace("#", ""))
                    .Distinct()
            );

            updates.Add("Tags = $tags");
            cmd.Parameters.AddWithValue("$tags", normalizedTags);
        }

        if (updates.Count == 0)
            return;

        cmd.CommandText = $@"
            UPDATE WishlistItems 
            SET {string.Join(", ", updates)}
            WHERE Id = $id";

        cmd.Parameters.AddWithValue("$id", id);

        cmd.ExecuteNonQuery();
    }

    private static string FormatDiscordRow(WishlistListItemModel item)
    {
        var line = $"**#{item.Id} {item.Name}** | 👤 <@{item.Owner}>";

        if (!string.IsNullOrWhiteSpace(item.Price))
            line += $" | 💲 {item.Price}";

        if (!string.IsNullOrWhiteSpace(item.Priority))
            line += $" | ⭐ {item.Priority}";

        if (item.Tags.Count > 0)
        {
            var formattedTags = string.Join(" ", item.Tags.Select(t => $"#{t}"));
            line += $" | 🏷 {formattedTags}";
        }

        if (item.PurchasedBy.HasValue)
            line += $" | ✔ <@{item.PurchasedBy.Value}>";

        return line;
    }
}