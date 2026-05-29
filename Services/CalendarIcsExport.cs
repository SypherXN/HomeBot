using System.Globalization;
using System.Text;

/// <summary>Builds iCalendar (.ics) documents from calendar range rows.</summary>
public static class CalendarIcsExport
{
    public static string Build(IReadOnlyList<CalendarRangeItemModel> items, string calendarName = "HomeBot Calendar")
    {
        var sb = new StringBuilder();
        sb.AppendLine("BEGIN:VCALENDAR");
        sb.AppendLine("VERSION:2.0");
        sb.AppendLine("PRODID:-//HomeBot//Calendar//EN");
        sb.AppendLine("CALSCALE:GREGORIAN");
        sb.AppendLine("METHOD:PUBLISH");
        sb.AppendLine($"X-WR-CALNAME:{EscapeIcsText(calendarName)}");

        foreach (var item in items)
        {
            if (string.Equals(item.Type, "task", StringComparison.OrdinalIgnoreCase))
                continue;
            if (string.IsNullOrWhiteSpace(item.InstanceStartUtc))
                continue;

            sb.AppendLine("BEGIN:VEVENT");
            var uid = $"homebot-{item.Id}-{item.InstanceStartUtc}@homebot";
            sb.AppendLine($"UID:{uid}");
            sb.AppendLine($"SUMMARY:{EscapeIcsText(item.Title)}");

            if (!string.IsNullOrWhiteSpace(item.Description))
                sb.AppendLine($"DESCRIPTION:{EscapeIcsText(item.Description)}");
            if (!string.IsNullOrWhiteSpace(item.Notes))
                sb.AppendLine($"X-HOMEBOT-NOTES:{EscapeIcsText(item.Notes)}");

            if (item.AllDay)
            {
                if (TryParseUtc(item.InstanceStartUtc, out var startDay))
                {
                    sb.AppendLine($"DTSTART;VALUE=DATE:{startDay:yyyyMMdd}");
                    var endDay = item.InstanceEndUtc != null && TryParseUtc(item.InstanceEndUtc, out var ed)
                        ? ed.Date
                        : startDay.Date.AddDays(1);
                    sb.AppendLine($"DTEND;VALUE=DATE:{endDay:yyyyMMdd}");
                }
            }
            else
            {
                if (TryParseUtc(item.InstanceStartUtc, out var dtStart))
                    sb.AppendLine($"DTSTART:{dtStart:yyyyMMdd'T'HHmmss'Z'}");
                if (item.InstanceEndUtc != null && TryParseUtc(item.InstanceEndUtc, out var dtEnd))
                    sb.AppendLine($"DTEND:{dtEnd:yyyyMMdd'T'HHmmss'Z'}");
                else if (TryParseUtc(item.InstanceStartUtc, out var dtStartOnly))
                    sb.AppendLine($"DTEND:{dtStartOnly.AddHours(1):yyyyMMdd'T'HHmmss'Z'}");
            }

            sb.AppendLine($"DTSTAMP:{DateTime.UtcNow:yyyyMMdd'T'HHmmss'Z'}");
            sb.AppendLine("END:VEVENT");
        }

        sb.AppendLine("END:VCALENDAR");
        return sb.ToString();
    }

    private static bool TryParseUtc(string iso, out DateTime utc)
    {
        if (DateTime.TryParse(iso, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out utc))
            return true;
        utc = default;
        return false;
    }

    private static string EscapeIcsText(string value)
    {
        return value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace(";", "\\;", StringComparison.Ordinal)
            .Replace(",", "\\,", StringComparison.Ordinal)
            .Replace("\r\n", "\\n", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal);
    }
}
