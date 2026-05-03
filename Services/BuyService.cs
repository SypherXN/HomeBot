using Microsoft.Data.Sqlite;

/// <summary>
/// Domain logic for building, updating, and deleting buy list entries.
/// </summary>
public class BuyService
{
    private const string BuyTagsCatalogKey = "buy_allowed_tags";
    private const int MaxCatalogTags = 48;
    private const int MaxTagTokenLength = 48;

    private readonly DatabaseService _db;
    private readonly UndoService _undo;
    private readonly ConfigService _config;

    public BuyService(DatabaseService db, UndoService undo, ConfigService config)
    {
        _db = db;
        _undo = undo;
        _config = config;
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

        var normalizedTags = NormalizeTagsForPersistence(tags);

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

        var catalog = GetBuyTagCatalog();
        if (!string.IsNullOrWhiteSpace(tag))
        {
            var cleanTag = tag.Replace("#", "", StringComparison.Ordinal).Trim().ToLowerInvariant();
            if (catalog.Count == 0 ||
                catalog.Any(c => string.Equals(c, cleanTag, StringComparison.OrdinalIgnoreCase)))
            {
                conditions.Add("(',' || Tags || ',') LIKE $tag");
                cmd.Parameters.AddWithValue("$tag", $"%,{cleanTag},%");
            }
        }

        var sortKey = string.IsNullOrWhiteSpace(sort) ? "" : sort.Trim().ToLowerInvariant();
        var orderBy = sortKey switch
        {
            "id" => "Id",
            "store" => "Store",
            "assigned" => "AssignedTo",
            "created" => "CreatedAt",
            "name" => "Name",
            "tags" => "Tags",
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

            var rowAssignedTo = reader.IsDBNull(4) ? null : (ulong?)reader.GetInt64(4);
            var rowPurchasedBy = reader.IsDBNull(7) ? null : (ulong?)reader.GetInt64(7);

            allItems.Add(new BuyListItemModel
            {
                Id = reader.GetInt32(0),
                Name = reader.IsDBNull(1) ? "(no name)" : reader.GetString(1),
                Quantity = reader.IsDBNull(2) ? "1" : reader.GetString(2),
                Store = reader.IsDBNull(3) ? "" : reader.GetString(3),
                AssignedTo = rowAssignedTo,
                AssignedToMemberLabel = HouseholdIdentity.MemberLabel(rowAssignedTo),
                Tags = tagsList,
                Notes = reader.IsDBNull(6) ? "" : reader.GetString(6),
                PurchasedBy = rowPurchasedBy,
                PurchasedByMemberLabel = HouseholdIdentity.MemberLabel(rowPurchasedBy)
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
        getCmd.CommandText = @"
            SELECT Name, Quantity, Store, AssignedTo, Tags, Notes, CreatedBy, PurchasedBy, Status
            FROM BuyItems
            WHERE Id = $id";
        getCmd.Parameters.AddWithValue("$id", id);

        BuyUndoModel? payload = null;
        using (var reader = getCmd.ExecuteReader())
        {
            if (!reader.Read())
                return;

            payload = new BuyUndoModel
            {
                Name = reader.IsDBNull(0) ? "" : reader.GetString(0),
                Quantity = reader.IsDBNull(1) ? "1" : reader.GetString(1),
                Store = reader.IsDBNull(2) ? "" : reader.GetString(2),
                AssignedTo = reader.IsDBNull(3) ? null : (ulong?)reader.GetInt64(3),
                Tags = reader.IsDBNull(4) ? "" : reader.GetString(4),
                Notes = reader.IsDBNull(5) ? "" : reader.GetString(5),
                CreatedBy = reader.IsDBNull(6) ? null : (ulong?)reader.GetInt64(6),
                PurchasedBy = reader.IsDBNull(7) ? null : (ulong?)reader.GetInt64(7),
                Status = reader.IsDBNull(8) ? "active" : reader.GetString(8)
            };
        }

        var json = System.Text.Json.JsonSerializer.Serialize(payload);

        // Log after the reader is disposed so LogAction can open its own connection without SQLite blocking.
        _undo.LogAction(userId, "delete", "buy", id, json);

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
            var normalizedTags = NormalizeTagsForPersistence(tags);

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

    /// <summary>
    /// Allowed buy tags for the household (stored as CSV in Settings). When empty, any normalized tag is accepted.
    /// </summary>
    public IReadOnlyList<string> GetBuyTagCatalog()
    {
        var raw = _config.Get(BuyTagsCatalogKey);
        if (string.IsNullOrWhiteSpace(raw))
            return Array.Empty<string>();

        return raw
            .Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(t => t.Trim().ToLowerInvariant().Replace("#", "", StringComparison.Ordinal))
            .Where(t => t.Length > 0 && t.Length <= MaxTagTokenLength)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(t => t, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// Replaces the buy tag catalog (lowercase tokens, letters/digits/hyphen/underscore only).
    /// </summary>
    public void SetBuyTagCatalog(IReadOnlyList<string> tags)
    {
        var normalized = new List<string>();
        foreach (var t in tags)
        {
            var s = t.Trim().ToLowerInvariant().Replace("#", "", StringComparison.Ordinal);
            if (s.Length == 0 || s.Length > MaxTagTokenLength)
                continue;
            if (!s.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_'))
                continue;
            if (!normalized.Contains(s, StringComparer.Ordinal))
                normalized.Add(s);
            if (normalized.Count >= MaxCatalogTags)
                break;
        }

        normalized.Sort(StringComparer.Ordinal);
        var value = string.Join(",", normalized);
        _config.Set(BuyTagsCatalogKey, value);
    }

    /// <summary>
    /// When the catalog is non-empty, only those tags are kept. Otherwise all normalized tokens are kept.
    /// </summary>
    private string NormalizeTagsForPersistence(string tags)
    {
        var parts = tags
            .Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(t => t.Trim().ToLowerInvariant().Replace("#", "", StringComparison.Ordinal))
            .Where(t => !string.IsNullOrWhiteSpace(t) && t.Length <= MaxTagTokenLength)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var catalog = GetBuyTagCatalog();
        if (catalog.Count == 0)
            return string.Join(",", parts);

        var allowed = new HashSet<string>(catalog, StringComparer.Ordinal);
        return string.Join(",", parts.Where(p => allowed.Contains(p)));
    }

}