using Microsoft.Data.Sqlite;

public partial class BudgetService
{
    internal const double ShareMoneyEpsilon = 0.005;
    internal const int AwaitingRepaymentCategoryId = -1;
    internal const string AwaitingRepaymentLabel = "Awaiting repayment";

    public BudgetSharesOverviewModel GetSharesOverview()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var charges = LoadShareChargeLines(conn);
        var open = charges.Where(c => c.Status == "open" && c.Remaining > ShareMoneyEpsilon).ToList();
        var ignored = charges.Where(c => c.Status == "ignored").ToList();
        var reimbursed = charges.Where(c =>
                string.Equals(c.Status, "reimbursed", StringComparison.OrdinalIgnoreCase)
                || (c.Status == "open" && c.Remaining <= ShareMoneyEpsilon && c.PaidAmount > ShareMoneyEpsilon))
            .ToList();
        var people = open
            .Select(c => c.OwedByUserId is > 0 ? $"u:{c.OwedByUserId}" : $"n:{c.OwedByLabel.Trim().ToLowerInvariant()}")
            .Distinct(StringComparer.Ordinal)
            .Count();
        return new BudgetSharesOverviewModel
        {
            OutstandingTotal = open.Sum(c => c.Remaining),
            OutstandingPeopleCount = people,
            Open = open,
            Reimbursed = reimbursed,
            Ignored = ignored
        };
    }

    public bool SetShareChargeStatus(int chargeId, string status, ulong actor)
    {
        var next = (status ?? "").Trim().ToLowerInvariant();
        if (next is not ("open" or "ignored" or "reimbursed"))
            throw new ArgumentException("Status must be open, ignored, or reimbursed.");

        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE BudgetShareCharges SET Status=$s WHERE Id=$id";
        cmd.Parameters.AddWithValue("$s", next);
        cmd.Parameters.AddWithValue("$id", chargeId);
        if (cmd.ExecuteNonQuery() == 0)
            return false;
        Audit(actor, "share", chargeId, next);
        return true;
    }

    private void SaveShareCharges(
        SqliteConnection conn,
        SqliteTransaction tx,
        int expenseTransactionId,
        double expenseAmount,
        List<BudgetShareChargeInput>? incoming)
    {
        incoming ??= new List<BudgetShareChargeInput>();
        var normalized = NormalizeChargeInputs(incoming);
        var incomingSum = normalized.Sum(c => c.Amount);
        if (incomingSum > expenseAmount + ShareMoneyEpsilon)
            throw new ArgumentException("Charges to others cannot exceed the expense.");

        var existing = LoadShareChargeRows(conn, tx, expenseTransactionId);
        var incomingIds = normalized.Where(c => c.Id is > 0).Select(c => c.Id!.Value).ToHashSet();

        foreach (var row in existing)
        {
            if (incomingIds.Contains(row.Id))
                continue;
            if (row.PaidAmount > ShareMoneyEpsilon)
                throw new ArgumentException("Cannot remove a charge that already has a reimbursement. Ignore it instead.");
            DeleteShareCharge(conn, tx, row.Id);
        }

        foreach (var input in normalized)
        {
            if (input.Id is > 0)
            {
                var row = existing.FirstOrDefault(e => e.Id == input.Id.Value)
                    ?? throw new ArgumentException("Share charge not found on this expense.");
                if (row.ExpenseTransactionId != expenseTransactionId)
                    throw new ArgumentException("Share charge does not belong to this expense.");
                if (input.Amount + ShareMoneyEpsilon < row.PaidAmount)
                    throw new ArgumentException("Charge amount cannot be less than what has already been reimbursed.");
                UpdateShareCharge(conn, tx, input);
            }
            else
            {
                InsertShareCharge(conn, tx, expenseTransactionId, input);
            }
        }
    }

    private void SaveSharePayments(
        SqliteConnection conn,
        SqliteTransaction tx,
        int incomeTransactionId,
        double incomeAmount,
        List<BudgetSharePaymentInput>? incoming)
    {
        incoming ??= new List<BudgetSharePaymentInput>();
        var normalized = incoming
            .Where(p => p.ChargeId > 0 && p.Amount > ShareMoneyEpsilon)
            .Select(p => new BudgetSharePaymentInput { ChargeId = p.ChargeId, Amount = p.Amount })
            .ToList();
        var paySum = normalized.Sum(p => p.Amount);
        if (paySum > incomeAmount + ShareMoneyEpsilon)
            throw new ArgumentException("Reimbursement allocations cannot exceed the amount received.");

        DeleteSharePaymentsForIncome(conn, tx, incomeTransactionId);

        var grouped = normalized
            .GroupBy(p => p.ChargeId)
            .Select(g => new BudgetSharePaymentInput { ChargeId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToList();

        foreach (var payment in grouped)
        {
            var charge = LoadShareChargeRow(conn, tx, payment.ChargeId)
                ?? throw new ArgumentException("Share charge not found.");
            if (!string.Equals(charge.Status, "open", StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("Restore this split before applying a reimbursement.");
            if (payment.Amount > charge.Remaining + ShareMoneyEpsilon)
                throw new ArgumentException($"Cannot apply more than ${charge.Remaining:0.00} still owed by {charge.OwedByLabel}.");
            InsertSharePayment(conn, tx, payment.ChargeId, incomeTransactionId, payment.Amount);
        }
    }

    private static List<BudgetShareChargeInput> NormalizeChargeInputs(List<BudgetShareChargeInput> incoming)
    {
        var list = new List<BudgetShareChargeInput>();
        foreach (var raw in incoming)
        {
            if (raw.Amount <= ShareMoneyEpsilon)
                continue;
            var userId = raw.OwedByUserId is > 0 ? raw.OwedByUserId : null;
            var label = (raw.OwedByLabel ?? "").Trim();
            if (string.IsNullOrEmpty(label) && userId is > 0)
                label = HouseholdIdentity.MemberLabel(userId.Value);
            if (string.IsNullOrEmpty(label))
                throw new ArgumentException("Each charge needs a person name.");
            list.Add(new BudgetShareChargeInput
            {
                Id = raw.Id is > 0 ? raw.Id : null,
                OwedByUserId = userId,
                OwedByLabel = label,
                Amount = raw.Amount
            });
        }

        return list;
    }

    private static void InsertShareCharge(
        SqliteConnection conn, SqliteTransaction tx, int expenseId, BudgetShareChargeInput input)
    {
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            INSERT INTO BudgetShareCharges (ExpenseTransactionId, OwedByUserId, OwedByLabel, Amount, Status)
            VALUES ($eid, $uid, $label, $amt, 'open')";
        cmd.Parameters.AddWithValue("$eid", expenseId);
        cmd.Parameters.AddWithValue("$uid", input.OwedByUserId is > 0 ? (object)(long)input.OwedByUserId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("$label", input.OwedByLabel ?? "");
        cmd.Parameters.AddWithValue("$amt", input.Amount);
        cmd.ExecuteNonQuery();
    }

    private static void UpdateShareCharge(SqliteConnection conn, SqliteTransaction tx, BudgetShareChargeInput input)
    {
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            UPDATE BudgetShareCharges
            SET OwedByUserId=$uid, OwedByLabel=$label, Amount=$amt
            WHERE Id=$id";
        cmd.Parameters.AddWithValue("$uid", input.OwedByUserId is > 0 ? (object)(long)input.OwedByUserId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("$label", input.OwedByLabel ?? "");
        cmd.Parameters.AddWithValue("$amt", input.Amount);
        cmd.Parameters.AddWithValue("$id", input.Id!.Value);
        cmd.ExecuteNonQuery();
    }

    private static void InsertSharePayment(
        SqliteConnection conn, SqliteTransaction tx, int chargeId, int incomeId, double amount)
    {
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            INSERT INTO BudgetSharePayments (ChargeId, IncomeTransactionId, Amount)
            VALUES ($cid, $iid, $amt)";
        cmd.Parameters.AddWithValue("$cid", chargeId);
        cmd.Parameters.AddWithValue("$iid", incomeId);
        cmd.Parameters.AddWithValue("$amt", amount);
        cmd.ExecuteNonQuery();
    }

    private static void DeleteShareCharge(SqliteConnection conn, SqliteTransaction tx, int chargeId)
    {
        var pay = conn.CreateCommand();
        pay.Transaction = tx;
        pay.CommandText = "DELETE FROM BudgetSharePayments WHERE ChargeId=$id";
        pay.Parameters.AddWithValue("$id", chargeId);
        pay.ExecuteNonQuery();

        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "DELETE FROM BudgetShareCharges WHERE Id=$id";
        cmd.Parameters.AddWithValue("$id", chargeId);
        cmd.ExecuteNonQuery();
    }

    private static void DeleteSharePaymentsForIncome(SqliteConnection conn, SqliteTransaction tx, int incomeId)
    {
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "DELETE FROM BudgetSharePayments WHERE IncomeTransactionId=$id";
        cmd.Parameters.AddWithValue("$id", incomeId);
        cmd.ExecuteNonQuery();
    }

    private static void DeleteShareRowsForTransaction(SqliteConnection conn, SqliteTransaction tx, int transactionId)
    {
        var pay = conn.CreateCommand();
        pay.Transaction = tx;
        pay.CommandText = @"
            DELETE FROM BudgetSharePayments
            WHERE IncomeTransactionId=$id
               OR ChargeId IN (SELECT Id FROM BudgetShareCharges WHERE ExpenseTransactionId=$id)";
        pay.Parameters.AddWithValue("$id", transactionId);
        pay.ExecuteNonQuery();

        var charges = conn.CreateCommand();
        charges.Transaction = tx;
        charges.CommandText = "DELETE FROM BudgetShareCharges WHERE ExpenseTransactionId=$id";
        charges.Parameters.AddWithValue("$id", transactionId);
        charges.ExecuteNonQuery();
    }

    private void AttachShareSummaries(SqliteConnection conn, List<BudgetTransactionListItemModel> list)
    {
        if (list.Count == 0)
            return;

        var charges = LoadShareChargeLines(conn);
        var byExpense = charges.GroupBy(c => c.ExpenseTransactionId).ToDictionary(g => g.Key, g => g.ToList());
        var payments = LoadSharePaymentLines(conn);
        var byIncome = payments.GroupBy(p => p.IncomeTransactionId)
            .ToDictionary(g => g.Key, g => g.Select(p => p.Line).ToList());

        foreach (var t in list)
        {
            if (byExpense.TryGetValue(t.Id, out var expenseCharges))
            {
                t.ShareSummary = new BudgetTransactionShareSummaryModel
                {
                    Owed = expenseCharges.Sum(c => c.Amount),
                    Received = expenseCharges.Sum(c => c.PaidAmount),
                    Remaining = expenseCharges.Where(c => c.Status == "open").Sum(c => c.Remaining),
                    Charges = expenseCharges
                };
            }

            if (byIncome.TryGetValue(t.Id, out var incomePayments))
            {
                var summary = t.ShareSummary ?? new BudgetTransactionShareSummaryModel();
                summary.Payments = incomePayments;
                summary.Received = incomePayments.Sum(p => p.Amount);
                t.ShareSummary = summary;
            }
        }
    }

    private static List<BudgetShareChargeLineModel> LoadShareChargeLines(SqliteConnection conn)
    {
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT c.Id, c.ExpenseTransactionId, c.OwedByUserId, c.OwedByLabel, c.Amount, c.Status,
                   IFNULL((SELECT SUM(p.Amount) FROM BudgetSharePayments p WHERE p.ChargeId = c.Id), 0),
                   t.Merchant, t.TransactionDate, t.Amount
            FROM BudgetShareCharges c
            JOIN BudgetTransactions t ON t.Id = c.ExpenseTransactionId
            ORDER BY t.TransactionDate DESC, c.Id DESC";
        var list = new List<BudgetShareChargeLineModel>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var amount = reader.GetDouble(4);
            var paid = reader.GetDouble(6);
            var remaining = Math.Max(0, amount - paid);
            ulong? owedBy = reader.IsDBNull(2) ? null : (ulong)reader.GetInt64(2);
            if (owedBy == 0) owedBy = null;
            var label = reader.GetString(3);
            if (string.IsNullOrWhiteSpace(label) && owedBy is > 0)
                label = HouseholdIdentity.MemberLabel(owedBy.Value);
            list.Add(new BudgetShareChargeLineModel
            {
                Id = reader.GetInt32(0),
                ExpenseTransactionId = reader.GetInt32(1),
                OwedByUserId = owedBy,
                OwedByLabel = label,
                Amount = amount,
                PaidAmount = paid,
                Remaining = remaining,
                Status = reader.GetString(5),
                Merchant = reader.IsDBNull(7) ? null : reader.GetString(7),
                ExpenseDate = reader.IsDBNull(8) ? null : reader.GetString(8),
                ExpenseAmount = reader.GetDouble(9)
            });
        }

        return list;
    }

    private sealed record SharePaymentLoad(int IncomeTransactionId, BudgetSharePaymentLineModel Line);

    private static List<SharePaymentLoad> LoadSharePaymentLines(SqliteConnection conn)
    {
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT p.IncomeTransactionId, p.ChargeId, p.Amount, c.OwedByLabel, t.Merchant, t.TransactionDate
            FROM BudgetSharePayments p
            JOIN BudgetShareCharges c ON c.Id = p.ChargeId
            JOIN BudgetTransactions t ON t.Id = c.ExpenseTransactionId
            ORDER BY p.Id";
        var list = new List<SharePaymentLoad>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new SharePaymentLoad(
                reader.GetInt32(0),
                new BudgetSharePaymentLineModel
                {
                    ChargeId = reader.GetInt32(1),
                    Amount = reader.GetDouble(2),
                    OwedByLabel = reader.GetString(3),
                    Merchant = reader.IsDBNull(4) ? null : reader.GetString(4),
                    ExpenseDate = reader.IsDBNull(5) ? null : reader.GetString(5)
                }));
        }

        return list;
    }

    private sealed class ShareChargeRow
    {
        public int Id { get; init; }
        public int ExpenseTransactionId { get; init; }
        public string Status { get; init; } = "open";
        public string OwedByLabel { get; init; } = "";
        public double Amount { get; init; }
        public double PaidAmount { get; init; }
        public double Remaining => Math.Max(0, Amount - PaidAmount);
    }

    private static List<ShareChargeRow> LoadShareChargeRows(SqliteConnection conn, SqliteTransaction tx, int expenseId)
    {
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            SELECT c.Id, c.ExpenseTransactionId, c.Status, c.OwedByLabel, c.Amount,
                   IFNULL((SELECT SUM(p.Amount) FROM BudgetSharePayments p WHERE p.ChargeId = c.Id), 0)
            FROM BudgetShareCharges c
            WHERE c.ExpenseTransactionId=$id";
        cmd.Parameters.AddWithValue("$id", expenseId);
        var list = new List<ShareChargeRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new ShareChargeRow
            {
                Id = reader.GetInt32(0),
                ExpenseTransactionId = reader.GetInt32(1),
                Status = reader.GetString(2),
                OwedByLabel = reader.GetString(3),
                Amount = reader.GetDouble(4),
                PaidAmount = reader.GetDouble(5)
            });
        }

        return list;
    }

    private static ShareChargeRow? LoadShareChargeRow(SqliteConnection conn, SqliteTransaction tx, int chargeId)
    {
        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            SELECT c.Id, c.ExpenseTransactionId, c.Status, c.OwedByLabel, c.Amount,
                   IFNULL((SELECT SUM(p.Amount) FROM BudgetSharePayments p WHERE p.ChargeId = c.Id), 0)
            FROM BudgetShareCharges c
            WHERE c.Id=$id";
        cmd.Parameters.AddWithValue("$id", chargeId);
        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
            return null;
        return new ShareChargeRow
        {
            Id = reader.GetInt32(0),
            ExpenseTransactionId = reader.GetInt32(1),
            Status = reader.GetString(2),
            OwedByLabel = reader.GetString(3),
            Amount = reader.GetDouble(4),
            PaidAmount = reader.GetDouble(5)
        };
    }

    private static double ExistingShareChargeTotal(BudgetTransactionListItemModel row) =>
        row.ShareSummary?.Owed ?? 0;
}
