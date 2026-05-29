using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

/// <summary>
/// Tests for <see cref="CalendarService.EditItem"/> series metadata and detail assignee.
/// </summary>
public sealed class CalendarServiceEditTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly CalendarService _calendar;
    private const ulong Assignee = 400_001;

    public CalendarServiceEditTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_cal_edit_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        var sc = new ServiceCollection();
        sc.AddSingleton(_ => new DatabaseService(_dbPath));
        sc.AddSingleton<ConfigService>();
        sc.AddSingleton<UndoService>();
        sc.AddSingleton<CalendarService>();
        _services = sc.BuildServiceProvider();
        _services.GetRequiredService<ConfigService>().Set("timezone", "UTC");
        _calendar = _services.GetRequiredService<CalendarService>();
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
    public void EditItem_updates_all_day_reminder_recurrence_and_assignee()
    {
        _calendar.AddItem(
            "Series",
            "event",
            "2026-05-10 10:00",
            "2026-05-10 11:00",
            false,
            "",
            null,
            "",
            "",
            "",
            "",
            "UTC");

        var id = QueryLastId();
        _calendar.EditItem(
            id,
            "",
            "",
            "",
            "",
            "",
            "",
            null,
            allDay: true,
            reminder: "30m",
            applyReminder: true,
            recurrence: "weekly",
            applyRecurrence: true,
            assignedTo: Assignee,
            applyAssignedTo: true);

        var item = _calendar.GetItem(id);
        Assert.NotNull(item);
        Assert.True(item.AllDay);
        Assert.Equal("weekly", item.Recurrence);
        Assert.Equal(Assignee, item.AssignedTo);
    }

    [Fact]
    public void EditItem_clearEnd_clears_series_end()
    {
        _calendar.AddItem(
            "With end",
            "event",
            "2026-06-01 09:00",
            "2026-06-01 10:00",
            false,
            "",
            null,
            "",
            "",
            "",
            "",
            "UTC");

        var id = QueryLastId();
        _calendar.EditItem(id, "", "", "", "", "", "", null, clearEnd: true);

        var item = _calendar.GetItem(id);
        Assert.NotNull(item);
        Assert.Equal("", item.End);
    }

    [Fact]
    public void EditItem_clearAssignedTo_removes_assignee()
    {
        _calendar.AddItem(
            "Assigned",
            "event",
            "2026-06-05 09:00",
            "",
            false,
            "",
            Assignee,
            "",
            "",
            "",
            "",
            "UTC");

        var id = QueryLastId();
        _calendar.EditItem(
            id,
            "",
            "",
            "",
            "",
            "",
            "",
            null,
            assignedTo: null,
            applyAssignedTo: true);

        var item = _calendar.GetItem(id);
        Assert.NotNull(item);
        Assert.Null(item.AssignedTo);
    }

    [Fact]
    public void EditItem_updates_title_and_end_for_non_recurring_event()
    {
        _calendar.AddItem(
            "Original",
            "event",
            "2026-07-01 09:00",
            "",
            false,
            "",
            null,
            "",
            "",
            "",
            "",
            "UTC");

        var id = QueryLastId();
        _calendar.EditItem(
            id,
            "Renamed",
            "2026-07-01T14:00:00",
            "2026-07-01T16:00:00",
            "",
            "",
            "",
            "UTC");

        var item = _calendar.GetItem(id);
        Assert.NotNull(item);
        Assert.Equal("Renamed", item.Title);
        Assert.Contains("14:00", item.Start);
        Assert.Contains("16:00", item.End);
    }

    private int QueryLastId()
    {
        using var conn = new SqliteConnection($"Data Source={_dbPath}");
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Id FROM CalendarItems ORDER BY Id DESC LIMIT 1";
        return Convert.ToInt32(cmd.ExecuteScalar()!);
    }
}
