using System.Globalization;
using System.Text;

/// <summary>Parses iCalendar (.ics) VEVENT blocks for import into HomeBot calendar.</summary>
public static class CalendarIcsImport
{
    public sealed class ParsedEvent
    {
        public string Title { get; set; } = "";
        public string Start { get; set; } = "";
        public string End { get; set; } = "";
        public bool AllDay { get; set; }
        public string Description { get; set; } = "";
    }

    public static IReadOnlyList<ParsedEvent> Parse(string icsText)
    {
        if (string.IsNullOrWhiteSpace(icsText))
            return Array.Empty<ParsedEvent>();

        var unfolded = UnfoldLines(icsText);
        var events = new List<ParsedEvent>();
        ParsedEvent? current = null;
        var inEvent = false;

        foreach (var rawLine in unfolded)
        {
            var line = rawLine.TrimEnd('\r', '\n');
            if (line.Equals("BEGIN:VEVENT", StringComparison.OrdinalIgnoreCase))
            {
                inEvent = true;
                current = new ParsedEvent();
                continue;
            }

            if (line.Equals("END:VEVENT", StringComparison.OrdinalIgnoreCase))
            {
                if (inEvent && current != null && !string.IsNullOrWhiteSpace(current.Title) && !string.IsNullOrWhiteSpace(current.Start))
                    events.Add(current);
                inEvent = false;
                current = null;
                continue;
            }

            if (!inEvent || current is null)
                continue;

            var colon = line.IndexOf(':');
            if (colon <= 0)
                continue;

            var namePart = line[..colon];
            var value = UnescapeIcsText(line[(colon + 1)..]);
            var prop = namePart.Split(';', 2)[0];

            switch (prop.ToUpperInvariant())
            {
                case "SUMMARY":
                    current.Title = value;
                    break;
                case "DESCRIPTION":
                    current.Description = value;
                    break;
                case "DTSTART":
                    ParseDateTime(namePart, value, out var start, out var allDayStart);
                    current.Start = start;
                    current.AllDay = allDayStart;
                    break;
                case "DTEND":
                    ParseDateTime(namePart, value, out var end, out _);
                    current.End = end;
                    break;
            }
        }

        return events;
    }

    private static IEnumerable<string> UnfoldLines(string text)
    {
        using var reader = new StringReader(text);
        var sb = new StringBuilder();
        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            if (line.StartsWith(' ') || line.StartsWith('\t'))
            {
                sb.Append(line.TrimStart());
                continue;
            }

            if (sb.Length > 0)
            {
                yield return sb.ToString();
                sb.Clear();
            }

            sb.Append(line);
        }

        if (sb.Length > 0)
            yield return sb.ToString();
    }

    private static void ParseDateTime(string namePart, string value, out string isoUtc, out bool allDay)
    {
        allDay = namePart.Contains("VALUE=DATE", StringComparison.OrdinalIgnoreCase);
        isoUtc = "";

        if (allDay)
        {
            if (DateTime.TryParseExact(value.Trim(), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var day))
            {
                isoUtc = day.Date.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
            }
            return;
        }

        var formats = new[] { "yyyyMMdd'T'HHmmss'Z'", "yyyyMMdd'T'HHmmss", "yyyyMMdd" };
        if (DateTime.TryParseExact(value.Trim(), formats, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dt))
        {
            isoUtc = dt.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
        }
    }

    private static string UnescapeIcsText(string value) =>
        value
            .Replace("\\n", "\n", StringComparison.Ordinal)
            .Replace("\\N", "\n", StringComparison.Ordinal)
            .Replace("\\,", ",", StringComparison.Ordinal)
            .Replace("\\;", ";", StringComparison.Ordinal)
            .Replace("\\\\", "\\", StringComparison.Ordinal);

    /// <summary>Imports parsed events; returns count of rows inserted.</summary>
    public static int ImportIntoCalendar(CalendarService calendar, ConfigService config, IReadOnlyList<ParsedEvent> events, ulong actor)
    {
        var tz = config.Get("timezone") ?? "UTC";
        var imported = 0;
        foreach (var ev in events)
        {
            if (string.IsNullOrWhiteSpace(ev.Title) || string.IsNullOrWhiteSpace(ev.Start))
                continue;

            var end = string.IsNullOrWhiteSpace(ev.End) ? ev.Start : ev.End;
            calendar.AddItem(
                ev.Title.Trim(),
                "event",
                ev.Start,
                end,
                ev.AllDay,
                "",
                null,
                ev.Description ?? "",
                "",
                "",
                "",
                tz);
            imported++;
        }

        _ = actor;
        return imported;
    }
}
