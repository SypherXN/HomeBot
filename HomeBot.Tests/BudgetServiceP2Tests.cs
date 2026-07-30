using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

public sealed class BudgetServiceP2Tests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly BudgetService _budget;
    private const ulong Actor = 400_001;

    public BudgetServiceP2Tests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_budget_p2_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        var sc = new ServiceCollection();
        sc.AddSingleton(_ => new DatabaseService(_dbPath));
        sc.AddSingleton<ConfigService>();
        sc.AddSingleton<UndoService>();
        sc.AddSingleton<BudgetService>();
        _services = sc.BuildServiceProvider();
        _budget = _services.GetRequiredService<BudgetService>();
    }

    public void Dispose()
    {
        _services.Dispose();
        SqliteConnection.ClearAllPools();
        try
        {
            if (File.Exists(_dbPath))
                File.Delete(_dbPath);
        }
        catch
        {
            // best-effort
        }
    }

    [Fact]
    public void SetOpeningBalance_does_not_count_as_month_income()
    {
        var accountId = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        _budget.SetOpeningBalance(accountId, "500", "2026-05-01", Actor);

        var summary = _budget.GetMonthSummary("2026-05", null, null, null);
        Assert.Equal(0, summary.TotalIncome);
        Assert.Equal(0, summary.TotalExpenses);

        var account = Assert.Single(_budget.GetAccounts(), a => a.Id == accountId);
        Assert.Equal(500, account.CurrentBalance);
    }

    [Fact]
    public void RollEnvelopes_targets_mode_copies_targets_and_leave_amounts()
    {
        var catId = _budget.CreateCategory("Groceries", null, null, "household", false, Actor);
        _budget.SetEnvelope("2026-05", catId, 400, Actor, leaveAmount: 50);

        var count = _budget.RollEnvelopes("2026-05", "2026-06", "targets", Actor);
        Assert.Equal(1, count);

        var env = Assert.Single(_budget.GetEnvelopes("2026-06", null), e => e.CategoryId == catId);
        Assert.Equal(400, env.TargetAmount);
        Assert.Equal(50, env.LeaveAmount);
    }
}
