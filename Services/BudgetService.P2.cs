using Microsoft.Data.Sqlite;

public partial class BudgetService
{
    // ——— Opening balance ———

    public int SetOpeningBalance(int accountId, string amountInput, string? asOfDate, ulong actor)
    {
        var amount = EvaluateAmount(amountInput);
        if (amount <= 0)
            throw new ArgumentException("Amount must be positive.");

        var date = string.IsNullOrWhiteSpace(asOfDate)
            ? DateTime.UtcNow.ToString("yyyy-MM-dd")
            : asOfDate.Trim();

        using var conn = _db.GetConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            INSERT INTO BudgetTransactions
            (Type, Amount, AmountInput, AccountId, SpentByUserId, Note, TransactionDate)
            VALUES ('opening_balance', $amt, $input, $acc, $user, 'Opening balance', $date)";
        cmd.Parameters.AddWithValue("$amt", amount);
        cmd.Parameters.AddWithValue("$input", amountInput);
        cmd.Parameters.AddWithValue("$acc", accountId);
        cmd.Parameters.AddWithValue("$user", (long)actor);
        cmd.Parameters.AddWithValue("$date", date);
        cmd.ExecuteNonQuery();

        var id = ReadLastId(conn);
        ApplyAccountDelta(conn, tx, accountId, "opening_balance", amount, null);
        tx.Commit();

        Audit(actor, "account", accountId, "opening_balance", new { amount, transactionId = id });
        return id;
    }

    // ——— Envelope roll ———

    public int RollEnvelopes(string fromMonth, string toMonth, string mode, ulong actor)
    {
        fromMonth = NormalizeMonth(fromMonth);
        toMonth = NormalizeMonth(toMonth);
        var count = 0;

        if (mode.Equals("remaining", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var env in GetEnvelopes(fromMonth, null))
            {
                if (env.TargetAmount <= 0)
                    continue;
                var remaining = Math.Max(0, env.Remaining);
                SetEnvelope(toMonth, env.CategoryId, remaining, actor);
                count++;
            }
        }
        else
        {
            using var conn = _db.GetConnection();
            conn.Open();
            var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT CategoryId, TargetAmount, COALESCE(LeaveAmount, 0)
                FROM BudgetEnvelopes
                WHERE Month=$from";
            cmd.Parameters.AddWithValue("$from", fromMonth);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                var categoryId = reader.GetInt32(0);
                var target = reader.GetDouble(1);
                var leave = reader.GetDouble(2);
                SetEnvelope(toMonth, categoryId, target, actor, leave);
                count++;
            }
        }

        if (count > 0)
            Audit(actor, "envelope", 0, "roll", new { fromMonth, toMonth, mode, count });
        return count;
    }

    // ——— Month notes ———

    public BudgetMonthNoteModel GetMonthNote(string month)
    {
        month = NormalizeMonth(month);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Month, Note, ClosedAt, ClosedBy
            FROM BudgetMonthNotes
            WHERE Month=$m";
        cmd.Parameters.AddWithValue("$m", month);
        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
        {
            return new BudgetMonthNoteModel { Month = month, Note = "" };
        }

        return new BudgetMonthNoteModel
        {
            Month = reader.GetString(0),
            Note = reader.GetString(1),
            ClosedAt = reader.IsDBNull(2) ? null : reader.GetString(2),
            ClosedBy = reader.IsDBNull(3) ? null : (ulong)reader.GetInt64(3)
        };
    }

    public void PutMonthNote(string month, string note, bool markClosed, ulong actor)
    {
        month = NormalizeMonth(month);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        if (markClosed)
        {
            cmd.CommandText = @"
                INSERT INTO BudgetMonthNotes (Month, Note, ClosedAt, ClosedBy)
                VALUES ($m, $note, $closedAt, $closedBy)
                ON CONFLICT(Month) DO UPDATE SET
                    Note=$note,
                    ClosedAt=$closedAt,
                    ClosedBy=$closedBy";
            cmd.Parameters.AddWithValue("$closedAt", DateTime.UtcNow.ToString("o"));
            cmd.Parameters.AddWithValue("$closedBy", (long)actor);
        }
        else
        {
            cmd.CommandText = @"
                INSERT INTO BudgetMonthNotes (Month, Note)
                VALUES ($m, $note)
                ON CONFLICT(Month) DO UPDATE SET Note=$note";
        }

        cmd.Parameters.AddWithValue("$m", month);
        cmd.Parameters.AddWithValue("$note", note ?? "");
        cmd.ExecuteNonQuery();
        Audit(actor, "month_note", 0, markClosed ? "close" : "set", new { month });
    }

    // ——— Bill skips ———

    public void SkipBill(int billId, string month, ulong actor)
    {
        month = NormalizeMonth(month);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetBillSkips (BillId, Month, ActorUserId)
            VALUES ($bill, $month, $actor)
            ON CONFLICT(BillId, Month) DO UPDATE SET
                SkippedAt=CURRENT_TIMESTAMP,
                ActorUserId=$actor";
        cmd.Parameters.AddWithValue("$bill", billId);
        cmd.Parameters.AddWithValue("$month", month);
        cmd.Parameters.AddWithValue("$actor", (long)actor);
        cmd.ExecuteNonQuery();
        Audit(actor, "bill", billId, "skip", new { month });
    }

    public List<int> GetSkippedBillIds(string month)
    {
        month = NormalizeMonth(month);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT BillId FROM BudgetBillSkips WHERE Month=$m ORDER BY BillId";
        cmd.Parameters.AddWithValue("$m", month);
        var list = new List<int>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            list.Add(reader.GetInt32(0));
        return list;
    }

    public bool UnskipBill(int billId, string month, ulong actor)
    {
        month = NormalizeMonth(month);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM BudgetBillSkips WHERE BillId=$bill AND Month=$month";
        cmd.Parameters.AddWithValue("$bill", billId);
        cmd.Parameters.AddWithValue("$month", month);
        var ok = cmd.ExecuteNonQuery() > 0;
        if (ok) Audit(actor, "bill", billId, "unskip", new { month });
        return ok;
    }
}
