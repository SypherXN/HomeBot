using Microsoft.Extensions.DependencyInjection;

/// <summary>Creates monthly calendar reminders for budget bills.</summary>
internal static class BudgetBillCalendarHelper
{
    public static int CreateMonthlyReminder(IServiceProvider root, string billName, double amountEstimate, int dueDay)
    {
        var config = root.GetRequiredService<ConfigService>();
        var tz = TimeZoneResolver.Resolve(config.Get("timezone") ?? "UTC");
        var day = Math.Clamp(dueDay, 1, 28);
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var year = localNow.Year;
        var month = localNow.Month;
        if (localNow.Day > day)
        {
            var next = localNow.AddMonths(1);
            year = next.Year;
            month = next.Month;
        }

        var wall = new DateTime(year, month, day, 9, 0, 0, DateTimeKind.Unspecified);
        var startUtc = TimeZoneInfo.ConvertTimeToUtc(wall, tz);
        var reminderSpan = ReminderParser.Parse("1d");
        var reminderValue = reminderSpan.HasValue
            ? reminderSpan.Value.TotalSeconds.ToString()
            : "";

        var title = $"Bill due: {billName}";
        var cal = root.GetRequiredService<CalendarService>();
        return cal.AddItem(
            title,
            "event",
            startUtc.ToString("yyyy-MM-dd HH:mm"),
            "",
            false,
            reminderValue,
            null,
            $"Estimated ${amountEstimate:N2}",
            "",
            "",
            "monthly",
            tz.Id);
    }
}
