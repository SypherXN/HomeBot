using System.Globalization;
using System.Text;
using Microsoft.Data.Sqlite;

/// <summary>
/// Monthly household summary combining budget, buy list, calendar, and money stats.
/// </summary>
public sealed class HouseholdReportService
{
    private readonly DatabaseService _db;
    private readonly BudgetService _budget;
    private readonly CalendarService _calendar;
    private readonly MoneyService _money;
    private readonly ConfigService _config;

    public HouseholdReportService(
        DatabaseService db,
        BudgetService budget,
        CalendarService calendar,
        MoneyService money,
        ConfigService config)
    {
        _db = db;
        _budget = budget;
        _calendar = calendar;
        _money = money;
        _config = config;
    }

    public HouseholdReportModel Build(string? month = null)
    {
        var m = NormalizeMonth(month);
        var monthLabel = DateTime.ParseExact(m + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture)
            .ToString("MMMM yyyy", CultureInfo.InvariantCulture);

        var budgetSummary = _budget.GetMonthSummary(m, null, null, null);
        var topCategories = _budget.GetSummaryByCategory(m, null, null).Take(5).ToList();
        var activeBuy = CountActiveBuyItems();
        var upcomingCalendar = CountUpcomingCalendar(14);
        var moneyUsers = GetDistinctMoneyUsers();
        var balancesSample = BuildBalanceHighlights(moneyUsers);

        var markdown = BuildMarkdown(monthLabel, budgetSummary, topCategories, activeBuy, upcomingCalendar, balancesSample);

        return new HouseholdReportModel
        {
            Month = m,
            MonthLabel = monthLabel,
            Markdown = markdown,
            Budget = new HouseholdReportBudgetSection
            {
                Income = budgetSummary.TotalIncome,
                Expenses = budgetSummary.TotalExpenses,
                Net = budgetSummary.Net,
                TopCategories = topCategories.Select(c => new HouseholdReportLabelTotal
                {
                    Label = c.Label,
                    Total = c.Total,
                    Percent = (int)Math.Round(c.Percent),
                }).ToList(),
            },
            ActiveBuyItems = activeBuy,
            UpcomingCalendarEvents = upcomingCalendar,
            MoneyBalanceHighlights = balancesSample,
        };
    }

    public string BuildMarkdown(
        string monthLabel,
        BudgetMonthSummaryModel budgetSummary,
        IReadOnlyList<BudgetSummarySliceModel> topCategories,
        int activeBuy,
        int upcomingCalendar,
        IReadOnlyList<HouseholdReportBalanceHighlight> balances)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"# Household report — {monthLabel}");
        sb.AppendLine();
        sb.AppendLine("## Budget");
        sb.AppendLine($"- Income: ${budgetSummary.TotalIncome:N2}");
        sb.AppendLine($"- Expenses: ${budgetSummary.TotalExpenses:N2}");
        sb.AppendLine($"- Net: ${budgetSummary.Net:N2}");
        if (topCategories.Count > 0)
        {
            sb.AppendLine("- Top categories:");
            foreach (var c in topCategories)
                sb.AppendLine($"  - {c.Label}: ${c.Total:N2} ({c.Percent:0}%)");
        }

        sb.AppendLine();
        sb.AppendLine("## Buy list");
        sb.AppendLine($"- {activeBuy} active item(s)");

        sb.AppendLine();
        sb.AppendLine("## Calendar");
        sb.AppendLine($"- {upcomingCalendar} upcoming event(s) in the next 14 days");

        if (balances.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("## Money (non-zero balances)");
            foreach (var b in balances)
                sb.AppendLine($"- {b.Label}: ${b.Balance:N2}");
        }

        var digest = _budget.BuildDigestText(monthly: true);
        sb.AppendLine();
        sb.AppendLine("## Budget alerts");
        sb.AppendLine(digest.Replace("📊 **Monthly budget digest**", "").Trim());

        return sb.ToString().TrimEnd();
    }

    private static string NormalizeMonth(string? month)
    {
        if (!string.IsNullOrWhiteSpace(month) &&
            DateTime.TryParseExact(month.Trim() + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
        {
            return month.Trim();
        }

        return DateTime.UtcNow.ToString("yyyy-MM", CultureInfo.InvariantCulture);
    }

    private int CountActiveBuyItems()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM BuyItems WHERE Status = 'active'";
        return Convert.ToInt32(cmd.ExecuteScalar(), CultureInfo.InvariantCulture);
    }

    private int CountUpcomingCalendar(int days)
    {
        var tzRaw = _config.Get("timezone");
        var tz = TimeZoneResolver.Resolve(
            string.IsNullOrWhiteSpace(tzRaw) ? null : tzRaw.Trim(),
            TimeZoneResolver.DefaultHouseholdTimeZoneId);
        var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz).Date;
        var to = today.AddDays(days);
        var range = _calendar.GetRange(today, to, null, tz.Id);
        return range.Count;
    }

    private List<ulong> GetDistinctMoneyUsers()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT DISTINCT PaidBy, OwedBy FROM Transactions";
        using var r = cmd.ExecuteReader();
        var set = new HashSet<ulong>();
        while (r.Read())
        {
            set.Add((ulong)r.GetInt64(0));
            set.Add((ulong)r.GetInt64(1));
        }

        return set.Where(u => u != 0).Take(6).ToList();
    }

    private List<HouseholdReportBalanceHighlight> BuildBalanceHighlights(IReadOnlyList<ulong> users)
    {
        var list = new List<HouseholdReportBalanceHighlight>();
        if (users.Count < 2) return list;

        var anchor = users[0];
        foreach (var other in users.Skip(1))
        {
            var bal = _money.GetNetBalance(anchor, other);
            if (bal == 0) continue;
            list.Add(new HouseholdReportBalanceHighlight
            {
                UserId = other.ToString(CultureInfo.InvariantCulture),
                Label = $"{HouseholdIdentity.MemberLabel(anchor)} ↔ {HouseholdIdentity.MemberLabel(other)}",
                Balance = bal,
            });
            if (list.Count >= 5) break;
        }

        return list;
    }
}

public sealed class HouseholdReportModel
{
    public string Month { get; set; } = "";
    public string MonthLabel { get; set; } = "";
    public string Markdown { get; set; } = "";
    public HouseholdReportBudgetSection Budget { get; set; } = new();
    public int ActiveBuyItems { get; set; }
    public int UpcomingCalendarEvents { get; set; }
    public List<HouseholdReportBalanceHighlight> MoneyBalanceHighlights { get; set; } = [];
}

public sealed class HouseholdReportBudgetSection
{
    public double Income { get; set; }
    public double Expenses { get; set; }
    public double Net { get; set; }
    public List<HouseholdReportLabelTotal> TopCategories { get; set; } = [];
}

public sealed class HouseholdReportLabelTotal
{
    public string Label { get; set; } = "";
    public double Total { get; set; }
    public int Percent { get; set; }
}

public sealed class HouseholdReportBalanceHighlight
{
    public string UserId { get; set; } = "";
    public string Label { get; set; } = "";
    public double Balance { get; set; }
}
