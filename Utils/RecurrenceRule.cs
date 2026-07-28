using System.Globalization;

/// <summary>
/// Parses and formats the calendar recurrence string stored in <c>CalendarItems.Recurrence</c>.
/// Supports simple frequencies (daily/weekly/monthly/yearly) plus RRULE-style extensions:
/// <c>biweekly</c>, <c>weekly:MO,WE,FR</c>, and an optional <c>;UNTIL=YYYYMMDD</c> or <c>;COUNT=N</c> suffix.
/// The database stores one string; this keeps the surface backward compatible.
/// </summary>
public static class RecurrenceRule
{
    public sealed class Rule
    {
        public string Frequency { get; init; } = "";
        public int Interval { get; init; } = 1;
        public DayOfWeek[] Weekdays { get; init; } = Array.Empty<DayOfWeek>();
        public DateTime? Until { get; init; }
        public int? Count { get; init; }
    }

    private static readonly Dictionary<string, DayOfWeek> CodeToDay = new(StringComparer.OrdinalIgnoreCase)
    {
        ["MO"] = DayOfWeek.Monday,
        ["TU"] = DayOfWeek.Tuesday,
        ["WE"] = DayOfWeek.Wednesday,
        ["TH"] = DayOfWeek.Thursday,
        ["FR"] = DayOfWeek.Friday,
        ["SA"] = DayOfWeek.Saturday,
        ["SU"] = DayOfWeek.Sunday,
    };

    public static bool TryParse(string raw, out Rule rule)
    {
        rule = new Rule();
        if (string.IsNullOrWhiteSpace(raw))
            return false;

        // Strip an optional UNTIL/COUNT suffix first so the core frequency parses cleanly.
        var core = raw.Trim();
        DateTime? until = null;
        int? count = null;
        var semi = core.IndexOf(';');
        if (semi >= 0)
        {
            var suffix = core[(semi + 1)..];
            core = core[..semi];
            foreach (var part in suffix.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var eq = part.IndexOf('=');
                if (eq <= 0) continue;
                var key = part[..eq].Trim().ToUpperInvariant();
                var val = part[(eq + 1)..].Trim();
                if (key == "UNTIL" &&
                    DateTime.TryParseExact(val, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var u))
                {
                    until = u.Date;
                }
                else if (key == "COUNT" && int.TryParse(val, NumberStyles.Integer, CultureInfo.InvariantCulture, out var c) && c > 0)
                {
                    count = c;
                }
            }
        }

        var colon = core.IndexOf(':');
        string freqToken;
        string? byDay = null;
        if (colon >= 0)
        {
            freqToken = core[..colon];
            byDay = core[(colon + 1)..];
        }
        else
        {
            freqToken = core;
        }

        var normalized = ValidationHelper.NormalizeRecurrence(freqToken);
        string freq;
        var interval = 1;
        switch (normalized)
        {
            case "daily":
            case "weekly":
            case "monthly":
            case "yearly":
                freq = normalized;
                break;
            case "biweekly":
                freq = "weekly";
                interval = 2;
                break;
            default:
                return false;
        }

        var weekdays = Array.Empty<DayOfWeek>();
        if (freq == "weekly" && !string.IsNullOrWhiteSpace(byDay))
        {
            var list = new List<DayOfWeek>();
            foreach (var tok in byDay.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (CodeToDay.TryGetValue(tok, out var d) && !list.Contains(d))
                    list.Add(d);
            }
            weekdays = list.ToArray();
        }

        rule = new Rule { Frequency = freq, Interval = interval, Weekdays = weekdays, Until = until, Count = count };
        return true;
    }

    /// <summary>True when the raw string carries an until-date or occurrence-count bound.</summary>
    public static bool HasBound(string raw) =>
        TryParse(raw, out var r) && (r.Until.HasValue || r.Count.HasValue);

    public static string FormatBiweekly(DateTime? until, int? count) => AppendBound("biweekly", until, count);

    public static string FormatWeeklyDays(IEnumerable<DayOfWeek> days, DateTime? until, int? count)
    {
        var codes = days
            .OrderBy(d => ((int)d + 6) % 7) // Monday-first for stable strings
            .Select(DayToCode);
        return AppendBound($"weekly:{string.Join(",", codes)}", until, count);
    }

    public static string AppendBound(string core, DateTime? until, int? count)
    {
        var sb = new System.Text.StringBuilder(core);
        if (until.HasValue)
            sb.Append(CultureInfo.InvariantCulture, $";UNTIL={until.Value:yyyyMMdd}");
        if (count.HasValue)
            sb.Append(CultureInfo.InvariantCulture, $";COUNT={count.Value}");
        return sb.ToString();
    }

    public static string DayToCode(DayOfWeek d) => d switch
    {
        DayOfWeek.Monday => "MO",
        DayOfWeek.Tuesday => "TU",
        DayOfWeek.Wednesday => "WE",
        DayOfWeek.Thursday => "TH",
        DayOfWeek.Friday => "FR",
        DayOfWeek.Saturday => "SA",
        DayOfWeek.Sunday => "SU",
        _ => "MO",
    };

    /// <summary>Human label used in list/detail views (keeps the 🔁 prefix style).</summary>
    public static string Describe(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return "";
        if (!TryParse(raw, out var r))
            return $"🔁 {raw}";
        return r switch
        {
            { Frequency: "daily" } => BoundSuffix("🔁 daily", r),
            { Frequency: "monthly" } => BoundSuffix("🔁 monthly", r),
            { Frequency: "yearly" } => BoundSuffix("🔁 annual", r),
            { Frequency: "weekly", Interval: 2 } => BoundSuffix("🔁 every 2 weeks", r),
            { Frequency: "weekly", Weekdays.Length: > 0 } w =>
                BoundSuffix($"🔁 weekly ({string.Join("/", w.Weekdays.Select(ShortDay))})", w),
            { Frequency: "weekly" } => BoundSuffix("🔁 weekly", r),
            _ => $"🔁 {raw}",
        };

        static string BoundSuffix(string baseText, Rule r)
        {
            if (r.Until.HasValue)
                return $"{baseText} until {r.Until.Value:MMM d, yyyy}";
            if (r.Count.HasValue)
                return $"{baseText} × {r.Count.Value}";
            return baseText;
        }
    }

    private static string ShortDay(DayOfWeek d) => d switch
    {
        DayOfWeek.Monday => "Mon",
        DayOfWeek.Tuesday => "Tue",
        DayOfWeek.Wednesday => "Wed",
        DayOfWeek.Thursday => "Thu",
        DayOfWeek.Friday => "Fri",
        DayOfWeek.Saturday => "Sat",
        DayOfWeek.Sunday => "Sun",
        _ => d.ToString(),
    };
}
