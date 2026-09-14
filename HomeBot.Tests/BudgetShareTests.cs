using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

public sealed class BudgetShareTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly BudgetService _budget;
    private const ulong Actor = 400_001;

    public BudgetShareTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_budget_share_{Guid.NewGuid():N}.db");
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
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
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
    public void Expense_charges_show_as_outstanding()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        var expenseId = CreateExpense(checking, "80", "Dinner",
            new BudgetShareChargeInput { OwedByLabel = "Alex", Amount = 20 },
            new BudgetShareChargeInput { OwedByLabel = "Sam", Amount = 20 });

        var overview = _budget.GetSharesOverview();
        Assert.Equal(40, overview.OutstandingTotal, 2);
        Assert.Equal(2, overview.OutstandingPeopleCount);
        Assert.Equal(2, overview.Open.Count);

        var row = _budget.GetTransactionById(expenseId);
        Assert.NotNull(row?.ShareSummary);
        Assert.Equal(40, row!.ShareSummary!.Owed, 2);
        Assert.Equal(40, row.ShareSummary.Remaining, 2);
        Assert.Equal(-80, Assert.Single(_budget.GetAccounts(), a => a.Id == checking).CurrentBalance);
    }

    [Fact]
    public void Reimbursement_reduces_outstanding_and_skips_income_summary()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        CreateExpense(checking, "80", "Dinner",
            new BudgetShareChargeInput { OwedByLabel = "Alex", Amount = 20 },
            new BudgetShareChargeInput { OwedByLabel = "Sam", Amount = 20 });

        var alex = Assert.Single(_budget.GetSharesOverview().Open, c => c.OwedByLabel == "Alex");
        var reimburseId = _budget.CreateTransaction(
            "income",
            "20",
            null,
            Actor,
            "2026-09-14",
            null,
            null,
            "Venmo",
            checking,
            false,
            "USD",
            1,
            null,
            null,
            Actor,
            sharePayments: new List<BudgetSharePaymentInput>
            {
                new() { ChargeId = alex.Id, Amount = 20 }
            });

        var overview = _budget.GetSharesOverview();
        Assert.Equal(20, overview.OutstandingTotal, 2);
        Assert.Equal("Sam", Assert.Single(overview.Open).OwedByLabel);

        var reimburse = _budget.GetTransactionById(reimburseId);
        Assert.Equal("reimbursement", reimburse!.Type);
        Assert.Equal(20, reimburse.ShareSummary!.Received, 2);

        var summary = _budget.GetMonthSummary("2026-09", null, null, null);
        Assert.Equal(60, summary.TotalExpenses, 2);
        Assert.Equal(0, summary.TotalIncome, 2);

        Assert.Equal(-60, Assert.Single(_budget.GetAccounts(), a => a.Id == checking).CurrentBalance);
    }

    [Fact]
    public void Ignore_and_restore_charge()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        CreateExpense(checking, "40", "Lunch",
            new BudgetShareChargeInput { OwedByLabel = "Alex", Amount = 20 });

        var charge = Assert.Single(_budget.GetSharesOverview().Open);
        Assert.True(_budget.SetShareChargeStatus(charge.Id, "ignored", Actor));
        Assert.Equal(0, _budget.GetSharesOverview().OutstandingTotal, 2);
        Assert.Single(_budget.GetSharesOverview().Ignored);

        Assert.True(_budget.SetShareChargeStatus(charge.Id, "open", Actor));
        Assert.Equal(20, _budget.GetSharesOverview().OutstandingTotal, 2);
    }

    [Fact]
    public void Delete_expense_clears_charges_and_delete_reimbursement_restores_remaining()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        var expenseId = CreateExpense(checking, "50", "Tacos",
            new BudgetShareChargeInput { OwedByLabel = "Alex", Amount = 25 });
        var charge = Assert.Single(_budget.GetSharesOverview().Open);
        var reimburseId = _budget.CreateTransaction(
            "reimbursement",
            "10",
            null,
            Actor,
            "2026-09-14",
            null,
            null,
            null,
            checking,
            false,
            "USD",
            1,
            null,
            null,
            Actor,
            sharePayments: new List<BudgetSharePaymentInput> { new() { ChargeId = charge.Id, Amount = 10 } });

        Assert.Equal(15, _budget.GetSharesOverview().OutstandingTotal, 2);
        _budget.DeleteTransaction(reimburseId, Actor);
        Assert.Equal(25, _budget.GetSharesOverview().OutstandingTotal, 2);

        _budget.DeleteTransaction(expenseId, Actor);
        Assert.Empty(_budget.GetSharesOverview().Open);
        Assert.Equal(0, Assert.Single(_budget.GetAccounts(), a => a.Id == checking).CurrentBalance);
    }

    [Fact]
    public void Rejects_overcharge_and_overpay()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        Assert.Throws<ArgumentException>(() =>
            CreateExpense(checking, "20", "Coffee",
                new BudgetShareChargeInput { OwedByLabel = "Alex", Amount = 25 }));

        CreateExpense(checking, "20", "Coffee",
            new BudgetShareChargeInput { OwedByLabel = "Alex", Amount = 10 });
        var charge = Assert.Single(_budget.GetSharesOverview().Open);
        Assert.Throws<ArgumentException>(() =>
            _budget.CreateTransaction(
                "reimbursement",
                "5",
                null,
                Actor,
                "2026-09-14",
                null,
                null,
                null,
                checking,
                false,
                "USD",
                1,
                null,
                null,
                Actor,
                sharePayments: new List<BudgetSharePaymentInput> { new() { ChargeId = charge.Id, Amount = 12 } }));
    }

    [Fact]
    public void Reimbursement_on_credit_is_rejected()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        var card = _budget.CreateAccount("Visa", "credit", "USD", 2000, Actor);
        CreateExpense(checking, "20", "Dinner",
            new BudgetShareChargeInput { OwedByLabel = "Alex", Amount = 10 });
        var charge = Assert.Single(_budget.GetSharesOverview().Open);
        Assert.Throws<ArgumentException>(() =>
            _budget.CreateTransaction(
                "reimbursement",
                "10",
                null,
                Actor,
                "2026-09-14",
                null,
                null,
                null,
                card,
                false,
                "USD",
                1,
                null,
                null,
                Actor,
                sharePayments: new List<BudgetSharePaymentInput> { new() { ChargeId = charge.Id, Amount = 10 } }));
    }

    [Fact]
    public void Regular_income_still_counts_as_income()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        _budget.CreateTransaction(
            "income",
            "100",
            null,
            Actor,
            "2026-09-01",
            null,
            null,
            "Paycheck",
            checking,
            false,
            "USD",
            1,
            null,
            null,
            Actor);
        var summary = _budget.GetMonthSummary("2026-09", null, null, null);
        Assert.Equal(100, summary.TotalIncome, 2);
    }

    [Fact]
    public void Ignored_charge_cannot_be_reimbursed_until_restored()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        CreateExpense(checking, "20", "Dinner",
            new BudgetShareChargeInput { OwedByLabel = "Alex", Amount = 10 });
        var charge = Assert.Single(_budget.GetSharesOverview().Open);
        _budget.SetShareChargeStatus(charge.Id, "ignored", Actor);
        Assert.Throws<ArgumentException>(() =>
            _budget.CreateTransaction(
                "reimbursement",
                "10",
                null,
                Actor,
                "2026-09-14",
                null,
                null,
                null,
                checking,
                false,
                "USD",
                1,
                null,
                null,
                Actor,
                sharePayments: new List<BudgetSharePaymentInput> { new() { ChargeId = charge.Id, Amount = 10 } }));
    }

    [Fact]
    public void Share_outstanding_uses_awaiting_repayment_category()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        var dining = _budget.CreateCategory("Dining", null, null, "household", false, Actor);
        _budget.CreateTransaction(
            "expense",
            "80",
            dining,
            Actor,
            "2026-09-13",
            null,
            null,
            "Dinner",
            checking,
            false,
            "USD",
            1,
            null,
            null,
            Actor,
            shareCharges: new List<BudgetShareChargeInput>
            {
                new() { OwedByLabel = "Alex", Amount = 40 }
            });

        var cats = _budget.GetSummaryByCategory("2026-09", null, null);
        Assert.Equal(40, Assert.Single(cats, s => s.Label == "Dining").Total, 2);
        var awaiting = Assert.Single(cats, s => s.Key == "-1");
        Assert.Equal("Awaiting repayment", awaiting.Label);
        Assert.Equal(40, awaiting.Total, 2);
        Assert.Equal(80, _budget.GetMonthSummary("2026-09", null, null, null).TotalExpenses, 2);

        var charge = Assert.Single(_budget.GetSharesOverview().Open);
        Assert.True(_budget.SetShareChargeStatus(charge.Id, "reimbursed", Actor));
        cats = _budget.GetSummaryByCategory("2026-09", null, null);
        Assert.Equal(40, Assert.Single(cats, s => s.Label == "Dining").Total, 2);
        Assert.DoesNotContain(cats, s => s.Key == "-1");
        Assert.Equal(40, _budget.GetMonthSummary("2026-09", null, null, null).TotalExpenses, 2);
        Assert.Equal(-80, Assert.Single(_budget.GetAccounts(), a => a.Id == checking).CurrentBalance);
        Assert.Single(_budget.GetSharesOverview().Reimbursed);
    }

    [Fact]
    public void Ignored_share_returns_to_original_category()
    {
        var checking = _budget.CreateAccount("Checking", "checking", "USD", null, Actor);
        var dining = _budget.CreateCategory("Dining", null, null, "household", false, Actor);
        _budget.CreateTransaction(
            "expense",
            "40",
            dining,
            Actor,
            "2026-09-13",
            null,
            null,
            "Lunch",
            checking,
            false,
            "USD",
            1,
            null,
            null,
            Actor,
            shareCharges: new List<BudgetShareChargeInput>
            {
                new() { OwedByLabel = "Alex", Amount = 20 }
            });

        var charge = Assert.Single(_budget.GetSharesOverview().Open);
        Assert.True(_budget.SetShareChargeStatus(charge.Id, "ignored", Actor));
        var cats = _budget.GetSummaryByCategory("2026-09", null, null);
        Assert.Equal(40, Assert.Single(cats, s => s.Label == "Dining").Total, 2);
        Assert.DoesNotContain(cats, s => s.Key == "-1");
        Assert.Equal(40, _budget.GetMonthSummary("2026-09", null, null, null).TotalExpenses, 2);
    }

    private int CreateExpense(int accountId, string amount, string merchant, params BudgetShareChargeInput[] charges)
    {
        return _budget.CreateTransaction(
            "expense",
            amount,
            null,
            Actor,
            "2026-09-13",
            null,
            null,
            merchant,
            accountId,
            false,
            "USD",
            1,
            null,
            null,
            Actor,
            shareCharges: charges.ToList());
    }
}
