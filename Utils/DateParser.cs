using System.Globalization;
using System.Text.RegularExpressions;

/// <summary>
/// Parses natural-language and explicit date/time strings.
/// </summary>
public static class DateParser
{
    /// <summary>
    /// Parses a supported date expression into local DateTime.
    /// </summary>
    public static DateTime? Parse(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return null;

        input = input.Trim().ToLower();
        var now = DateTime.Now;

        // --- today ---
        if (input == "today")
            return now.Date;

        // --- tomorrow ---
        if (input.StartsWith("tomorrow"))
        {
            var time = ExtractTime(input);
            return now.Date.AddDays(1).Add(time);
        }

        // --- in X hours ---
        var hoursMatch = Regex.Match(input, @"in (\d+) hours?");
        if (hoursMatch.Success)
        {
            int hours = int.Parse(hoursMatch.Groups[1].Value);
            return now.AddHours(hours);
        }

        // --- in X minutes ---
        var minMatch = Regex.Match(input, @"in (\d+) minutes?");
        if (minMatch.Success)
        {
            int mins = int.Parse(minMatch.Groups[1].Value);
            return now.AddMinutes(mins);
        }

        // --- next weekday ---
        var weekdays = new Dictionary<string, DayOfWeek>
        {
            { "monday", DayOfWeek.Monday },
            { "tuesday", DayOfWeek.Tuesday },
            { "wednesday", DayOfWeek.Wednesday },
            { "thursday", DayOfWeek.Thursday },
            { "friday", DayOfWeek.Friday },
            { "saturday", DayOfWeek.Saturday },
            { "sunday", DayOfWeek.Sunday }
        };

        foreach (var day in weekdays)
        {
            if (input.Contains(day.Key))
            {
                int daysToAdd = ((int)day.Value - (int)now.DayOfWeek + 7) % 7;
                if (daysToAdd == 0) daysToAdd = 7;

                var date = now.Date.AddDays(daysToAdd);
                var time = ExtractTime(input);

                return date.Add(time);
            }
        }

        // --- explicit MM/DD/YYYY hh:mm tt ---
        var formats = new[]
        {
            "M/d/yyyy h:mm tt",
            "MM/dd/yyyy h:mm tt",
            "M/d/yyyy h tt",
            "MM/dd/yyyy h tt",
            "M/d/yyyy H:mm",
            "MM/dd/yyyy H:mm"
        };

        if (DateTime.TryParseExact(
                input,
                formats,
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var exactResult))
        {
            return exactResult;
        }

        // --- fallback ---
        if (DateTime.TryParse(input, CultureInfo.CurrentCulture, DateTimeStyles.None, out var result))
            return result;

        return null;
    }

    /// <summary>
    /// Extracts a time component from free-form date text.
    /// </summary>
    private static TimeSpan ExtractTime(string input)
    {
        var match = Regex.Match(input, @"(\d{1,2})(:(\d{2}))?\s*(am|pm)?");

        if (!match.Success)
            return TimeSpan.Zero;

        int hour = int.Parse(match.Groups[1].Value);
        int minute = match.Groups[3].Success ? int.Parse(match.Groups[3].Value) : 0;

        if (match.Groups[4].Success)
        {
            var ampm = match.Groups[4].Value;
            if (ampm == "pm" && hour < 12) hour += 12;
            if (ampm == "am" && hour == 12) hour = 0;
        }

        return new TimeSpan(hour, minute, 0);
    }
}