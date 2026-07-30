using System.Globalization;
using System.Text;
using Microsoft.Data.Sqlite;

public partial class BudgetService
{
    public BudgetMonthSummaryModel GetMonthSummary(string? month, ulong? spentByUserId, int? categoryId, string? scope)
    {
        var m = NormalizeMonth(month);
        var rows = FilterExpenseIncomeRows(m, spentByUserId, categoryId, scope);
        var income = rows.Where(r => r.Type == "income").Sum(r => r.HomeAmount);
        var expenses = rows.Where(r => r.Type == "expense").Sum(r => r.HomeAmount);
        return new BudgetMonthSummaryModel
        {
            Month = m,
            TotalIncome = income,
            TotalExpenses = expenses,
            Net = income - expenses
        };
    }

    public List<BudgetSummarySliceModel> GetSummaryByCategory(string? month, ulong? spentByUserId, string? scope)
    {
        var m = NormalizeMonth(month);
        var groups = FilterExpenseIncomeRows(m, spentByUserId, null, scope)
            .Where(r => r.Type == "expense")
            .GroupBy(r => (r.CategoryId, r.CategoryLabel))
            .Select(g => new { g.Key.CategoryId, g.Key.CategoryLabel, Total = g.Sum(x => x.HomeAmount) })
            .Where(x => x.Total > 0)
            .OrderByDescending(x => x.Total)
            .ToList();

        var sum = groups.Sum(x => x.Total);
        return groups.Select(g => new BudgetSummarySliceModel
        {
            Key = g.CategoryId?.ToString() ?? "0",
            Label = g.CategoryLabel ?? "Uncategorized",
            Total = g.Total,
            Percent = sum > 0 ? Math.Round(g.Total / sum * 100, 1) : 0
        }).ToList();
    }

    public List<BudgetSummarySliceModel> GetSummaryByUser(string? month, int? categoryId, string? scope)
    {
        var m = NormalizeMonth(month);
        var groups = FilterExpenseIncomeRows(m, null, categoryId, scope)
            .Where(r => r.Type == "expense")
            .GroupBy(r => r.SpentByUserId)
            .Select(g => new
            {
                UserId = g.Key,
                Total = g.Sum(x => x.HomeAmount)
            })
            .Where(x => x.Total > 0)
            .OrderByDescending(x => x.Total)
            .ToList();

        var sum = groups.Sum(x => x.Total);
        return groups.Select(g => new BudgetSummarySliceModel
        {
            Key = g.UserId.ToString(),
            Label = HouseholdIdentity.MemberLabel(g.UserId),
            Total = g.Total,
            Percent = sum > 0 ? Math.Round(g.Total / sum * 100, 1) : 0
        }).ToList();
    }

    private sealed record ExpenseRow(
        string Type,
        int? CategoryId,
        string? CategoryLabel,
        ulong SpentByUserId,
        double HomeAmount);

    private List<ExpenseRow> FilterExpenseIncomeRows(string month, ulong? spentByUserId, int? categoryId, string? scope)
    {
        var personal = scope == "all"
            ? new HashSet<string>()
            : GetCategories().Where(c => c.Visibility == "personal").Select(c => c.Name)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var cats = GetCategories().ToDictionary(c => c.Id, c => c.Name);
        var list = new List<ExpenseRow>();
        foreach (var t in LoadAllTransactions().Where(t => MonthContainsDate(month, t.TransactionDate)))
        {
            if (t.Type is not ("expense" or "income"))
                continue;

            if (t.Splits.Count > 0)
            {
                foreach (var s in t.Splits)
                {
                    var uid = s.SpentByUserId ?? t.SpentByUserId;
                    if (spentByUserId.HasValue && spentByUserId.Value != 0 && uid != spentByUserId)
                        continue;
                    var cid = s.CategoryId ?? t.CategoryId;
                    if (categoryId.HasValue && cid != categoryId)
                        continue;
                    var label = cid.HasValue && cats.TryGetValue(cid.Value, out var n) ? n : "Uncategorized";
                    if (personal.Contains(label))
                        continue;
                    var portion = s.Amount * t.ExchangeRateToHome;
                    list.Add(new ExpenseRow(t.Type, cid, label, uid, portion));
                }
            }
            else
            {
                if (spentByUserId.HasValue && spentByUserId.Value != 0 && t.SpentByUserId != spentByUserId)
                    continue;
                if (categoryId.HasValue && t.CategoryId != categoryId)
                    continue;
                var label = t.CategoryName ?? "Uncategorized";
                if (personal.Contains(label))
                    continue;
                list.Add(new ExpenseRow(t.Type, t.CategoryId, label, t.SpentByUserId,
                    t.Amount * t.ExchangeRateToHome));
            }
        }

        return list;
    }

