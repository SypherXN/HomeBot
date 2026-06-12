using Microsoft.Data.Sqlite;
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
    public void Monthly_recurrence_emits_same_day_each_month()
    {
        _calendar.AddItem("Monthly rent", "event", "2026-01-15 09:00", "", false, "", null, "", "", "", "monthly", "UTC");

        var instances = _calendar.GetRange(
            new DateTime(2026, 1, 1),
            new DateTime(2026, 4, 1),
            null);

        Assert.Equal(3, instances.Count);
        Assert.Equal("2026-01-15T09:00:00Z", instances[0].InstanceStartUtc);
        Assert.Equal("2026-02-15T09:00:00Z", instances[1].InstanceStartUtc);
        Assert.Equal("2026-03-15T09:00:00Z", instances[2].InstanceStartUtc);
    }

    [Fact]
    public void Yearly_recurrence_emits_same_month_day_each_year()
    {
        _calendar.AddItem("Birthday", "event", "2024-03-15 09:00", "", false, "", null, "", "", "", "yearly", "UTC");

        var instances = _calendar.GetRange(
            new DateTime(2024, 1, 1),
            new DateTime(2027, 1, 1),
            null);

        Assert.Equal(3, instances.Count);
        Assert.Equal("2024-03-15T09:00:00Z", instances[0].InstanceStartUtc);
        Assert.Equal("2025-03-15T09:00:00Z", instances[1].InstanceStartUtc);
        Assert.Equal("2026-03-15T09:00:00Z", instances[2].InstanceStartUtc);
        Assert.All(instances, i => Assert.True(i.IsRecurringInstance));
        Assert.All(instances, i => Assert.Equal("🔁 annual", i.RecurrenceText));
    }

    [Fact]
    public void AddItem_normalizes_annual_recurrence_to_yearly()
    {
        var id = _calendar.AddItem("Anniversary", "event", "2026-06-01 12:00", "", false, "", null, "", "", "", "annual", "UTC");
        var item = _calendar.GetItem(id);
        Assert.Equal("yearly", item.Recurrence);
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

    [Fact]
    public void Daily_omitted_instance_is_excluded_from_range()
    {
        _calendar.AddItem("Daily", "event", "2026-04-10 09:00", "", false, "", null, "", "", "", "daily", "UTC");
        var id = QueryLastCalendarItemId();
        _calendar.OmitRecurrenceInstance(id, "2026-04-16T09:00:00Z", 999UL);

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 18),
            null);

        Assert.Equal(2, instances.Count);
        Assert.Equal("2026-04-15T09:00:00Z", instances[0].InstanceStartUtc);
        Assert.Equal("2026-04-17T09:00:00Z", instances[1].InstanceStartUtc);
    }

    [Fact]
    public void Omit_recurrence_undo_restores_instance_in_range()
    {
        var undo = _services.GetRequiredService<UndoService>();
        _calendar.AddItem("Daily", "event", "2026-04-10 09:00", "", false, "", null, "", "", "", "daily", "UTC");
        var id = QueryLastCalendarItemId();
        _calendar.OmitRecurrenceInstance(id, "2026-04-16T09:00:00Z", 42UL);

        var mid = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 18),
            null);
        Assert.Equal(2, mid.Count);

        var r = undo.ApplyLastUndo(42UL);
        Assert.True(r.IsSuccess);

        var after = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 18),
            null);
        Assert.Equal(3, after.Count);
        Assert.Contains(after, i => i.InstanceStartUtc == "2026-04-16T09:00:00Z");
    }

    [Fact]
    public void Completed_instance_is_flagged_in_range()
    {
        _calendar.AddItem("Daily", "event", "2026-04-10 09:00", "", false, "", null, "", "", "", "daily", "UTC");
        var id = QueryLastCalendarItemId();
        _calendar.CompleteRecurrenceInstance(id, "2026-04-16T09:00:00Z", 1UL);

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 18),
            null);

        var apr16 = Assert.Single(instances, i => i.InstanceStartUtc == "2026-04-16T09:00:00Z");
        Assert.True(apr16.IsInstanceCompleted);
    }

    [Fact]
    public void Patch_instance_title_applies_in_range()
    {
        _calendar.AddItem("Daily", "event", "2026-04-10 09:00", "", false, "", null, "", "", "", "daily", "UTC");
        var id = QueryLastCalendarItemId();
        _calendar.PatchRecurrenceInstance(
            id,
            new CalendarInstancePatchRequest { InstanceStartUtc = "2026-04-16T09:00:00Z", Title = "One-off title" },
            1UL);

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 18),
            null);

        var apr16 = Assert.Single(instances, i => i.InstanceStartUtc == "2026-04-16T09:00:00Z");
        Assert.Equal("One-off title", apr16.Title);
        Assert.True(apr16.HasInstanceOverride);
    }

    [Fact]
    public void Patch_instance_time_sets_display_start_in_range()
    {
        _calendar.AddItem("Daily", "event", "2026-04-10 09:00", "", false, "", null, "", "", "", "daily", "UTC");
        var id = QueryLastCalendarItemId();
        _calendar.PatchRecurrenceInstance(
            id,
            new CalendarInstancePatchRequest
            {
                InstanceStartUtc = "2026-04-16T09:00:00Z",
                OverrideInstanceStartUtc = "2026-04-16T15:30:00Z",
            },
            1UL);

        var instances = _calendar.GetRange(
            new DateTime(2026, 4, 15),
            new DateTime(2026, 4, 18),
            null);

        var apr16 = Assert.Single(instances, i => i.InstanceStartUtc == "2026-04-16T09:00:00Z");
        Assert.Equal("2026-04-16T15:30:00Z", apr16.DisplayInstanceStartUtc);
    }

    [Fact]
    public void GetItem_for_instance_merges_title_time_and_span_end()
    {
        _calendar.AddItem("Daily", "event", "2026-04-10 09:00", "2026-04-10 10:00", false, "", null, "", "", "", "daily", "UTC");
        var id = QueryLastCalendarItemId();
        _calendar.PatchRecurrenceInstance(
            id,
            new CalendarInstancePatchRequest
            {
                InstanceStartUtc = "2026-04-16T09:00:00Z",
                Title = "T16",
                OverrideInstanceStartUtc = "2026-04-16T12:00:00Z",
            },
            1UL);

        var d = _calendar.GetItem(id, "2026-04-16T09:00:00Z");
        Assert.NotNull(d);
        Assert.Equal("T16", d.Title);
        Assert.Equal("2026-04-16 12:00", d.Start);
        Assert.Equal("2026-04-16 13:00", d.End);
        Assert.Equal("2026-04-16T09:00:00Z", d.InstanceStartUtc);
    }

    [Fact]
    public void ClearRecurrenceInstance_undo_restores_modify_row()
    {
        _calendar.AddItem("Daily", "event", "2026-04-10 09:00", "", false, "", null, "", "", "", "daily", "UTC");
        var id = QueryLastCalendarItemId();
        _calendar.PatchRecurrenceInstance(
            id,
            new CalendarInstancePatchRequest { InstanceStartUtc = "2026-04-16T09:00:00Z", Title = "X" },
            42UL);

        Assert.True(_calendar.ClearRecurrenceInstance(id, "2026-04-16T09:00:00Z", 42UL));
        var d = _calendar.GetItem(id, "2026-04-16T09:00:00Z");
        Assert.NotNull(d);
        Assert.Equal("Daily", d.Title);

        var undo = _services.GetRequiredService<UndoService>();
        var r = undo.ApplyLastUndo(42UL);
        Assert.True(r.IsSuccess);

        d = _calendar.GetItem(id, "2026-04-16T09:00:00Z");
        Assert.NotNull(d);
        Assert.Equal("X", d.Title);
    }

    private int QueryLastCalendarItemId()
    {
        using var conn = new SqliteConnection($"Data Source={_dbPath}");
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Id FROM CalendarItems ORDER BY Id DESC LIMIT 1";
        return Convert.ToInt32(cmd.ExecuteScalar()!);
    }
}
