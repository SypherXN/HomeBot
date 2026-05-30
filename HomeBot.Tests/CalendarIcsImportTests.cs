using Xunit;

namespace HomeBot.Tests;

public sealed class CalendarIcsImportTests
{
    [Fact]
    public void Parse_reads_vevent_summary_and_dtstart()
    {
        const string ics = """
            BEGIN:VCALENDAR
            BEGIN:VEVENT
            SUMMARY:Doctor visit
            DTSTART:20260615T140000Z
            DTEND:20260615T150000Z
            END:VEVENT
            END:VCALENDAR
            """;

        var events = CalendarIcsImport.Parse(ics);
        Assert.Single(events);
        Assert.Equal("Doctor visit", events[0].Title);
        Assert.Contains("2026-06-15", events[0].Start, StringComparison.Ordinal);
        Assert.False(events[0].AllDay);
    }

    [Fact]
    public void Parse_handles_all_day_value_date()
    {
        const string ics = """
            BEGIN:VCALENDAR
            BEGIN:VEVENT
            SUMMARY:Holiday
            DTSTART;VALUE=DATE:20260704
            END:VEVENT
            END:VCALENDAR
            """;

        var events = CalendarIcsImport.Parse(ics);
        Assert.Single(events);
        Assert.True(events[0].AllDay);
        Assert.Equal("Holiday", events[0].Title);
    }
}