    public List<BudgetEnvelopeModel> GetEnvelopes(string month, ulong? spentByUserId)
    {
        month = NormalizeMonth(month);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT e.Id, e.Month, e.CategoryId, c.Name, e.TargetAmount, COALESCE(e.LeaveAmount, 0)
            FROM BudgetEnvelopes e
            JOIN BudgetCategories c ON c.Id = e.CategoryId
            WHERE e.Month=$m
            ORDER BY c.SortOrder, c.Name";
        cmd.Parameters.AddWithValue("$m", month);
        var envelopes = new List<BudgetEnvelopeModel>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var catId = reader.GetInt32(2);
            var actual = SumCategoryExpenses(month, catId, spentByUserId);
            var target = reader.GetDouble(4);
            var leaveAmount = reader.GetDouble(5);
            envelopes.Add(new BudgetEnvelopeModel
            {
                Id = reader.GetInt32(0),
                Month = reader.GetString(1),
                CategoryId = catId,
                CategoryName = reader.GetString(3),
                TargetAmount = target,
                LeaveAmount = leaveAmount,
                ActualAmount = actual,
                Remaining = target - actual,
                PercentUsed = target > 0 ? Math.Round(actual / target * 100, 1) : 0
            });
        }

        return envelopes;
    }

    private double SumCategoryExpenses(string month, int categoryId, ulong? spentByUserId)
    {
        return FilterExpenseIncomeRows(month, spentByUserId, categoryId, null)
            .Where(r => r.Type == "expense" && r.CategoryId == categoryId)
            .Sum(r => r.HomeAmount);
    }

    public void SetEnvelope(string month, int categoryId, double targetAmount, ulong actor, double leaveAmount = 0)
    {
        month = NormalizeMonth(month);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetEnvelopes (Month, CategoryId, TargetAmount, LeaveAmount)
            VALUES ($m, $c, $t, $leave)
            ON CONFLICT(Month, CategoryId) DO UPDATE SET TargetAmount=$t, LeaveAmount=$leave";
        cmd.Parameters.AddWithValue("$m", month);
        cmd.Parameters.AddWithValue("$c", categoryId);
        cmd.Parameters.AddWithValue("$t", targetAmount);
        cmd.Parameters.AddWithValue("$leave", leaveAmount);
        cmd.ExecuteNonQuery();
        Audit(actor, "envelope", categoryId, "set", new { month, targetAmount, leaveAmount });
    }

    public List<BudgetGoalModel> GetGoals()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Name, TargetAmount, CurrentAmount, TargetDate, CategoryId
            FROM BudgetGoals ORDER BY Id";
        var list = new List<BudgetGoalModel>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var target = reader.GetDouble(2);
            var current = reader.GetDouble(3);
            list.Add(new BudgetGoalModel
            {
                Id = reader.GetInt32(0),
                Name = reader.GetString(1),
                TargetAmount = target,
                CurrentAmount = current,
                TargetDate = reader.IsDBNull(4) ? null : reader.GetString(4),
                CategoryId = reader.IsDBNull(5) ? null : reader.GetInt32(5),
                PercentComplete = target > 0 ? Math.Round(current / target * 100, 1) : 0
            });
        }

        return list;
    }

    public int CreateGoal(string name, double targetAmount, double currentAmount, string? targetDate, int? categoryId, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetGoals (Name, TargetAmount, CurrentAmount, TargetDate, CategoryId)
            VALUES ($n, $target, $cur, $date, $cat)";
        cmd.Parameters.AddWithValue("$n", name.Trim());
        cmd.Parameters.AddWithValue("$target", targetAmount);
        cmd.Parameters.AddWithValue("$cur", currentAmount);
        cmd.Parameters.AddWithValue("$date", (object?)targetDate ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$cat", (object?)categoryId ?? DBNull.Value);
        cmd.ExecuteNonQuery();
        var id = ReadLastId(conn);
        Audit(actor, "goal", id, "create");
        return id;
    }

    public bool UpdateGoal(int id, string? name, double? targetAmount, double? currentAmount, string? targetDate, int? categoryId,
        ulong actor)
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
        if (targetAmount.HasValue)
        {
            sets.Add("TargetAmount=$t");
            cmd.Parameters.AddWithValue("$t", targetAmount.Value);
        }
        if (currentAmount.HasValue)
        {
            sets.Add("CurrentAmount=$c");
            cmd.Parameters.AddWithValue("$c", currentAmount.Value);
        }
        if (targetDate != null)
        {
            sets.Add("TargetDate=$d");
            cmd.Parameters.AddWithValue("$d", string.IsNullOrWhiteSpace(targetDate) ? DBNull.Value : targetDate);
        }
        if (categoryId.HasValue)
        {
            sets.Add("CategoryId=$cat");
            cmd.Parameters.AddWithValue("$cat", categoryId.Value);
        }

        if (sets.Count == 0) return false;
        cmd.CommandText = $"UPDATE BudgetGoals SET {string.Join(", ", sets)} WHERE Id=$id";
        cmd.Parameters.AddWithValue("$id", id);
        var ok = cmd.ExecuteNonQuery() > 0;
        if (ok) Audit(actor, "goal", id, "update");
        return ok;
    }

    public bool DeleteGoal(int id, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM BudgetGoals WHERE Id=$id";
        cmd.Parameters.AddWithValue("$id", id);
        var ok = cmd.ExecuteNonQuery() > 0;
        if (ok) Audit(actor, "goal", id, "delete");
        return ok;
    }

    public BudgetIncomePlanModel GetIncomePlan(string? month)
    {
        month = NormalizeMonth(month);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT PlannedAmount FROM BudgetIncomePlan WHERE Month=$m";
        cmd.Parameters.AddWithValue("$m", month);
        var planned = cmd.ExecuteScalar();
        var plannedAmt = planned == null ? 0 : Convert.ToDouble(planned);
        var allocated = GetEnvelopes(month, null).Sum(e => e.TargetAmount);
        return new BudgetIncomePlanModel
        {
            Month = month,
            PlannedAmount = plannedAmt,
            AllocatedEnvelopes = allocated,
            AvailableToBudget = plannedAmt - allocated
        };
    }

    public void SetIncomePlan(string month, double plannedAmount, ulong actor)
    {
        month = NormalizeMonth(month);
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetIncomePlan (Month, PlannedAmount) VALUES ($m, $p)
            ON CONFLICT(Month) DO UPDATE SET PlannedAmount=$p";
        cmd.Parameters.AddWithValue("$m", month);
        cmd.Parameters.AddWithValue("$p", plannedAmount);
        cmd.ExecuteNonQuery();
        Audit(actor, "income_plan", 0, "set", new { month, plannedAmount });
    }

    public List<BudgetForecastCategoryModel> GetForecast(string? month)
    {
        month = NormalizeMonth(month);
        var today = DateTime.UtcNow;
        var parts = month.Split('-');
        var year = int.Parse(parts[0]);
        var mon = int.Parse(parts[1]);
        var daysInMonth = DateTime.DaysInMonth(year, mon);
        var dayOfMonth = today.Year == year && today.Month == mon ? today.Day : daysInMonth;
        var factor = dayOfMonth > 0 ? (double)daysInMonth / dayOfMonth : 1;

        var envelopes = GetEnvelopes(month, null).ToDictionary(e => e.CategoryId);
        var byCat = GetSummaryByCategory(month, null, null);
        return byCat.Select(s =>
        {
            var catId = int.TryParse(s.Key, out var id) ? id : 0;
            envelopes.TryGetValue(catId, out var env);
            return new BudgetForecastCategoryModel
            {
                CategoryId = catId,
                CategoryName = s.Label,
                MonthToDate = s.Total,
                ProjectedMonthEnd = Math.Round(s.Total * factor, 2),
                EnvelopeTarget = env?.TargetAmount
            };
        }).ToList();
    }

    public List<BudgetTrendPointModel> GetTrends(int months, string groupBy)
    {
        months = Math.Clamp(months, 1, 36);
        var end = DateTime.UtcNow;
        var start = end.AddMonths(-months + 1);
        var points = new List<BudgetTrendPointModel>();

        for (var d = new DateTime(start.Year, start.Month, 1, 0, 0, 0, DateTimeKind.Utc);
             d <= end;
             d = d.AddMonths(1))
        {
            var m = d.ToString("yyyy-MM");
            if (groupBy == "user")
            {
                foreach (var slice in GetSummaryByUser(m, null, null))
                {
                    points.Add(new BudgetTrendPointModel
                    {
                        Month = m,
                        Key = slice.Key,
                        Label = slice.Label,
                        Total = slice.Total
                    });
                }
            }
            else
            {
                foreach (var slice in GetSummaryByCategory(m, null, null))
                {
                    points.Add(new BudgetTrendPointModel
                    {
                        Month = m,
                        Key = slice.Key,
                        Label = slice.Label,
                        Total = slice.Total
                    });
                }
            }
        }

        return points;
    }

    public List<BudgetTaxSummaryLineModel> GetTaxSummary(int year)
    {
        var lines = new Dictionary<int, (string Name, double Total)>();
        foreach (var c in GetCategories().Where(c => c.IsTaxDeductible))
            lines[c.Id] = (c.Name, 0);

        for (var m = 1; m <= 12; m++)
        {
            var month = $"{year:D4}-{m:D2}";
            foreach (var row in FilterExpenseIncomeRows(month, null, null, null).Where(r => r.Type == "expense"))
            {
                if (!row.CategoryId.HasValue || !lines.ContainsKey(row.CategoryId.Value))
                    continue;
                var cur = lines[row.CategoryId.Value];
                lines[row.CategoryId.Value] = (cur.Name, cur.Total + row.HomeAmount);
            }
        }

        return lines.Select(kv => new BudgetTaxSummaryLineModel
        {
            CategoryId = kv.Key,
            CategoryName = kv.Value.Name,
            Total = kv.Value.Total
        }).OrderByDescending(x => x.Total).ToList();
    }

    public string ExportCsv(string? fromDate, string? toDate)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Id,Type,Date,Amount,Currency,Category,SpentByUserId,Merchant,Note,Tags");
        foreach (var t in LoadAllTransactions().OrderBy(t => t.TransactionDate))
        {
            if (!string.IsNullOrWhiteSpace(fromDate) &&
                string.Compare(t.TransactionDate, fromDate, StringComparison.Ordinal) < 0)
                continue;
            if (!string.IsNullOrWhiteSpace(toDate) &&
                string.Compare(t.TransactionDate, toDate, StringComparison.Ordinal) > 0)
                continue;
            sb.AppendLine(string.Join(",",
                t.Id,
                CsvEscape(t.Type),
                CsvEscape(t.TransactionDate),
                t.Amount.ToString(CultureInfo.InvariantCulture),
                CsvEscape(t.Currency),
                CsvEscape(t.CategoryName ?? ""),
                t.SpentByUserId,
                CsvEscape(t.Merchant ?? ""),
                CsvEscape(t.Note ?? ""),
                CsvEscape(string.Join("|", t.Tags))));
        }

        return sb.ToString();
    }

    public int ImportCsv(string csv, ulong defaultSpentBy, ulong actor)
    {
        var lines = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (lines.Length < 2) return 0;
        var count = 0;
        for (var i = 1; i < lines.Length; i++)
        {
            var cols = ParseCsvLine(lines[i]);
            if (cols.Count < 4) continue;
            var type = cols.Count > 1 ? cols[1] : "expense";
            var date = cols.Count > 2 ? cols[2] : DateTime.UtcNow.ToString("yyyy-MM-dd");
            var amountInput = cols.Count > 3 ? cols[3] : "0";
            var merchant = cols.Count > 7 ? cols[7] : null;
            var note = cols.Count > 8 ? cols[8] : null;
            ulong spender = defaultSpentBy;
            if (cols.Count > 6 && ulong.TryParse(cols[6], out var u))
                spender = u;
            CreateTransaction(type, amountInput, null, spender, date, note, null, merchant, null, false, "USD", 1, null,
                null, actor);
            count++;
        }

        return count;
    }

    private static string CsvEscape(string s)
    {
        if (s.Contains(',') || s.Contains('"'))
            return $"\"{s.Replace("\"", "\"\"")}\"";
        return s;
    }

    private static List<string> ParseCsvLine(string line)
    {
        var result = new List<string>();
        var cur = new StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    cur.Append('"');
                    i++;
                }
                else inQuotes = !inQuotes;
            }
            else if (c == ',' && !inQuotes)
            {
                result.Add(cur.ToString());
                cur.Clear();
            }
            else cur.Append(c);
        }

        result.Add(cur.ToString());
        return result;
    }
}
