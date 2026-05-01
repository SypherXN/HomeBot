using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

/// <summary>
/// Service-level tests for <see cref="CalendarService.GetRange"/> covering recurrence expansion
/// (daily, weekly), non-recurring inclusion, and out-of-window rows. Pinned to UTC so expected
/// instance timestamps are independent of the host machine's timezone.
/// </summary>
public sealed class CalendarServiceRangeTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly CalendarService _calendar;

    public CalendarServiceRangeTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_calrange_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        var sc = new ServiceCollection();
        sc.AddSingleton(_ => new DatabaseService(_dbPath));
        sc.AddSingleton<ConfigService>();
        sc.AddSingleton<UndoService>();
        sc.AddSingleton<CalendarService>();
        _services = sc.BuildServiceProvider();

        // Pin timezone to UTC so expansion math is deterministic across CI/dev hosts.
        _services.GetRequiredService<ConfigService>().Set("timezone", "UTC");

        _calendar = _services.GetRequiredService<CalendarService>();
    }

    public void Dispose()
    {
        _services.Dispose();
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
    public void NonRecurring_emits_single_instance_inside_window()
    {
        _calendar.AddItem("Once", "event", "2026-04-15 10:00", "", false, "", null, "", "", "", "", "UTC");

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 18),
            null);

        Assert.Single(instances);
        Assert.Equal("2026-04-15T10:00:00Z", instances[0].InstanceStartUtc);
        Assert.False(instances[0].IsRecurringInstance);
    }

    [Fact]
    public void NonRecurring_outside_window_is_excluded()
    {
        _calendar.AddItem("Past", "event", "2026-04-01 10:00", "", false, "", null, "", "", "", "", "UTC");
        _calendar.AddItem("Future", "event", "2026-05-01 10:00", "", false, "", null, "", "", "", "", "UTC");

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 18),
            null);

        Assert.Empty(instances);
    }

    [Fact]
    public void Daily_recurrence_expands_one_instance_per_day_in_window()
    {
        _calendar.AddItem("Daily", "event", "2026-04-10 09:00", "", false, "", null, "", "", "", "daily", "UTC");

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 18),
            null);

        Assert.Equal(3, instances.Count);
        Assert.All(instances, i => Assert.True(i.IsRecurringInstance));
        Assert.Equal("2026-04-15T09:00:00Z", instances[0].InstanceStartUtc);
        Assert.Equal("2026-04-16T09:00:00Z", instances[1].InstanceStartUtc);
        Assert.Equal("2026-04-17T09:00:00Z", instances[2].InstanceStartUtc);
    }

    [Fact]
    public void Daily_recurrence_starts_no_earlier_than_stored_start()
    {
        _calendar.AddItem("Daily", "event", "2026-04-16 09:00", "", false, "", null, "", "", "", "daily", "UTC");

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 18),
            null);

        Assert.Equal(2, instances.Count);
        Assert.Equal("2026-04-16T09:00:00Z", instances[0].InstanceStartUtc);
        Assert.Equal("2026-04-17T09:00:00Z", instances[1].InstanceStartUtc);
    }

    [Fact]
    public void Weekly_recurrence_emits_only_matching_weekday()
    {
        // 2026-04-08 is a Wednesday.
        _calendar.AddItem("Weekly Wed", "event", "2026-04-08 09:00", "", false, "", null, "", "", "", "weekly", "UTC");

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 12),
            new DateTime(2026, 5, 3),
            null);

        Assert.Equal(3, instances.Count);
        Assert.Equal("2026-04-15T09:00:00Z", instances[0].InstanceStartUtc);
        Assert.Equal("2026-04-22T09:00:00Z", instances[1].InstanceStartUtc);
        Assert.Equal("2026-04-29T09:00:00Z", instances[2].InstanceStartUtc);
        Assert.All(instances, i => Assert.True(i.IsRecurringInstance));
    }

    [Fact]
    public void Tasks_are_excluded_from_range()
    {
        _calendar.AddItem("A task", "task", "", "", false, "", null, "", "", "", "", "UTC");

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 18),
            null);

        Assert.Empty(instances);
    }

    [Fact]
    public void End_time_is_emitted_with_same_offset_per_instance()
    {
        _calendar.AddItem("Daily 1h", "event", "2026-04-10 09:00", "2026-04-10 10:00", false, "", null, "", "", "", "daily", "UTC");

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 17),
            null);

        Assert.Equal(2, instances.Count);
        Assert.Equal("2026-04-15T10:00:00Z", instances[0].InstanceEndUtc);
        Assert.Equal("2026-04-16T10:00:00Z", instances[1].InstanceEndUtc);
    }

    [Fact]
    public void UserFilter_includes_assigned_user_and_everyone_only()
    {
        _calendar.AddItem("Alice", "event", "2026-04-15 09:00", "", false, "", 111UL, "", "", "", "", "UTC");
        _calendar.AddItem("Bob", "event", "2026-04-15 10:00", "", false, "", 222UL, "", "", "", "", "UTC");
        _calendar.AddItem("Everyone", "event", "2026-04-15 11:00", "", false, "", 0UL, "", "", "", "", "UTC");

        var aliceView = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 16),
            111UL);

        Assert.Equal(2, aliceView.Count);
        Assert.Contains(aliceView, i => i.Title == "Alice");
        Assert.Contains(aliceView, i => i.Title == "Everyone");
        Assert.DoesNotContain(aliceView, i => i.Title == "Bob");
    }

    [Fact]
    public void Inverted_window_returns_empty()
    {
        _calendar.AddItem("X", "event", "2026-04-15 09:00", "", false, "", null, "", "", "", "", "UTC");

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 18),
            new DateTime(2026, 4, 15),
            null);

        Assert.Empty(instances);
    }

    [Fact]
    public void Window_exceeding_max_returns_empty()
    {
        _calendar.AddItem("X", "event", "2026-04-15 09:00", "", false, "", null, "", "", "", "", "UTC");

        var from = new DateTime(2026, 1, 1);
        var to = from.AddDays(CalendarService.RangeMaxDays + 1);
        var instances = _calendar.GetRange(from, to, null);

        Assert.Empty(instances);
    }
}
