using Xunit;

namespace HomeBot.Tests;

public sealed class BudgetNotificationDigestTests
{
    [Fact]
    public void IsDigestDueNow_matches_configured_day_and_hour()
    {
        Environment.SetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_DAY", "Wednesday");
        Environment.SetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_UTC_HOUR", "9");
        try
        {
            var wed9 = new DateTime(2026, 6, 3, 9, 30, 0, DateTimeKind.Utc);
            Assert.True(BudgetNotificationService.IsDigestDueNow(wed9));
            Assert.False(BudgetNotificationService.IsDigestDueNow(wed9.AddDays(1)));
            Assert.False(BudgetNotificationService.IsDigestDueNow(wed9.AddHours(2)));
        }
        finally
        {
            Environment.SetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_DAY", null);
            Environment.SetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_UTC_HOUR", null);
        }
    }

    [Fact]
    public void ReadDigestDayOfWeek_accepts_numeric_and_defaults()
    {
        Environment.SetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_DAY", "2");
        try
        {
            Assert.Equal(DayOfWeek.Tuesday, BudgetNotificationService.ReadDigestDayOfWeek());
        }
        finally
        {
            Environment.SetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_DAY", null);
        }

        Assert.Equal(DayOfWeek.Sunday, BudgetNotificationService.ReadDigestDayOfWeek());
    }

    [Fact]
    public void ReadDigestUtcHour_clamps_invalid_and_defaults()
    {
        Environment.SetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_UTC_HOUR", "99");
        try
        {
            Assert.Equal(17, BudgetNotificationService.ReadDigestUtcHour());
        }
        finally
        {
            Environment.SetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_UTC_HOUR", null);
        }

        Environment.SetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_UTC_HOUR", "8");
        try
        {
            Assert.Equal(8, BudgetNotificationService.ReadDigestUtcHour());
        }
        finally
        {
            Environment.SetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_UTC_HOUR", null);
        }
    }
}
