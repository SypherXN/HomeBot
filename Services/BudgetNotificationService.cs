/// <summary>
/// Sends debounced budget alerts and a weekly digest to the Discord budget channel.
/// </summary>
public class BudgetNotificationService
{
    private readonly BudgetService _budget;
    private readonly IDiscordChannelNotifier _notifier;

    public BudgetNotificationService(BudgetService budget, IDiscordChannelNotifier notifier)
    {
        _budget = budget;
        _notifier = notifier;
    }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                _budget.ProcessDueRecurring();
                await SendDueAlertsAsync();
                await MaybeSendWeeklyDigestAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[HomeBot Budget] Notification loop error: {ex.Message}");
            }

            try
            {
                await Task.Delay(TimeSpan.FromHours(6), cancellationToken);
            }
            catch (TaskCanceledException)
            {
                break;
            }
        }
    }

    private async Task SendDueAlertsAsync()
    {
        var items = _budget.CollectPendingNotifications();
        if (items.Count == 0)
            return;

        foreach (var item in items)
        {
            var key = $"budget_alert_{item.Kind}_{item.Message.GetHashCode(StringComparison.Ordinal)}";
            if (!_budget.ShouldSendNotification(key, TimeSpan.FromHours(24)))
                continue;

            await _notifier.NotifyFeatureChannelAsync("budget", $"⚠️ {item.Message}");
            _budget.MarkNotificationSent(key);
        }
    }

    private async Task MaybeSendWeeklyDigestAsync()
    {
        if (!IsDigestDueNow())
            return;

        const string key = "budget_weekly_digest";
        if (!_budget.ShouldSendNotification(key, TimeSpan.FromDays(6.5)))
            return;

        var text = _budget.BuildDigestText(monthly: false);
        await _notifier.NotifyFeatureChannelAsync("budget", text);
        _budget.MarkNotificationSent(key);
    }

    internal static bool IsDigestDueNow(DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        var targetDay = ReadDigestDayOfWeek();
        var targetHour = ReadDigestUtcHour();

        if (now.DayOfWeek != targetDay || now.Hour != targetHour)
            return false;

        return true;
    }

    internal static DayOfWeek ReadDigestDayOfWeek()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_DAY");
        if (string.IsNullOrWhiteSpace(raw))
            return DayOfWeek.Sunday;
        if (int.TryParse(raw, out var n) && n >= 0 && n <= 6)
            return (DayOfWeek)n;
        return Enum.TryParse<DayOfWeek>(raw, true, out var d) ? d : DayOfWeek.Sunday;
    }

    internal static int ReadDigestUtcHour()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_UTC_HOUR");
        if (int.TryParse(raw, out var h) && h >= 0 && h <= 23)
            return h;
        return 17;
    }
}
