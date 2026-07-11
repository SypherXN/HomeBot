using Xunit;

namespace HomeBot.Tests;

public sealed class CalendarRecurrenceAdvanceTests
{
    [Theory]
    [InlineData("daily", "2026-07-10 09:00", "2026-07-11 09:00")]
    [InlineData("weekly", "2026-07-10 09:00", "2026-07-17 09:00")]
    [InlineData("monthly", "2026-01-31 09:00", "2026-02-28 09:00")]
    [InlineData("yearly", "2024-02-29 09:00", "2025-02-28 09:00")]
    [InlineData("annual", "2026-03-15 12:00", "2027-03-15 12:00")]
    public void NextStart_advances_supported_recurrence(string recurrence, string from, string expected)
    {
        var start = DateTime.Parse(from);
        var next = CalendarRecurrenceAdvance.NextStart(start, recurrence);
        Assert.Equal(DateTime.Parse(expected), next);
    }

    [Fact]
    public void AdvancePastStaleReminders_heals_stuck_yearly_spam()
    {
        // Birthday tomorrow; 1-day reminder has been due for hours and never advanced.
        var start = DateTime.Parse("2026-07-12 00:00");
        var offset = TimeSpan.FromDays(1);
        var now = DateTime.Parse("2026-07-11 12:00");
        var healed = CalendarRecurrenceAdvance.AdvancePastStaleReminders(start, "yearly", offset, now);
        Assert.Equal(DateTime.Parse("2027-07-12 00:00"), healed);
    }

    [Fact]
    public void AdvancePastStaleReminders_keeps_freshly_due_occurrence()
    {
        var start = DateTime.Parse("2026-07-12 00:00");
        var offset = TimeSpan.FromDays(1);
        // Reminder became due 30 seconds ago — still within grace.
        var now = DateTime.Parse("2026-07-11 00:00:30");
        var healed = CalendarRecurrenceAdvance.AdvancePastStaleReminders(start, "yearly", offset, now);
        Assert.Equal(start, healed);
    }

    [Fact]
    public void AdvancePastStaleReminders_heals_past_birthday_series_start()
    {
        var start = DateTime.Parse("2026-07-10 00:00");
        var offset = TimeSpan.FromHours(1);
        var now = DateTime.Parse("2026-07-11 12:00");
        var healed = CalendarRecurrenceAdvance.AdvancePastStaleReminders(start, "yearly", offset, now);
        Assert.Equal(DateTime.Parse("2027-07-10 00:00"), healed);
    }
}
