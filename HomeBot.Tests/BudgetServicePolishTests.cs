using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

/// <summary>
/// Service-level tests for budget polish: accounts, transfers, envelopes, categories, recurring processing.
/// </summary>
public sealed class BudgetServicePolishTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly BudgetService _budget;
    private const ulong Actor = 300_001;

    public BudgetServicePolishTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_budget_polish_{Guid.NewGuid():N}.db");
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
    public void CreateAccount_and_transfer_updates_balances()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        var savings = _budget.CreateAccount("Savings", "savings", "USD", null, Actor);

        _budget.CreateTransfer("100", checking, savings, "2026-03-01", "move", Actor);

        var accounts = _budget.GetAccounts();
        var chk = Assert.Single(accounts, a => a.Id == checking);
        var sav = Assert.Single(accounts, a => a.Id == savings);
        Assert.Equal(-100, chk.CurrentBalance);
        Assert.Equal(100, sav.CurrentBalance);
    }

    [Fact]
    public void SetEnvelope_persists_target_for_month()
    {
        var catId = _budget.CreateCategory("Rent", null, null, "household", false, Actor);
        _budget.SetEnvelope("2026-04", catId, 1500, Actor);

        var envs = _budget.GetEnvelopes("2026-04", null);
        var env = Assert.Single(envs, e => e.CategoryId == catId);
        Assert.Equal(1500, env.TargetAmount);
    }

    [Fact]
    public void UpdateCategory_and_delete_category()
    {
        var catId = _budget.CreateCategory("Old", null, null, "household", false, Actor);
        Assert.True(_budget.UpdateCategory(catId, "New Name", null, null, "personal", true, Actor));
        Assert.True(_budget.DeleteCategory(catId, Actor));

        var cats = _budget.GetCategories();
        Assert.DoesNotContain(cats, c => c.Id == catId);
    }

    [Fact]
    public void DeleteTransaction_reverts_account_balance()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        var catId = _budget.CreateCategory("Food", null, null, "household", false, Actor);
        var txId = _budget.CreateTransaction(
            "expense",
            "25",
            catId,
            Actor,
            "2026-03-01",
            null,
            null,
            null,
            checking,
            false,
            "USD",
            1,
            null,
            null,
            Actor);

        var afterCreate = Assert.Single(_budget.GetAccounts(), a => a.Id == checking);
        Assert.Equal(-25, afterCreate.CurrentBalance);

        _budget.DeleteTransaction(txId, Actor);

        var afterDelete = Assert.Single(_budget.GetAccounts(), a => a.Id == checking);
        Assert.Equal(0, afterDelete.CurrentBalance);
        Assert.Null(_budget.GetTransactionById(txId));
    }

    [Fact]
    public void DeleteTransaction_reverts_transfer_balances()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        var savings = _budget.CreateAccount("Savings", "savings", "USD", null, Actor);
        var transferId = _budget.CreateTransfer("100", checking, savings, "2026-03-01", "move", Actor);

        var afterTransfer = _budget.GetAccounts();
        Assert.Equal(-100, Assert.Single(afterTransfer, a => a.Id == checking).CurrentBalance);
        Assert.Equal(100, Assert.Single(afterTransfer, a => a.Id == savings).CurrentBalance);

        _budget.DeleteTransaction(transferId, Actor);

        var afterDelete = _budget.GetAccounts();
        Assert.Equal(0, Assert.Single(afterDelete, a => a.Id == checking).CurrentBalance);
        Assert.Equal(0, Assert.Single(afterDelete, a => a.Id == savings).CurrentBalance);
    }

    [Fact]
    public void UpdateTransaction_changes_date_spender_and_tags()
    {
        var catId = _budget.CreateCategory("Food", null, null, "household", false, Actor);
        var txId = _budget.CreateTransaction(
            "expense",
            "10",
            catId,
            Actor,
            "2026-01-01",
            null,
            null,
            null,
            null,
            false,
            "USD",
            1,
            null,
            new List<string> { "groceries" },
            Actor);

        var other = Actor + 1;
        Assert.True(
            _budget.UpdateTransaction(
                txId,
                "12.50",
                catId,
                other,
                "2026-02-15",
                "lunch",
                null,
                "Cafe",
                false,
                DateTime.UtcNow.ToString("o"),
                null,
                new List<string> { "dining", "out" },
                null,
                false,
                false,
                Actor));

        var list = _budget.GetTransactions(0, "2026-02", null, null, "household");
        var row = Assert.Single(list.Items, t => t.Id == txId);
        Assert.Equal(12.50, row.Amount);
        Assert.Equal(other, row.SpentByUserId);
        Assert.Equal("2026-02-15", row.TransactionDate);
        Assert.Contains("dining", row.Tags);
    }

    [Fact]
    public void ProcessDueRecurring_creates_transaction_when_due()
    {
        var catId = _budget.CreateCategory("Sub", null, null, "household", false, Actor);
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        _budget.CreateRecurring(
            "9.99",
            catId,
            Actor,
            "monthly",
            today,
            "expense",
            null,
            null,
            null,
            Actor);

        _budget.ProcessDueRecurring();

        var txs = _budget.GetTransactions(0, today[..7], null, null, "household");
        Assert.Contains(txs.Items, t => t.Amount == 9.99 && t.CategoryId == catId);
    }

    [Fact]
    public void BuildDigestText_includes_goals_when_present()
    {
        _budget.CreateGoal("Emergency", 1000, 250, null, null, Actor);
        var text = _budget.BuildDigestText(monthly: false);
        Assert.Contains("Savings goals", text);
        Assert.Contains("Emergency", text);
    }

    [Fact]
    public void PayBill_creates_expense_transaction()
    {
        var catId = _budget.CreateCategory("Utilities", null, null, "household", false, Actor);
        var billId = _budget.CreateBill("Electric", 80, 15, catId, null, Actor);
        var txId = _budget.MarkBillPaid(billId, "75.50", Actor, Actor);
        Assert.True(txId > 0);

        var month = DateTime.UtcNow.ToString("yyyy-MM");
        var txs = _budget.GetTransactions(0, month, null, null, "household");
        Assert.Contains(txs.Items, t => t.Id == txId);
    }
}
