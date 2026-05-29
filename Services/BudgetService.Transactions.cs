using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;

public partial class BudgetService
{
    public PagedResult<BudgetTransactionListItemModel> GetTransactions(
        int page = 0,
        string? month = null,
        ulong? spentByUserId = null,
        int? categoryId = null,
        string? scope = null,
        string? merchant = null,
        string? noteContains = null,
        double? amountMin = null,
        double? amountMax = null,
        string? tag = null,
        int? accountId = null)
    {
        var m = NormalizeMonth(month);
        var all = LoadAllTransactions();
        IEnumerable<BudgetTransactionListItemModel> q = all;

        q = q.Where(t => MonthContainsDate(m, t.TransactionDate));

        if (spentByUserId.HasValue && spentByUserId.Value != 0)
            q = q.Where(t => t.SpentByUserId == spentByUserId.Value || t.Splits.Any(s => s.SpentByUserId == spentByUserId));

        if (categoryId.HasValue)
            q = q.Where(t => t.CategoryId == categoryId || t.Splits.Any(s => s.CategoryId == categoryId));

        if (scope != "all")
            q = q.Where(t => string.IsNullOrEmpty(t.CategoryName) ||
                             !PersonalCategoryNames.Contains(t.CategoryName));

        if (!string.IsNullOrWhiteSpace(merchant))
            q = q.Where(t => (t.Merchant ?? "").Contains(merchant, StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(noteContains))
            q = q.Where(t => (t.Note ?? "").Contains(noteContains, StringComparison.OrdinalIgnoreCase));

        if (amountMin.HasValue)
            q = q.Where(t => EffectiveAmount(t) >= amountMin.Value);

        if (amountMax.HasValue)
            q = q.Where(t => EffectiveAmount(t) <= amountMax.Value);

        if (!string.IsNullOrWhiteSpace(tag))
            q = q.Where(t => t.Tags.Any(x => x.Equals(tag, StringComparison.OrdinalIgnoreCase)));

        if (accountId.HasValue)
            q = q.Where(t => t.AccountId == accountId);

        var list = q.OrderByDescending(t => t.TransactionDate).ThenByDescending(t => t.Id).ToList();

        using var conn = _db.GetConnection();
        conn.Open();
        var pageSize = GetPageSize(conn);
        var paged = list.Skip(page * pageSize).Take(pageSize).ToList();

        return new PagedResult<BudgetTransactionListItemModel>
        {
            Items = paged,
            Page = page,
            PageSize = pageSize,
            TotalCount = list.Count,
            HasNext = list.Count > (page + 1) * pageSize,
            HasPrev = page > 0
        };
    }

    private HashSet<string> PersonalCategoryNames
    {
        get
        {
            return GetCategories().Where(c => c.Visibility == "personal").Select(c => c.Name)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static double EffectiveAmount(BudgetTransactionListItemModel t) =>
        t.Splits.Count > 0 ? t.Splits.Sum(s => s.Amount) : t.Amount;

    public int CreateTransaction(
        string type,
        string amountInput,
        int? categoryId,
        ulong spentByUserId,
        string transactionDate,
        string? note,
        string? merchant,
        int? accountId,
        bool isPending,
        string currency,
        double exchangeRateToHome,
        List<BudgetTransactionSplitModel>? splits,
        List<string>? tags,
        ulong actor)
    {
        var amount = EvaluateAmount(amountInput);
        if (amount <= 0 && type != "transfer")
            throw new ArgumentException("Amount must be positive.");

        using var conn = _db.GetConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        var accId = accountId ?? GetDefaultAccountId(conn);
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            INSERT INTO BudgetTransactions
            (Type, Amount, AmountInput, CategoryId, SpentByUserId, AccountId, Note, Merchant,
             TransactionDate, IsPending, Currency, ExchangeRateToHome)
            VALUES ($type, $amt, $input, $cat, $user, $acc, $note, $merchant, $date, $pend, $cur, $rate)";
        cmd.Parameters.AddWithValue("$type", type);
        cmd.Parameters.AddWithValue("$amt", amount);
        cmd.Parameters.AddWithValue("$input", amountInput);
        cmd.Parameters.AddWithValue("$cat", (object?)categoryId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$user", (long)spentByUserId);
        cmd.Parameters.AddWithValue("$acc", accId);
        cmd.Parameters.AddWithValue("$note", (object?)note ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$merchant", (object?)merchant ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$date", transactionDate);
        cmd.Parameters.AddWithValue("$pend", isPending ? 1 : 0);
        cmd.Parameters.AddWithValue("$cur", string.IsNullOrWhiteSpace(currency) ? "USD" : currency.Trim().ToUpperInvariant());
        cmd.Parameters.AddWithValue("$rate", exchangeRateToHome <= 0 ? 1 : exchangeRateToHome);
        cmd.ExecuteNonQuery();

        var id = ReadLastId(conn);
        if (splits is { Count: > 0 })
            SaveSplits(conn, tx, id, splits);
        if (tags is { Count: > 0 })
            SaveTags(conn, tx, id, tags);

        ApplyAccountDelta(conn, tx, accId, type, amount, null);
        tx.Commit();

        _undo.LogAction(actor, "create", "budget", id, "");
        Audit(actor, "transaction", id, "create");
        return id;
    }

    public int CreateTransfer(
        string amountInput,
        int fromAccountId,
        int toAccountId,
        string transactionDate,
        string? note,
        ulong actor)
    {
        var amount = EvaluateAmount(amountInput);
        using var conn = _db.GetConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            INSERT INTO BudgetTransactions
            (Type, Amount, AmountInput, SpentByUserId, AccountId, TransferToAccountId, Note, TransactionDate)
            VALUES ('transfer', $amt, $input, $user, $from, $to, $note, $date)";
        cmd.Parameters.AddWithValue("$amt", amount);
        cmd.Parameters.AddWithValue("$input", amountInput);
        cmd.Parameters.AddWithValue("$user", (long)actor);
        cmd.Parameters.AddWithValue("$from", fromAccountId);
        cmd.Parameters.AddWithValue("$to", toAccountId);
        cmd.Parameters.AddWithValue("$note", (object?)note ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$date", transactionDate);
        cmd.ExecuteNonQuery();
        var id = ReadLastId(conn);
        ApplyAccountDelta(conn, tx, fromAccountId, "transfer_out", amount, toAccountId);
        ApplyAccountDelta(conn, tx, toAccountId, "transfer_in", amount, fromAccountId);
        tx.Commit();
        Audit(actor, "transaction", id, "transfer");
        return id;
    }

    public bool UpdateTransaction(
        int id,
        string? amountInput,
        int? categoryId,
        ulong? spentByUserId,
        string? transactionDate,
        string? note,
        string? merchant,
        bool? isPending,
        string? clearedAt,
        List<BudgetTransactionSplitModel>? splits,
        List<string>? tags,
        int? accountId,
        bool applyAccountId,
        ulong actor)
    {
        var existing = GetTransactionById(id);
        if (existing == null)
            return false;

        using var conn = _db.GetConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        double? amount = null;
        if (!string.IsNullOrWhiteSpace(amountInput))
            amount = EvaluateAmount(amountInput);

        var effectiveAmount = amount ?? existing.Amount;
        var effectiveType = existing.Type;

        if (applyAccountId && !string.Equals(effectiveType, "transfer", StringComparison.OrdinalIgnoreCase))
        {
            var oldAcc = existing.AccountId ?? GetDefaultAccountId(conn);
            var newAcc = accountId ?? GetDefaultAccountId(conn);
            if (oldAcc != newAcc)
            {
                ReverseAccountDelta(conn, tx, oldAcc, effectiveType, existing.Amount);
                ApplyAccountDelta(conn, tx, newAcc, effectiveType, effectiveAmount, null);
            }
        }

        var sets = new List<string>();
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        if (amount.HasValue)
        {
            sets.Add("Amount=$amt");
            cmd.Parameters.AddWithValue("$amt", amount.Value);
            sets.Add("AmountInput=$input");
            cmd.Parameters.AddWithValue("$input", amountInput!);
        }
        if (categoryId.HasValue)
        {
            sets.Add("CategoryId=$cat");
            cmd.Parameters.AddWithValue("$cat", categoryId.Value);
        }
        if (spentByUserId.HasValue)
        {
            sets.Add("SpentByUserId=$user");
            cmd.Parameters.AddWithValue("$user", (long)spentByUserId.Value);
        }
        if (!string.IsNullOrWhiteSpace(transactionDate))
        {
            sets.Add("TransactionDate=$date");
            cmd.Parameters.AddWithValue("$date", transactionDate);
        }
        if (note != null)
        {
            sets.Add("Note=$note");
            cmd.Parameters.AddWithValue("$note", note);
        }
        if (merchant != null)
        {
            sets.Add("Merchant=$merchant");
            cmd.Parameters.AddWithValue("$merchant", merchant);
        }
        if (isPending.HasValue)
        {
            sets.Add("IsPending=$pend");
            cmd.Parameters.AddWithValue("$pend", isPending.Value ? 1 : 0);
        }
        if (clearedAt != null)
        {
            sets.Add("ClearedAt=$cleared");
            cmd.Parameters.AddWithValue("$cleared", string.IsNullOrWhiteSpace(clearedAt) ? DBNull.Value : clearedAt);
        }

        if (applyAccountId && !string.Equals(effectiveType, "transfer", StringComparison.OrdinalIgnoreCase))
        {
            sets.Add("AccountId=$acc");
            cmd.Parameters.AddWithValue("$acc", accountId ?? GetDefaultAccountId(conn));
        }

        if (sets.Count == 0 && splits == null && tags == null && !applyAccountId)
            return false;

        if (sets.Count > 0)
        {
            cmd.CommandText = $"UPDATE BudgetTransactions SET {string.Join(", ", sets)} WHERE Id=$id";
            cmd.Parameters.AddWithValue("$id", id);
            cmd.ExecuteNonQuery();
        }

        if (splits != null)
        {
            DeleteSplits(conn, tx, id);
            if (splits.Count > 0)
                SaveSplits(conn, tx, id, splits);
        }

        if (tags != null)
        {
            DeleteTags(conn, tx, id);
            if (tags.Count > 0)
                SaveTags(conn, tx, id, tags);
        }

        tx.Commit();
        Audit(actor, "transaction", id, "update");
        return true;
    }

    public void DeleteTransaction(int id, ulong actor)
    {
        var row = GetTransactionById(id);
        if (row == null)
            return;

        var json = JsonSerializer.Serialize(row);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM BudgetTransactions WHERE Id=$id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();

        _undo.LogAction(actor, "delete", "budget", id, json);
        Audit(actor, "transaction", id, "delete");
    }

    public BudgetTransactionListItemModel? GetTransactionById(int id)
    {
        return LoadAllTransactions().FirstOrDefault(t => t.Id == id);
    }

    private List<BudgetTransactionListItemModel> LoadAllTransactions()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var categories = GetCategories().ToDictionary(c => c.Id);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT t.Id, t.Type, t.Amount, t.AmountInput, t.CategoryId, t.SpentByUserId, t.AccountId,
                   t.TransferToAccountId, t.Note, t.Merchant, t.TransactionDate, t.ClearedAt, t.IsPending,
                   t.Currency, t.ExchangeRateToHome,
                   c.Name
            FROM BudgetTransactions t
            LEFT JOIN BudgetCategories c ON c.Id = t.CategoryId
            ORDER BY t.Id DESC";

        var list = new List<BudgetTransactionListItemModel>();
        using (var reader = cmd.ExecuteReader())
        {
            while (reader.Read())
            {
                var spentBy = (ulong)reader.GetInt64(5);
                list.Add(new BudgetTransactionListItemModel
                {
                    Id = reader.GetInt32(0),
                    Type = reader.GetString(1),
                    Amount = reader.GetDouble(2),
                    AmountInput = reader.IsDBNull(3) ? null : reader.GetString(3),
                    CategoryId = reader.IsDBNull(4) ? null : reader.GetInt32(4),
                    SpentByUserId = spentBy,
                    SpentByMemberLabel = HouseholdIdentity.MemberLabel(spentBy),
                    AccountId = reader.IsDBNull(6) ? null : reader.GetInt32(6),
                    TransferToAccountId = reader.IsDBNull(7) ? null : reader.GetInt32(7),
                    Note = reader.IsDBNull(8) ? null : reader.GetString(8),
                    Merchant = reader.IsDBNull(9) ? null : reader.GetString(9),
                    TransactionDate = reader.GetString(10),
                    ClearedAt = reader.IsDBNull(11) ? null : reader.GetString(11),
                    IsPending = reader.GetInt64(12) != 0,
                    Currency = reader.GetString(13),
                    ExchangeRateToHome = reader.GetDouble(14),
                    CategoryName = reader.IsDBNull(15) ? null : reader.GetString(15)
                });
            }
        }

        foreach (var t in list)
        {
            t.Splits = LoadSplits(conn, t.Id);
            t.Tags = LoadTagNames(conn, t.Id);
        }

        return list;
    }

    private static List<BudgetTransactionSplitModel> LoadSplits(SqliteConnection conn, int transactionId)
    {
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, CategoryId, SpentByUserId, Amount FROM BudgetTransactionSplits
            WHERE TransactionId=$id";
        cmd.Parameters.AddWithValue("$id", transactionId);
        var list = new List<BudgetTransactionSplitModel>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new BudgetTransactionSplitModel
            {
                Id = reader.GetInt32(0),
                CategoryId = reader.IsDBNull(1) ? null : reader.GetInt32(1),
                SpentByUserId = reader.IsDBNull(2) ? null : (ulong)reader.GetInt64(2),
                Amount = reader.GetDouble(3)
            });
        }
        return list;
    }

    private static List<string> LoadTagNames(SqliteConnection conn, int transactionId)
    {
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT tg.Name FROM BudgetTransactionTags tt
            JOIN BudgetTags tg ON tg.Id = tt.TagId
            WHERE tt.TransactionId=$id";
        cmd.Parameters.AddWithValue("$id", transactionId);
        var list = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            list.Add(reader.GetString(0));
        return list;
    }

    private static void SaveSplits(SqliteConnection conn, SqliteTransaction tx, int transactionId,
        List<BudgetTransactionSplitModel> splits)
    {
        foreach (var s in splits)
        {
            var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                INSERT INTO BudgetTransactionSplits (TransactionId, CategoryId, SpentByUserId, Amount)
                VALUES ($tid, $cat, $user, $amt)";
            cmd.Parameters.AddWithValue("$tid", transactionId);
            cmd.Parameters.AddWithValue("$cat", (object?)s.CategoryId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$user", s.SpentByUserId.HasValue ? (long)s.SpentByUserId.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("$amt", s.Amount);
            cmd.ExecuteNonQuery();
        }
    }

    private static void DeleteSplits(SqliteConnection conn, SqliteTransaction tx, int transactionId)
    {
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "DELETE FROM BudgetTransactionSplits WHERE TransactionId=$id";
        cmd.Parameters.AddWithValue("$id", transactionId);
        cmd.ExecuteNonQuery();
    }

    private static void SaveTags(SqliteConnection conn, SqliteTransaction tx, int transactionId, List<string> tags)
    {
        foreach (var name in tags.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(name)) continue;
            var tagId = EnsureTag(conn, tx, name.Trim());
            var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                INSERT OR IGNORE INTO BudgetTransactionTags (TransactionId, TagId) VALUES ($tid, $tag)";
            cmd.Parameters.AddWithValue("$tid", transactionId);
            cmd.Parameters.AddWithValue("$tag", tagId);
            cmd.ExecuteNonQuery();
        }
    }

    private static void DeleteTags(SqliteConnection conn, SqliteTransaction tx, int transactionId)
    {
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "DELETE FROM BudgetTransactionTags WHERE TransactionId=$id";
        cmd.Parameters.AddWithValue("$id", transactionId);
        cmd.ExecuteNonQuery();
    }

    private static int EnsureTag(SqliteConnection conn, SqliteTransaction tx, string name)
    {
        var find = conn.CreateCommand();
        find.Transaction = tx;
        find.CommandText = "SELECT Id FROM BudgetTags WHERE Name=$n COLLATE NOCASE";
        find.Parameters.AddWithValue("$n", name);
        var existing = find.ExecuteScalar();
        if (existing != null)
            return Convert.ToInt32(existing);

        var ins = conn.CreateCommand();
        ins.Transaction = tx;
        ins.CommandText = "INSERT INTO BudgetTags (Name) VALUES ($n)";
        ins.Parameters.AddWithValue("$n", name);
        ins.ExecuteNonQuery();
        return ReadLastId(conn);
    }

    private static int GetDefaultAccountId(SqliteConnection conn)
    {
        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Id FROM BudgetAccounts WHERE IsActive=1 ORDER BY Id LIMIT 1";
        var v = cmd.ExecuteScalar();
        if (v == null)
        {
            cmd.CommandText = "SELECT Id FROM BudgetAccounts ORDER BY Id LIMIT 1";
            v = cmd.ExecuteScalar();
        }

        return v == null ? 1 : Convert.ToInt32(v);
    }

    private static void ReverseAccountDelta(SqliteConnection conn, SqliteTransaction tx, int accountId, string type,
        double amount)
    {
        var reverseType = type.Equals("income", StringComparison.OrdinalIgnoreCase) ? "expense" : "income";
        if (type.Equals("expense", StringComparison.OrdinalIgnoreCase) ||
            type.Equals("income", StringComparison.OrdinalIgnoreCase))
            ApplyAccountDelta(conn, tx, accountId, reverseType, amount, null);
    }

    private static void ApplyAccountDelta(SqliteConnection conn, SqliteTransaction tx, int accountId, string type,
        double amount, int? transferOther)
    {
        var delta = type switch
        {
            "income" => amount,
            "expense" => -amount,
            "transfer_out" => -amount,
            "transfer_in" => amount,
            _ => 0d
        };
        if (delta == 0) return;
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "UPDATE BudgetAccounts SET CurrentBalance = CurrentBalance + $d WHERE Id=$id";
        cmd.Parameters.AddWithValue("$d", delta);
        cmd.Parameters.AddWithValue("$id", accountId);
        cmd.ExecuteNonQuery();
    }
}
