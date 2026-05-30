using Microsoft.Data.Sqlite;

/// <summary>
/// Unified household search across buy, wishlist, budget, and calendar domains.
/// </summary>
public sealed class SearchService
{
    private readonly DatabaseService _db;
    private readonly BuyService _buy;
    private readonly WishlistService _wishlist;
    private readonly BudgetService _budget;

    public SearchService(
        DatabaseService db,
        BuyService buy,
        WishlistService wishlist,
        BudgetService budget)
    {
        _db = db;
        _buy = buy;
        _wishlist = wishlist;
        _budget = budget;
    }

    public SearchResultModel Search(string query, int limitPerDomain = 5)
    {
        var q = query.Trim();
        limitPerDomain = Math.Clamp(limitPerDomain, 1, 20);

        if (q.Length < 2)
        {
            return new SearchResultModel
            {
                Query = q,
                Buy = [],
                Wishlist = [],
                Budget = [],
                Calendar = [],
            };
        }

        var like = $"%{EscapeLike(q)}%";

        return new SearchResultModel
        {
            Query = q,
            Buy = SearchBuy(like, limitPerDomain),
            Wishlist = SearchWishlist(like, limitPerDomain),
            Budget = SearchBudget(like, limitPerDomain),
            Calendar = SearchCalendar(like, limitPerDomain),
        };
    }

    private static string EscapeLike(string input) =>
        input.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("%", "\\%", StringComparison.Ordinal);

    private List<SearchHitModel> SearchBuy(string like, int limit)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Name, COALESCE(Store, ''), COALESCE(Tags, '')
            FROM BuyItems
            WHERE Status = 'active'
              AND (Name LIKE $q ESCAPE '\' OR Store LIKE $q ESCAPE '\' OR Tags LIKE $q ESCAPE '\')
            ORDER BY Id DESC
            LIMIT $lim";
        cmd.Parameters.AddWithValue("$q", like);
        cmd.Parameters.AddWithValue("$lim", limit);
        return ReadHits(cmd, "buy", id =>
        {
            var page = _buy.FindDefaultListPageForItem(id);
            return page > 0 ? $"/buy?page={page}&highlight={id}" : $"/buy?highlight={id}";
        });
    }

    private List<SearchHitModel> SearchWishlist(string like, int limit)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Name, COALESCE(Description, ''), COALESCE(Tags, '')
            FROM WishlistItems
            WHERE Status = 'active'
              AND (Name LIKE $q ESCAPE '\' OR Description LIKE $q ESCAPE '\' OR Tags LIKE $q ESCAPE '\')
            ORDER BY Id DESC
            LIMIT $lim";
        cmd.Parameters.AddWithValue("$q", like);
        cmd.Parameters.AddWithValue("$lim", limit);
        return ReadHits(cmd, "wishlist", id =>
        {
            var page = _wishlist.FindDefaultListPageForItem(id);
            return page > 0 ? $"/wishlist?page={page}&highlight={id}" : $"/wishlist?highlight={id}";
        });
    }

    private List<SearchHitModel> SearchBudget(string like, int limit)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT t.Id, COALESCE(t.Merchant, ''), COALESCE(t.Note, ''), COALESCE(c.Name, ''), t.TransactionDate
            FROM BudgetTransactions t
            LEFT JOIN BudgetCategories c ON c.Id = t.CategoryId
            WHERE t.Merchant LIKE $q ESCAPE '\'
               OR t.Note LIKE $q ESCAPE '\'
               OR c.Name LIKE $q ESCAPE '\'
            ORDER BY t.TransactionDate DESC, t.Id DESC
            LIMIT $lim";
        cmd.Parameters.AddWithValue("$q", like);
        cmd.Parameters.AddWithValue("$lim", limit);
        using var r = cmd.ExecuteReader();
        var list = new List<SearchHitModel>();
        while (r.Read())
        {
            var id = r.GetInt32(0);
            var merchant = r.GetString(1);
            var note = r.GetString(2);
            var cat = r.GetString(3);
            var txDate = r.IsDBNull(4) ? "" : r.GetString(4);
            var label = !string.IsNullOrWhiteSpace(merchant) ? merchant : note;
            if (string.IsNullOrWhiteSpace(label)) label = cat;
            if (string.IsNullOrWhiteSpace(label)) label = $"Transaction #{id}";
            var month = txDate.Length >= 7 ? txDate[..7] : null;
            var page = _budget.FindTransactionPage(id, month);
            var path = page > 0
                ? $"/budget?tab=ledger&page={page}&highlight={id}"
                : $"/budget?tab=ledger&highlight={id}";
            list.Add(new SearchHitModel
            {
                Domain = "budget",
                Id = id,
                Title = label.Trim(),
                Subtitle = string.IsNullOrWhiteSpace(cat) ? null : cat,
                Path = path,
            });
        }

        return list;
    }

    private List<SearchHitModel> SearchCalendar(string like, int limit)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Title, COALESCE(Description, ''), COALESCE(StartDateTime, '')
            FROM CalendarItems
            WHERE Status = 'active'
              AND (Title LIKE $q ESCAPE '\' OR Description LIKE $q ESCAPE '\' OR Notes LIKE $q ESCAPE '\')
            ORDER BY StartDateTime ASC
            LIMIT $lim";
        cmd.Parameters.AddWithValue("$q", like);
        cmd.Parameters.AddWithValue("$lim", limit);
        return ReadHits(cmd, "calendar", id =>
        {
            var date = ReadCalendarAnchorDate(id);
            return string.IsNullOrEmpty(date)
                ? $"/calendar?highlight={id}"
                : $"/calendar?highlight={id}&date={date}";
        }, subtitleIndex: 2, extraSubtitleIndex: 3);
    }

    private string? ReadCalendarAnchorDate(int calendarItemId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT StartDateTime FROM CalendarItems WHERE Id = $id";
        cmd.Parameters.AddWithValue("$id", calendarItemId);
        var raw = cmd.ExecuteScalar() as string;
        if (string.IsNullOrWhiteSpace(raw))
            return null;
        return raw.Length >= 10 ? raw[..10] : null;
    }

    private static List<SearchHitModel> ReadHits(
        SqliteCommand cmd,
        string domain,
        Func<int, string> pathFor,
        int subtitleIndex = 2,
        int extraSubtitleIndex = -1)
    {
        using var r = cmd.ExecuteReader();
        var list = new List<SearchHitModel>();
        while (r.Read())
        {
            var id = r.GetInt32(0);
            var title = r.GetString(1);
            var sub = r.GetString(subtitleIndex);
            var extra = extraSubtitleIndex >= 0 ? r.GetString(extraSubtitleIndex) : "";
            list.Add(new SearchHitModel
            {
                Domain = domain,
                Id = id,
                Title = title,
                Subtitle = string.IsNullOrWhiteSpace(sub) ? (string.IsNullOrWhiteSpace(extra) ? null : extra) : sub,
                Path = pathFor(id),
            });
        }

        return list;
    }
}

public sealed class SearchResultModel
{
    public string Query { get; set; } = "";
    public List<SearchHitModel> Buy { get; set; } = [];
    public List<SearchHitModel> Wishlist { get; set; } = [];
    public List<SearchHitModel> Budget { get; set; } = [];
    public List<SearchHitModel> Calendar { get; set; } = [];
}

public sealed class SearchHitModel
{
    public string Domain { get; set; } = "";
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string? Subtitle { get; set; }
    public string Path { get; set; } = "/";
}
