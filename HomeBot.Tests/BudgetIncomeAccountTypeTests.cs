using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

/// <summary>Income/reimbursement may be recorded against any account type, not just checking/savings.</summary>
public sealed class BudgetIncomeAccountTypeTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly BudgetService _budget;
    private const ulong Actor = 500_001;

    public BudgetIncomeAccountTypeTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_budget_income_acct_{Guid.NewGuid():N}.db");
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

    private int CreateIncome(int? accountId, string amount = "100") =>
        _budget.CreateTransaction(
            "income", amount, null, Actor, "2026-04-01", null, null, "Paycheck",
            accountId, false, "USD", 1, null, null, Actor);

    [Fact]
    public void Income_into_credit_account_succeeds()
    {
        var card = _budget.CreateAccount("Visa", "credit", "USD", 2000, Actor);

        CreateIncome(card);

        Assert.Equal(100, Assert.Single(_budget.GetAccounts(), a => a.Id == card).CurrentBalance);
    }

    [Fact]
    public void Income_into_cash_account_succeeds()
    {
        var cash = _budget.CreateAccount("Cash", "cash", "USD", null, Actor);

        CreateIncome(cash);

        Assert.Equal(100, Assert.Single(_budget.GetAccounts(), a => a.Id == cash).CurrentBalance);
    }

    [Fact]
    public void Income_without_account_prefers_deposit_account()
    {
        // A 'Household' checking account is seeded by the schema migration; income should
        // default to it rather than to a credit card.
        var checking = Assert.Single(_budget.GetAccounts(), a => a.AccountType == "checking");
        var cardId = _budget.CreateAccount("Visa", "credit", "USD", 2000, Actor);

        CreateIncome(null);

        var accounts = _budget.GetAccounts();
        Assert.Equal(100, Assert.Single(accounts, a => a.Id == checking.Id).CurrentBalance);
        Assert.Equal(0, Assert.Single(accounts, a => a.Id == cardId).CurrentBalance);
    }

    [Fact]
    public void Income_without_deposit_account_falls_back_to_other_active_account()
    {
        // Remove the only checking/savings account, leaving just a credit card.
        var seeded = Assert.Single(_budget.GetAccounts());
        Assert.True(_budget.UpdateAccount(seeded.Id, null, "credit", null, null, null, false, Actor));

        CreateIncome(null); // no deposit account exists -> must not throw

        Assert.Equal(100, Assert.Single(_budget.GetAccounts(), a => a.Id == seeded.Id).CurrentBalance);
    }

    [Fact]
    public void Update_income_to_cash_account_succeeds()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        var cash = _budget.CreateAccount("Cash", "cash", "USD", null, Actor);
        var id = CreateIncome(checking);

        Assert.True(_budget.UpdateTransaction(
            id, null, null, null, null, null, null, null, null, null, null, null,
            cash, true, false, Actor));

        var accounts = _budget.GetAccounts();
        Assert.Equal(0, Assert.Single(accounts, a => a.Id == checking).CurrentBalance);
        Assert.Equal(100, Assert.Single(accounts, a => a.Id == cash).CurrentBalance);
    }

    [Fact]
    public void Recurring_income_on_credit_account_succeeds()
    {
        var card = _budget.CreateAccount("Visa", "credit", "USD", 2000, Actor);
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");

        var recId = _budget.CreateRecurring("50", null, Actor, "monthly", today, "income", null, null, card, Actor);
        Assert.True(recId > 0);

        var cash = _budget.CreateAccount("Cash", "cash", "USD", null, Actor);
        Assert.True(_budget.UpdateRecurring(recId, "60", null, null, "monthly", today, "income", null, null, Actor, cash, true));
    }
}
