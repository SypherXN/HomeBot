using Xunit;

namespace HomeBot.Tests;

public sealed class CalendarIcsExportTests
{
    [Fact]
    public void Build_skips_tasks_and_includes_timed_events()
    {
        var items = new List<CalendarRangeItemModel>
        {
            new()
            {
                Id = 1,
                Title = "Meeting",
                Type = "event",
                InstanceStartUtc = "2026-06-10T14:00:00Z",
                InstanceEndUtc = "2026-06-10T15:00:00Z",
            },
            new()
            {
                Id = 2,
                Title = "Todo",
                Type = "task",
                InstanceStartUtc = "2026-06-10T14:00:00Z",
            },
        };

        var ics = CalendarIcsExport.Build(items);
        Assert.Contains("Meeting", ics, StringComparison.Ordinal);
        Assert.DoesNotContain("Todo", ics, StringComparison.Ordinal);
        Assert.Contains("BEGIN:VEVENT", ics, StringComparison.Ordinal);
    }

    [Fact]
    public void Build_escapes_special_characters_in_summary()
    {
        var items = new List<CalendarRangeItemModel>
        {
            new()
            {
                Id = 3,
                Title = "A; B, C\\D",
                Type = "event",
                InstanceStartUtc = "2026-06-11T10:00:00Z",
            },
        };

        var ics = CalendarIcsExport.Build(items);
        Assert.Contains("SUMMARY:A\\; B\\, C\\\\D", ics, StringComparison.Ordinal);
    }
}
