using System.Text;
using Microsoft.Data.Sqlite;

public partial class BudgetService
{
    // ——— Accounts ———

    public List<BudgetAccountModel> GetAccounts()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Name, AccountType, Currency, CreditLimit, CurrentBalance
            FROM BudgetAccounts ORDER BY Id";
        var list = new List<BudgetAccountModel>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new BudgetAccountModel
            {
                Id = reader.GetInt32(0),
                Name = reader.GetString(1),
                AccountType = reader.GetString(2),
                Currency = reader.GetString(3),
                CreditLimit = reader.IsDBNull(4) ? null : reader.GetDouble(4),
                CurrentBalance = reader.GetDouble(5)
            });
        }

        return list;
    }

    public int CreateAccount(string name, string accountType, string currency, double? creditLimit, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetAccounts (Name, AccountType, Currency, CreditLimit)
            VALUES ($n, $t, $c, $lim)";
        cmd.Parameters.AddWithValue("$n", name.Trim());
        cmd.Parameters.AddWithValue("$t", accountType);
        cmd.Parameters.AddWithValue("$c", string.IsNullOrWhiteSpace(currency) ? "USD" : currency.ToUpperInvariant());
        cmd.Parameters.AddWithValue("$lim", (object?)creditLimit ?? DBNull.Value);
        cmd.ExecuteNonQuery();
        var id = ReadLastId(conn);
        Audit(actor, "account", id, "create");
        return id;
    }

    // ——— Tags ———

    public List<string> GetAllTags()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Name FROM BudgetTags ORDER BY Name";
        var list = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            list.Add(reader.GetString(0));
        return list;
    }

    // ——— Audit ———

    public List<BudgetAuditEntryModel> GetAuditLog(int limit = 100)
    {
        limit = Math.Clamp(limit, 1, 500);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, EntityType, EntityId, ActorUserId, Action, DataJson, CreatedAt
            FROM BudgetAuditLog ORDER BY Id DESC LIMIT $lim";
        cmd.Parameters.AddWithValue("$lim", limit);
        var list = new List<BudgetAuditEntryModel>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new BudgetAuditEntryModel
            {
                Id = reader.GetInt32(0),
                EntityType = reader.GetString(1),
                EntityId = reader.GetInt32(2),
                ActorUserId = (ulong)reader.GetInt64(3),
                Action = reader.GetString(4),
                DataJson = reader.IsDBNull(5) ? null : reader.GetString(5),
                CreatedAt = reader.GetString(6)
            });
        }

        return list;
    }

    // ——— Recurring ———

    public List<BudgetRecurringModel> GetRecurring(bool activeOnly = true)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Amount, AmountInput, CategoryId, SpentByUserId, Cadence, NextRunDate,
                   Note, Merchant, Type, IsActive, AccountId
            FROM BudgetRecurring" + (activeOnly ? " WHERE IsActive=1" : "") + " ORDER BY NextRunDate";
        var list = new List<BudgetRecurringModel>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new BudgetRecurringModel
            {
                Id = reader.GetInt32(0),
                Amount = reader.GetDouble(1),
                AmountInput = reader.IsDBNull(2) ? null : reader.GetString(2),
                CategoryId = reader.IsDBNull(3) ? null : reader.GetInt32(3),
                SpentByUserId = (ulong)reader.GetInt64(4),
                Cadence = reader.GetString(5),
                NextRunDate = reader.GetString(6),
                Note = reader.IsDBNull(7) ? null : reader.GetString(7),
                Merchant = reader.IsDBNull(8) ? null : reader.GetString(8),
                Type = reader.GetString(9),
                IsActive = reader.GetInt64(10) != 0,
                AccountId = reader.IsDBNull(11) ? null : reader.GetInt32(11)
            });
        }

        return list;
    }

    public int CreateRecurring(
        string amountInput,
        int? categoryId,
        ulong spentByUserId,
        string cadence,
        string nextRunDate,
        string type,
        string? note,
        string? merchant,
        int? accountId,
        ulong actor)
    {
        var amount = EvaluateAmount(amountInput);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetRecurring
            (Amount, AmountInput, CategoryId, SpentByUserId, Cadence, NextRunDate, Note, Merchant, Type, AccountId)
            VALUES ($amt, $input, $cat, $user, $cad, $next, $note, $merchant, $type, $acc)";
        cmd.Parameters.AddWithValue("$amt", amount);
        cmd.Parameters.AddWithValue("$input", amountInput);
        cmd.Parameters.AddWithValue("$cat", (object?)categoryId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$user", (long)spentByUserId);
        cmd.Parameters.AddWithValue("$cad", cadence);
        cmd.Parameters.AddWithValue("$next", nextRunDate);
        cmd.Parameters.AddWithValue("$note", (object?)note ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$merchant", (object?)merchant ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$type", type);
        cmd.Parameters.AddWithValue("$acc", (object?)accountId ?? DBNull.Value);
        cmd.ExecuteNonQuery();
        var id = ReadLastId(conn);
        Audit(actor, "recurring", id, "create");
        return id;
    }

    public void ProcessDueRecurring()
    {
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        foreach (var r in GetRecurring(true))
        {
            if (string.Compare(r.NextRunDate, today, StringComparison.Ordinal) > 0)
                continue;

            CreateTransaction(
                r.Type,
                r.AmountInput ?? r.Amount.ToString(System.Globalization.CultureInfo.InvariantCulture),
                r.CategoryId,
                r.SpentByUserId,
                today,
                r.Note,
                r.Merchant,
                r.AccountId,
                false,
                "USD",
                1,
                null,
                null,
                r.SpentByUserId);

            AdvanceRecurringNextDate(r);
        }
    }

    private void AdvanceRecurringNextDate(BudgetRecurringModel r)
    {
        if (!DateTime.TryParse(r.NextRunDate, out var next))
            next = DateTime.UtcNow;
        next = r.Cadence switch
        {
            "weekly" => next.AddDays(7),
            "yearly" => next.AddYears(1),
            _ => next.AddMonths(1)
        };
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE BudgetRecurring SET NextRunDate=$d WHERE Id=$id";
        cmd.Parameters.AddWithValue("$d", next.ToString("yyyy-MM-dd"));
        cmd.Parameters.AddWithValue("$id", r.Id);
        cmd.ExecuteNonQuery();
    }

    // ——— Bills ———

    public List<BudgetBillModel> GetBills(bool activeOnly = true)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Name, AmountEstimate, DueDay, CategoryId, CalendarItemId, IsActive
            FROM BudgetBills" + (activeOnly ? " WHERE IsActive=1" : "") + " ORDER BY DueDay, Name";
        var list = new List<BudgetBillModel>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new BudgetBillModel
            {
                Id = reader.GetInt32(0),
                Name = reader.GetString(1),
                AmountEstimate = reader.GetDouble(2),
                DueDay = reader.GetInt32(3),
                CategoryId = reader.IsDBNull(4) ? null : reader.GetInt32(4),
                CalendarItemId = reader.IsDBNull(5) ? null : reader.GetInt32(5),
                IsActive = reader.GetInt64(6) != 0
            });
        }

        return list;
    }

    public int CreateBill(string name, double amountEstimate, int dueDay, int? categoryId, int? calendarItemId, ulong actor)
    {
        dueDay = Math.Clamp(dueDay, 1, 28);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetBills (Name, AmountEstimate, DueDay, CategoryId, CalendarItemId)
            VALUES ($n, $amt, $day, $cat, $cal)";
        cmd.Parameters.AddWithValue("$n", name.Trim());
        cmd.Parameters.AddWithValue("$amt", amountEstimate);
        cmd.Parameters.AddWithValue("$day", dueDay);
        cmd.Parameters.AddWithValue("$cat", (object?)categoryId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$cal", (object?)calendarItemId ?? DBNull.Value);
        cmd.ExecuteNonQuery();
        var id = ReadLastId(conn);
        Audit(actor, "bill", id, "create");
        return id;
    }

    public bool UpdateBill(int id, string? name, double? amountEstimate, int? dueDay, int? categoryId, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var sets = new List<string>();
        var cmd = conn.CreateCommand();
        if (name != null)
        {
            sets.Add("Name=$n");
            cmd.Parameters.AddWithValue("$n", name.Trim());
        }
        if (amountEstimate.HasValue)
        {
            sets.Add("AmountEstimate=$amt");
            cmd.Parameters.AddWithValue("$amt", amountEstimate.Value);
        }
        if (dueDay.HasValue)
        {
            sets.Add("DueDay=$day");
            cmd.Parameters.AddWithValue("$day", Math.Clamp(dueDay.Value, 1, 28));
        }
        if (categoryId.HasValue)
        {
            sets.Add("CategoryId=$cat");
            cmd.Parameters.AddWithValue("$cat", categoryId.Value);
        }
        if (sets.Count == 0) return false;
        cmd.CommandText = $"UPDATE BudgetBills SET {string.Join(", ", sets)} WHERE Id=$id";
        cmd.Parameters.AddWithValue("$id", id);
        var ok = cmd.ExecuteNonQuery() > 0;
        if (ok) Audit(actor, "bill", id, "update");
        return ok;
    }

    public bool SetBillActive(int id, bool isActive, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE BudgetBills SET IsActive=$a WHERE Id=$id";
        cmd.Parameters.AddWithValue("$a", isActive ? 1 : 0);
        cmd.Parameters.AddWithValue("$id", id);
        var ok = cmd.ExecuteNonQuery() > 0;
        if (ok) Audit(actor, "bill", id, isActive ? "activate" : "deactivate");
        return ok;
    }

    public bool UpdateRecurring(
        int id,
        string? amountInput,
        int? categoryId,
        ulong? spentByUserId,
        string? cadence,
        string? nextRunDate,
        string? type,
        string? note,
        string? merchant,
        ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var sets = new List<string>();
        var cmd = conn.CreateCommand();
        if (!string.IsNullOrWhiteSpace(amountInput))
        {
            var amt = EvaluateAmount(amountInput);
            sets.Add("Amount=$amt");
            sets.Add("AmountInput=$input");
            cmd.Parameters.AddWithValue("$amt", amt);
            cmd.Parameters.AddWithValue("$input", amountInput);
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
        if (cadence != null)
        {
            sets.Add("Cadence=$cad");
            cmd.Parameters.AddWithValue("$cad", cadence);
        }
        if (nextRunDate != null)
        {
            sets.Add("NextRunDate=$next");
            cmd.Parameters.AddWithValue("$next", nextRunDate);
        }
        if (type != null)
        {
            sets.Add("Type=$type");
            cmd.Parameters.AddWithValue("$type", type);
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
        if (sets.Count == 0) return false;
        cmd.CommandText = $"UPDATE BudgetRecurring SET {string.Join(", ", sets)} WHERE Id=$id";
        cmd.Parameters.AddWithValue("$id", id);
        var ok = cmd.ExecuteNonQuery() > 0;
        if (ok) Audit(actor, "recurring", id, "update");
        return ok;
    }

    public bool SetRecurringActive(int id, bool isActive, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE BudgetRecurring SET IsActive=$a WHERE Id=$id";
        cmd.Parameters.AddWithValue("$a", isActive ? 1 : 0);
        cmd.Parameters.AddWithValue("$id", id);
        var ok = cmd.ExecuteNonQuery() > 0;
        if (ok) Audit(actor, "recurring", id, isActive ? "activate" : "deactivate");
        return ok;
    }

    public int MarkBillPaid(int billId, string amountInput, ulong spentByUserId, ulong actor)
    {
        var bills = GetBills(false);
        var bill = bills.FirstOrDefault(b => b.Id == billId)
                   ?? throw new InvalidOperationException("Bill not found.");
        return CreateTransaction(
            "expense",
            amountInput,
            bill.CategoryId,
            spentByUserId,
            DateTime.UtcNow.ToString("yyyy-MM-dd"),
            $"Bill: {bill.Name}",
            bill.Name,
            null,
            false,
            "USD",
            1,
            null,
            null,
            actor);
    }

    // ——— Exchange rates ———

    public List<BudgetExchangeRateModel> GetExchangeRates()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, FromCurrency, ToCurrency, Rate, EffectiveDate
            FROM BudgetExchangeRates ORDER BY EffectiveDate DESC, FromCurrency";
        var list = new List<BudgetExchangeRateModel>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new BudgetExchangeRateModel
            {
                Id = reader.GetInt32(0),
                FromCurrency = reader.GetString(1),
                ToCurrency = reader.GetString(2),
                Rate = reader.GetDouble(3),
                EffectiveDate = reader.GetString(4)
            });
        }

        return list;
    }

    public void SetExchangeRate(string from, string to, double rate, string effectiveDate, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetExchangeRates (FromCurrency, ToCurrency, Rate, EffectiveDate)
            VALUES ($f, $t, $r, $d)
            ON CONFLICT(FromCurrency, ToCurrency, EffectiveDate) DO UPDATE SET Rate=$r";
        cmd.Parameters.AddWithValue("$f", from.ToUpperInvariant());
        cmd.Parameters.AddWithValue("$t", to.ToUpperInvariant());
        cmd.Parameters.AddWithValue("$r", rate);
        cmd.Parameters.AddWithValue("$d", effectiveDate);
        cmd.ExecuteNonQuery();
        Audit(actor, "exchange_rate", 0, "set", new { from, to, rate });
    }

    public double ResolveExchangeRateToHome(string currency, string homeCurrency, string transactionDate)
    {
        currency = currency.ToUpperInvariant();
        homeCurrency = homeCurrency.ToUpperInvariant();
        if (currency == homeCurrency) return 1;

        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Rate FROM BudgetExchangeRates
            WHERE FromCurrency=$f AND ToCurrency=$t AND EffectiveDate <= $d
            ORDER BY EffectiveDate DESC LIMIT 1";
        cmd.Parameters.AddWithValue("$f", currency);
        cmd.Parameters.AddWithValue("$t", homeCurrency);
        cmd.Parameters.AddWithValue("$d", transactionDate);
        var v = cmd.ExecuteScalar();
        return v == null ? 1 : Convert.ToDouble(v);
    }

    // ——— Notifications & digest ———

    public List<BudgetNotificationItemModel> CollectPendingNotifications(int billDueWithinDays = 3)
    {
        var items = new List<BudgetNotificationItemModel>();
        var month = NormalizeMonth(null);
        foreach (var env in GetEnvelopes(month, null))
        {
            if (env.TargetAmount > 0 && env.PercentUsed >= 100)
            {
                items.Add(new BudgetNotificationItemModel
                {
                    Kind = "over_budget",
                    Message = $"Over budget: {env.CategoryName} ({env.PercentUsed}% of ${env.TargetAmount:N2})"
                });
            }
            else if (env.TargetAmount > 0 && env.PercentUsed >= 85)
            {
                items.Add(new BudgetNotificationItemModel
                {
                    Kind = "pace_warning",
                    Message = $"Pace warning: {env.CategoryName} at {env.PercentUsed}% of envelope"
                });
            }
        }

        var today = DateTime.UtcNow.Day;
        foreach (var bill in GetBills(true))
        {
            var daysUntil = bill.DueDay >= today ? bill.DueDay - today : bill.DueDay + 28 - today;
            if (daysUntil <= billDueWithinDays)
            {
                items.Add(new BudgetNotificationItemModel
                {
                    Kind = "bill_due",
                    Message = $"Bill due soon: {bill.Name} (day {bill.DueDay}, ~${bill.AmountEstimate:N2})"
                });
            }
        }

        return items;
    }

    public string BuildDigestText(bool monthly = false)
    {
        var month = NormalizeMonth(null);
        var summary = GetMonthSummary(month, null, null, null);
        var sb = new StringBuilder();
        sb.AppendLine(monthly ? "📊 **Monthly budget digest**" : "📊 **Weekly budget digest**");
        sb.AppendLine($"Income: ${summary.TotalIncome:N2} | Expenses: ${summary.TotalExpenses:N2} | Net: ${summary.Net:N2}");
        sb.AppendLine("**Top categories:**");
        foreach (var s in GetSummaryByCategory(month, null, null).Take(5))
            sb.AppendLine($"• {s.Label}: ${s.Total:N2} ({s.Percent}%)");
        foreach (var n in CollectPendingNotifications())
            sb.AppendLine($"⚠️ {n.Message}");
        return sb.ToString();
    }

    public bool ShouldSendNotification(string key, TimeSpan minInterval)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT LastSentAt FROM BudgetNotificationLog WHERE NotificationKey=$k";
        cmd.Parameters.AddWithValue("$k", key);
        var v = cmd.ExecuteScalar();
        if (v == null) return true;
        if (!DateTime.TryParse(v.ToString(), out var last)) return true;
        return DateTime.UtcNow - last.ToUniversalTime() >= minInterval;
    }

    public void MarkNotificationSent(string key)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetNotificationLog (NotificationKey, LastSentAt) VALUES ($k, $t)
            ON CONFLICT(NotificationKey) DO UPDATE SET LastSentAt=$t";
        cmd.Parameters.AddWithValue("$k", key);
        cmd.Parameters.AddWithValue("$t", DateTime.UtcNow.ToString("o"));
        cmd.ExecuteNonQuery();
    }
}
