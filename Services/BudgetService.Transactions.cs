using System.Collections.Concurrent;
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
        _ = scope;

        q = q.Where(t => MonthContainsDate(m, t.TransactionDate));

        if (spentByUserId.HasValue && spentByUserId.Value != 0)
            q = q.Where(t => t.SpentByUserId == spentByUserId.Value || t.Splits.Any(s => s.SpentByUserId == spentByUserId));

        if (categoryId.HasValue)
            q = q.Where(t => t.CategoryId == categoryId || t.Splits.Any(s => s.CategoryId == categoryId));

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
            q = q.Where(t => t.AccountId == accountId || t.TransferToAccountId == accountId);

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

    /// <summary>Zero-based ledger page for a transaction in its month (default filters).</summary>
    public int FindTransactionPage(int transactionId, string? month = null)
    {
        var tx = GetTransactionById(transactionId);
        if (tx == null) return 0;
        var m = NormalizeMonth(month ?? tx.TransactionDate);
        var list = LoadAllTransactions()
            .Where(t => MonthContainsDate(m, t.TransactionDate))
            .OrderByDescending(t => t.TransactionDate)
            .ThenByDescending(t => t.Id)
            .ToList();
        var index = list.FindIndex(t => t.Id == transactionId);
        if (index < 0) return 0;
        using var conn = _db.GetConnection();
        conn.Open();
        var pageSize = GetPageSize(conn);
        return index / pageSize;
    }

    private static double EffectiveAmount(BudgetTransactionListItemModel t) =>
        t.Splits.Count > 0 ? t.Splits.Sum(s => s.Amount) : t.Amount;

    /// <summary>Identical web submits with no idempotency key (a double click on an older page) collapse for this long.</summary>
    private const int AccidentalDuplicateSeconds = 8;

    private readonly object _recentDuplicateGate = new();
    private readonly ConcurrentDictionary<string, (int Id, long Ticks)> _submitResults = new();
    private readonly ConcurrentDictionary<string, (int Id, long Ticks)> _recentCreates = new();

    private static bool IsSubmitKey(string? submitKey)
    {
        if (string.IsNullOrWhiteSpace(submitKey)) return false;
        var key = submitKey.Trim();
        return key.Length is > 0 and <= 80 && !key.Contains('\n') && !key.Contains('\r');
    }

    private bool TryRecentSubmit(string submitKey, out int id)
    {
        if (_submitResults.TryGetValue(submitKey, out var hit) &&
            DateTime.UtcNow.Ticks - hit.Ticks <= TimeSpan.FromHours(1).Ticks)
        {
            id = hit.Id;
            return true;
        }

        id = 0;
        return false;
    }

    private void RememberSubmit(string submitKey, int id)
    {
        var now = DateTime.UtcNow.Ticks;
        _submitResults[submitKey] = (id, now);
        if (_submitResults.Count <= 256) return;
        foreach (var entry in _submitResults)
        {
            if (now - entry.Value.Ticks > TimeSpan.FromHours(1).Ticks)
                _submitResults.TryRemove(entry.Key, out _);
        }
    }

    /// <summary>One insert per idempotency key. A retry after the response was lost returns the same id.</summary>
    private int WithDuplicateGuard(string? submitKey, Action<bool>? createdCallback, Func<(int Id, bool Created)> insert)
    {
        var key = IsSubmitKey(submitKey) ? submitKey!.Trim() : null;
        if (key != null && TryRecentSubmit(key, out var existing))
        {
            createdCallback?.Invoke(false);
            return existing;
        }

        lock (_recentDuplicateGate)
        {
            if (key != null && TryRecentSubmit(key, out existing))
            {
                createdCallback?.Invoke(false);
                return existing;
            }

            var (id, created) = insert();
            if (key != null)
                RememberSubmit(key, id);
            createdCallback?.Invoke(created);
            return id;
        }
    }

    public int CreateTransaction(
        string type,
        string amountInput,
        int? categoryId,
        ulong spentByUserId,
        string transactionDate,
        string? note,
        string? receiptUrl,
        string? merchant,
        int? accountId,
        bool isPending,
        string currency,
        double exchangeRateToHome,
        List<BudgetTransactionSplitModel>? splits,
        List<string>? tags,
        ulong actor,
        List<BudgetShareChargeInput>? shareCharges = null,
        List<BudgetSharePaymentInput>? sharePayments = null,
        string? submitKey = null,
        bool collapseAccidentalDuplicate = false,
        Action<bool>? createdCallback = null)
    {
        if (!IsSubmitKey(submitKey) && !collapseAccidentalDuplicate)
        {
            var id = InsertTransaction(
                type, amountInput, categoryId, spentByUserId, transactionDate, note, receiptUrl, merchant,
                accountId, isPending, currency, exchangeRateToHome, splits, tags, actor, shareCharges, sharePayments,
                collapseRecent: false, out var created);
            createdCallback?.Invoke(created);
            return id;
        }

        return WithDuplicateGuard(submitKey, createdCallback, () =>
        {
            var id = InsertTransaction(
                type, amountInput, categoryId, spentByUserId, transactionDate, note, receiptUrl, merchant,
                accountId, isPending, currency, exchangeRateToHome, splits, tags, actor, shareCharges, sharePayments,
                collapseRecent: collapseAccidentalDuplicate, out var created);
            return (id, created);
        });
    }

    private int InsertTransaction(
        string type,
        string amountInput,
        int? categoryId,
        ulong spentByUserId,
        string transactionDate,
        string? note,
        string? receiptUrl,
        string? merchant,
        int? accountId,
        bool isPending,
        string currency,
        double exchangeRateToHome,
        List<BudgetTransactionSplitModel>? splits,
        List<string>? tags,
        ulong actor,
        List<BudgetShareChargeInput>? shareCharges,
        List<BudgetSharePaymentInput>? sharePayments,
        bool collapseRecent,
        out bool created)
    {
        created = false;
        var amount = EvaluateAmount(amountInput);
        if (amount <= 0 && type != "transfer")
            throw new ArgumentException("Amount must be positive.");

        if (sharePayments is { Count: > 0 } && type.Equals("income", StringComparison.OrdinalIgnoreCase))
            type = "reimbursement";
        var isExpense = type.Equals("expense", StringComparison.OrdinalIgnoreCase);
        var isIncomeLike = IsIncomeLikeType(type);
        if (!isExpense && shareCharges is { Count: > 0 })
            throw new ArgumentException("Charges to others can only be added on an expense.");
        if (!isIncomeLike && sharePayments is { Count: > 0 })
            throw new ArgumentException("Reimbursements can only be applied to money received.");
        if (type.Equals("reimbursement", StringComparison.OrdinalIgnoreCase) &&
            (sharePayments == null || !sharePayments.Any(p => p.Amount > ShareMoneyEpsilon)))
            throw new ArgumentException("Pick at least one charge this reimbursement covers.");

        using var conn = _db.GetConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        int accId;
        if (isIncomeLike)
        {
            var action = type.Equals("reimbursement", StringComparison.OrdinalIgnoreCase) ? "Reimbursement" : "Income";
            accId = accountId ?? FindDefaultDepositAccountId(conn)
                ?? throw new ArgumentException($"{action} must use a checking or savings account.");
            EnsureDepositAccount(conn, tx, accId, action);
        }
        else
        {
            accId = accountId ?? GetDefaultAccountId(conn);
        }
        if (!categoryId.HasValue)
            categoryId = ResolveCategoryFromRules(merchant, note);

        var storedCurrency = string.IsNullOrWhiteSpace(currency) ? "USD" : currency.Trim().ToUpperInvariant();
        var storedRate = exchangeRateToHome <= 0 ? 1 : exchangeRateToHome;
        string? fingerprint = null;
        if (collapseRecent)
        {
            fingerprint = TransactionFingerprint(
                type, amount, amountInput, categoryId, spentByUserId, accId, note, receiptUrl, merchant,
                transactionDate, isPending, storedCurrency, storedRate, splits, tags, shareCharges, sharePayments);
            if (MatchRecent(fingerprint) is int recentId)
                return recentId;
        }

        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            INSERT INTO BudgetTransactions
            (Type, Amount, AmountInput, CategoryId, SpentByUserId, AccountId, Note, ReceiptUrl, Merchant,
             TransactionDate, IsPending, Currency, ExchangeRateToHome)
            VALUES ($type, $amt, $input, $cat, $user, $acc, $note, $receipt, $merchant, $date, $pend, $cur, $rate)";
        cmd.Parameters.AddWithValue("$type", type);
        cmd.Parameters.AddWithValue("$amt", amount);
        cmd.Parameters.AddWithValue("$input", amountInput);
        cmd.Parameters.AddWithValue("$cat", (object?)categoryId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$user", (long)spentByUserId);
        cmd.Parameters.AddWithValue("$acc", accId);
        cmd.Parameters.AddWithValue("$note", (object?)note ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$receipt", (object?)receiptUrl ?? DBNull.Value);
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
        if (isExpense && shareCharges is { Count: > 0 })
            SaveShareCharges(conn, tx, id, amount, shareCharges);
        if (isIncomeLike && sharePayments is { Count: > 0 })
            SaveSharePayments(conn, tx, id, amount, sharePayments);

        ApplyAccountDelta(conn, tx, accId, type, amount, null);
        tx.Commit();
        if (fingerprint != null)
            RememberRecent(fingerprint, id);

        _undo.LogAction(actor, "create", "budget", id, "");
        Audit(actor, "transaction", id, "create");
        created = true;
        return id;
    }

    public int CreateTransfer(
        string amountInput,
        int fromAccountId,
        int toAccountId,
        string transactionDate,
        string? note,
        ulong actor,
        string? toAmountInput = null,
        string? merchant = null,
        string? submitKey = null,
        bool collapseAccidentalDuplicate = false,
        Action<bool>? createdCallback = null)
    {
        var amount = EvaluateAmount(amountInput);
        if (amount <= 0)
            throw new ArgumentException("Amount paid must be positive.");
        var toAmount = ResolveTransferReceivedAmount(amount, toAmountInput);
        if (fromAccountId == toAccountId)
            throw new ArgumentException("Transfer requires two different accounts.");

        int Insert()
        {
            using var conn = _db.GetConnection();
            conn.Open();
            using var tx = conn.BeginTransaction();
            var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                INSERT INTO BudgetTransactions
                (Type, Amount, AmountInput, SpentByUserId, AccountId, TransferToAccountId, TransferToAmount, Note, Merchant, TransactionDate)
                VALUES ('transfer', $amt, $input, $user, $from, $to, $toAmt, $note, $merchant, $date)";
            cmd.Parameters.AddWithValue("$amt", amount);
            cmd.Parameters.AddWithValue("$input", amountInput);
            cmd.Parameters.AddWithValue("$user", (long)actor);
            cmd.Parameters.AddWithValue("$from", fromAccountId);
            cmd.Parameters.AddWithValue("$to", toAccountId);
            cmd.Parameters.AddWithValue("$toAmt", toAmount);
            cmd.Parameters.AddWithValue("$note", (object?)note ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$merchant", string.IsNullOrWhiteSpace(merchant) ? DBNull.Value : merchant.Trim());
            cmd.Parameters.AddWithValue("$date", transactionDate);
            cmd.ExecuteNonQuery();
            var id = ReadLastId(conn);
            ApplyAccountDelta(conn, tx, fromAccountId, "transfer_out", amount, toAccountId);
            ApplyAccountDelta(conn, tx, toAccountId, "transfer_in", toAmount, fromAccountId);
            tx.Commit();
            Audit(actor, "transaction", id, "transfer");
            return id;
        }

        if (!IsSubmitKey(submitKey) && !collapseAccidentalDuplicate)
        {
            var id = Insert();
            createdCallback?.Invoke(true);
            return id;
        }

        var fingerprint = TransferFingerprint(
            amount, amountInput, toAmount, fromAccountId, toAccountId, transactionDate, note, merchant, actor);
        return WithDuplicateGuard(submitKey, createdCallback, () =>
        {
            if (collapseAccidentalDuplicate && MatchRecent(fingerprint) is int recentId)
                return (recentId, false);
            var id = Insert();
            if (collapseAccidentalDuplicate)
                RememberRecent(fingerprint, id);
            return (id, true);
        });
    }

    private int? MatchRecent(string fingerprint)
    {
        if (_recentCreates.TryGetValue(fingerprint, out var hit) &&
            DateTime.UtcNow.Ticks - hit.Ticks <= TimeSpan.FromSeconds(AccidentalDuplicateSeconds).Ticks)
            return hit.Id;
        return null;
    }

    private void RememberRecent(string fingerprint, int id)
    {
        var now = DateTime.UtcNow.Ticks;
        _recentCreates[fingerprint] = (id, now);
        if (_recentCreates.Count <= 64) return;
        var window = TimeSpan.FromSeconds(AccidentalDuplicateSeconds).Ticks;
        foreach (var entry in _recentCreates)
        {
            if (now - entry.Value.Ticks > window)
                _recentCreates.TryRemove(entry.Key, out _);
        }
    }

    private static string TransactionFingerprint(
        string type,
        double amount,
        string amountInput,
        int? categoryId,
        ulong spentByUserId,
        int accountId,
        string? note,
        string? receiptUrl,
        string? merchant,
        string transactionDate,
        bool isPending,
        string currency,
        double exchangeRate,
        List<BudgetTransactionSplitModel>? splits,
        List<string>? tags,
        List<BudgetShareChargeInput>? shareCharges,
        List<BudgetSharePaymentInput>? sharePayments)
    {
        var culture = CultureInfo.InvariantCulture;
        var splitText = splits == null
            ? ""
            : string.Join(";", splits.Select(s =>
                $"{s.CategoryId}:{s.SpentByUserId}:{s.Amount.ToString("0.00", culture)}"));
        var tagText = tags == null
            ? ""
            : string.Join(";", tags.Select(t => t.Trim()).Where(t => t.Length > 0).OrderBy(t => t, StringComparer.OrdinalIgnoreCase));
        var chargeText = shareCharges == null
            ? ""
            : string.Join(";", shareCharges.Select(c =>
                $"{c.OwedByUserId}:{c.OwedByLabel}:{c.Amount.ToString("0.00", culture)}"));
        var payText = sharePayments == null
            ? ""
            : string.Join(";", sharePayments.Select(p =>
                $"{p.ChargeId}:{p.Amount.ToString("0.00", culture)}"));
        return string.Join("|",
            type.Trim().ToLowerInvariant(),
            amount.ToString("0.00", culture),
            amountInput.Trim(),
            categoryId?.ToString(culture) ?? "",
            spentByUserId.ToString(culture),
            accountId.ToString(culture),
            (note ?? "").Trim(),
            (receiptUrl ?? "").Trim(),
            (merchant ?? "").Trim(),
            transactionDate.Trim(),
            isPending ? "1" : "0",
            currency,
            exchangeRate.ToString("0.####", culture),
            splitText,
            tagText,
            chargeText,
            payText);
    }

    private static string TransferFingerprint(
        double amount,
        string amountInput,
        double toAmount,
        int fromAccountId,
        int toAccountId,
        string transactionDate,
        string? note,
        string? merchant,
        ulong actor)
    {
        var culture = CultureInfo.InvariantCulture;
        return string.Join("|",
            "transfer",
            amount.ToString("0.00", culture),
            amountInput.Trim(),
            toAmount.ToString("0.00", culture),
            fromAccountId.ToString(culture),
            toAccountId.ToString(culture),
            transactionDate.Trim(),
            (note ?? "").Trim(),
            (merchant ?? "").Trim(),
            actor.ToString(culture));
    }

    public bool UpdateTransaction(
        int id,
        string? amountInput,
        int? categoryId,
        ulong? spentByUserId,
        string? transactionDate,
        string? note,
        string? receiptUrl,
        string? merchant,
        bool? isPending,
        string? clearedAt,
        List<BudgetTransactionSplitModel>? splits,
        List<string>? tags,
        int? accountId,
        bool applyAccountId,
        bool applyReceiptUrl,
        ulong actor,
        int? transferToAccountId = null,
        bool applyTransferToAccountId = false,
        List<BudgetShareChargeInput>? shareCharges = null,
        bool applyShareCharges = false,
        List<BudgetSharePaymentInput>? sharePayments = null,
        bool applySharePayments = false,
        string? transferToAmountInput = null,
        bool applyTransferToAmount = false)
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

        var newAmount = amount ?? existing.Amount;
        var isTransfer = string.Equals(existing.Type, "transfer", StringComparison.OrdinalIgnoreCase);
        var defaultAccountId = BudgetAccountBalance.ResolveDefaultAccountId(conn);
        var existingReceived = BudgetAccountBalance.TransferReceivedAmount(existing);
        var newReceived = existingReceived;
        if (isTransfer)
        {
            if (applyTransferToAmount)
                newReceived = ResolveTransferReceivedAmount(newAmount, transferToAmountInput);
            else if (amount.HasValue && Math.Abs(existingReceived - existing.Amount) < 0.0001)
                newReceived = newAmount;
        }

        int? newFrom = existing.AccountId;
        int? newTo = existing.TransferToAccountId;
        if (applyAccountId)
            newFrom = isTransfer ? accountId : (accountId ?? defaultAccountId);
        if (applyTransferToAccountId)
            newTo = transferToAccountId;

        if (isTransfer && (applyAccountId || applyTransferToAccountId))
        {
            if (newFrom is null || newTo is null || newFrom == newTo)
                throw new ArgumentException("Transfer requires two different accounts.");
        }

        if (IsIncomeLikeType(existing.Type) && applyAccountId && newFrom is { } incomeAcc)
            EnsureDepositAccount(conn, tx, incomeAcc, existing.Type.Equals("reimbursement", StringComparison.OrdinalIgnoreCase) ? "Reimbursement" : "Income");

        var nextType = existing.Type;
        if (applySharePayments && IsIncomeLikeType(existing.Type))
            nextType = sharePayments is { Count: > 0 } ? "reimbursement" : "income";
        if (applyShareCharges && !string.Equals(existing.Type, "expense", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Charges to others can only be added on an expense.");
        if (applySharePayments && !IsIncomeLikeType(existing.Type))
            throw new ArgumentException("Reimbursements can only be applied to money received.");

        var shareOwed = applyShareCharges
            ? (shareCharges ?? new List<BudgetShareChargeInput>()).Where(c => c.Amount > ShareMoneyEpsilon).Sum(c => c.Amount)
            : ExistingShareChargeTotal(existing);
        if (string.Equals(existing.Type, "expense", StringComparison.OrdinalIgnoreCase) &&
            shareOwed > newAmount + ShareMoneyEpsilon)
            throw new ArgumentException("Charges to others cannot exceed the expense.");

        var balancesChanged = Math.Abs(newAmount - existing.Amount) > 0.0001
            || Math.Abs(newReceived - existingReceived) > 0.0001
            || !Nullable.Equals(newFrom, existing.AccountId)
            || !Nullable.Equals(newTo, existing.TransferToAccountId);

        if (balancesChanged)
            BudgetAccountBalance.RevertTransaction(conn, tx, existing, defaultAccountId);

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
        if (applyReceiptUrl)
        {
            sets.Add("ReceiptUrl=$receipt");
            cmd.Parameters.AddWithValue("$receipt", string.IsNullOrWhiteSpace(receiptUrl) ? DBNull.Value : receiptUrl);
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

        if (applyAccountId)
        {
            sets.Add("AccountId=$acc");
            cmd.Parameters.AddWithValue("$acc", (object?)newFrom ?? DBNull.Value);
        }
        if (applyTransferToAccountId && isTransfer)
        {
            sets.Add("TransferToAccountId=$to");
            cmd.Parameters.AddWithValue("$to", (object?)newTo ?? DBNull.Value);
        }
        if (isTransfer && (applyTransferToAmount || Math.Abs(newReceived - existingReceived) > 0.0001))
        {
            sets.Add("TransferToAmount=$toAmt");
            cmd.Parameters.AddWithValue("$toAmt", newReceived);
        }
        if (!string.Equals(nextType, existing.Type, StringComparison.OrdinalIgnoreCase))
        {
            sets.Add("Type=$shareType");
            cmd.Parameters.AddWithValue("$shareType", nextType);
        }

        if (sets.Count == 0 && splits == null && tags == null && !applyAccountId && !applyReceiptUrl &&
            !applyTransferToAccountId && !applyShareCharges && !applySharePayments && !applyTransferToAmount)
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

        if (applyShareCharges)
            SaveShareCharges(conn, tx, id, newAmount, shareCharges);
        if (applySharePayments)
            SaveSharePayments(conn, tx, id, newAmount, sharePayments);

        if (balancesChanged)
        {
            var updated = new BudgetTransactionListItemModel
            {
                Id = existing.Id,
                Type = nextType,
                Amount = newAmount,
                AccountId = newFrom,
                TransferToAccountId = newTo,
                TransferToAmount = isTransfer ? newReceived : null
            };
            BudgetAccountBalance.ApplyTransaction(conn, tx, updated, defaultAccountId);
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
        using var tx = conn.BeginTransaction();

        var defaultAccountId = BudgetAccountBalance.ResolveDefaultAccountId(conn);
        BudgetAccountBalance.RevertTransaction(conn, tx, row, defaultAccountId);
        DeleteShareRowsForTransaction(conn, tx, id);

        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "DELETE FROM BudgetTransactions WHERE Id=$id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();

        tx.Commit();

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
                   t.TransferToAccountId, t.Note, t.ReceiptUrl, t.Merchant, t.TransactionDate, t.ClearedAt, t.IsPending,
                   t.Currency, t.ExchangeRateToHome,
                   c.Name, t.TransferToAmount
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
                    ReceiptUrl = reader.IsDBNull(9) ? null : reader.GetString(9),
                    Merchant = reader.IsDBNull(10) ? null : reader.GetString(10),
                    TransactionDate = reader.GetString(11),
                    ClearedAt = reader.IsDBNull(12) ? null : reader.GetString(12),
                    IsPending = reader.GetInt64(13) != 0,
                    Currency = reader.GetString(14),
                    ExchangeRateToHome = reader.GetDouble(15),
                    CategoryName = reader.IsDBNull(16) ? null : reader.GetString(16),
                    TransferToAmount = reader.IsDBNull(17) ? null : reader.GetDouble(17)
                });
            }
        }

        foreach (var t in list)
        {
            t.Splits = LoadSplits(conn, t.Id);
            t.Tags = LoadTagNames(conn, t.Id);
        }

        AttachShareSummaries(conn, list);
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
        if (type.Equals("opening_balance", StringComparison.OrdinalIgnoreCase) ||
            type.Equals("income", StringComparison.OrdinalIgnoreCase) ||
            type.Equals("reimbursement", StringComparison.OrdinalIgnoreCase))
        {
            ApplyAccountDelta(conn, tx, accountId, "expense", amount, null);
            return;
        }

        if (type.Equals("expense", StringComparison.OrdinalIgnoreCase))
            ApplyAccountDelta(conn, tx, accountId, "income", amount, null);
    }

    private static double ResolveTransferReceivedAmount(double fromAmount, string? toAmountInput)
    {
        if (string.IsNullOrWhiteSpace(toAmountInput))
            return fromAmount;
        var toAmount = EvaluateAmount(toAmountInput);
        if (toAmount <= 0)
            throw new ArgumentException("Amount received must be positive.");
        return toAmount;
    }

    private static void ApplyAccountDelta(SqliteConnection conn, SqliteTransaction tx, int accountId, string type,
        double amount, int? transferOther)
    {
        var delta = type switch
        {
            "income" => amount,
            "reimbursement" => amount,
            "opening_balance" => amount,
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
