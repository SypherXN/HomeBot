using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

public sealed class BudgetBillCalendarServiceTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly BudgetService _budget;
    private readonly CalendarService _calendar;
    private const ulong Actor = 270_001;

    public BudgetBillCalendarServiceTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_bill_cal_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        var sc = new ServiceCollection();
        sc.AddSingleton(_ => new DatabaseService(_dbPath));
        sc.AddSingleton<ConfigService>();
        sc.AddSingleton<UndoService>();
        sc.AddSingleton<CalendarService>();
        sc.AddSingleton<BudgetService>();
        _services = sc.BuildServiceProvider();
        _services.GetRequiredService<ConfigService>().Set("timezone", "UTC");
        _budget = _services.GetRequiredService<BudgetService>();
        _calendar = _services.GetRequiredService<CalendarService>();
    }

    [Fact]
    public void SetBillCalendarItem_persists_link()
    {
        var billId = _budget.CreateBill("Gas", 50, 10, null, null, Actor);
        var calId = _calendar.AddItem(
            "Bill due: Gas",
            "event",
            "2026-07-10 09:00",
            "",
            false,
            "",
            null,
            "",
            "",
            "",
            "monthly",
            "UTC");

        Assert.True(_budget.SetBillCalendarItem(billId, calId, Actor));

        var bill = _budget.GetBills(false).First(b => b.Id == billId);
        Assert.Equal(calId, bill.CalendarItemId);
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
}
