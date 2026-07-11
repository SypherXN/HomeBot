/// <summary>
/// Advances calendar series start times after a reminder fires (or when healing stuck rows).
/// Shared so ReminderService and tests stay aligned with monthly/yearly calendar expansion.
/// </summary>
public static class CalendarRecurrenceAdvance
{
    /// <summary>
    /// How long after a reminder becomes due we still treat it as a fresh notification window.
    /// Older due reminders are healed (advanced) without re-sending — stops yearly/monthly spam.
    /// </summary>
    public static readonly TimeSpan StaleReminderGrace = TimeSpan.FromMinutes(2);

    /// <summary>
    /// Returns the next series start after <paramref name="currentStart"/> for the given recurrence token.
    /// Unknown/empty recurrence returns <paramref name="currentStart"/> unchanged.
    /// </summary>
    public static DateTime NextStart(DateTime currentStart, string recurrence)
    {
        var r = ValidationHelper.NormalizeRecurrence(recurrence);
        return r switch
        {
            "daily" => currentStart.AddDays(1),
            "weekly" => currentStart.AddDays(7),
            "monthly" => AddMonthsClamped(currentStart, 1),
            "yearly" => AddYearsClamped(currentStart, 1),
            _ => currentStart,
        };
    }

    /// <summary>
    /// Advances past occurrences whose reminder became due more than <paramref name="staleAfter"/> ago.
    /// Heals yearly/monthly rows that never advanced after firing (constant re-fire every poll).
    /// Leaves a freshly due occurrence alone so it can still notify once.
    /// </summary>
    public static DateTime AdvancePastStaleReminders(
        DateTime currentStart,
        string recurrence,
        TimeSpan reminderOffset,
        DateTime now,
        TimeSpan? staleAfter = null)
    {
        var r = ValidationHelper.NormalizeRecurrence(recurrence);
        if (string.IsNullOrEmpty(r))
            return currentStart;

        var grace = staleAfter ?? StaleReminderGrace;
        var start = currentStart;
        for (var i = 0; i < 512; i++)
        {
            var reminderTime = start - reminderOffset;
            // Still upcoming, or due within the fresh window — keep this occurrence.
            if (now <= reminderTime + grace)
                return start;

            var next = NextStart(start, r);
            if (next <= start)
                return start;
            start = next;
        }

        return start;
    }

    private static DateTime AddMonthsClamped(DateTime from, int months)
    {
        var next = from.AddMonths(months);
        var day = Math.Min(from.Day, DateTime.DaysInMonth(next.Year, next.Month));
        return new DateTime(next.Year, next.Month, day, from.Hour, from.Minute, from.Second, from.Kind);
    }

    private static DateTime AddYearsClamped(DateTime from, int years)
    {
        var nextYear = from.Year + years;
        var day = Math.Min(from.Day, DateTime.DaysInMonth(nextYear, from.Month));
        return new DateTime(nextYear, from.Month, day, from.Hour, from.Minute, from.Second, from.Kind);
    }
}
