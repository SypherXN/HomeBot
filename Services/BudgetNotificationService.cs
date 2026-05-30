/// <summary>
/// Sends debounced budget alerts and a weekly digest to Discord (DM + optional channel).
/// </summary>
public class BudgetNotificationService
{
    private readonly BudgetService _budget;
    private readonly NotificationPreferencesService _prefs;
    private readonly IDiscordChannelNotifier _notifier;
    private readonly WebPushService _push;

    public BudgetNotificationService(
        BudgetService budget,
        NotificationPreferencesService prefs,
        IDiscordChannelNotifier notifier,
        WebPushService push)
    {
        _budget = budget;
        _prefs = prefs;
        _notifier = notifier;
        _push = push;
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

        var recipients = HouseholdUsersWanting("budget_alerts");
        if (recipients.Count == 0)
            return;

        foreach (var item in items)
        {
            var key = $"budget_alert_{item.Kind}_{item.Message.GetHashCode(StringComparison.Ordinal)}";
            if (!_budget.ShouldSendNotification(key, TimeSpan.FromHours(24)))
                continue;

            var text = $"⚠️ {item.Message}";
            foreach (var uid in recipients)
            {
                await _notifier.NotifyUserDmAsync(uid, text);
                await _push.TryNotifyUserAsync(uid, "Budget alert", item.Message, "/budget?tab=ledger");
            }

            if (ReadAlertsToChannel())
                await _notifier.NotifyFeatureChannelAsync("budget", text);

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

        var recipients = HouseholdUsersWanting("weekly_digest");
        if (recipients.Count == 0)
            return;

        var text = _budget.BuildDigestText(monthly: false);
        foreach (var uid in recipients)
        {
            await _notifier.NotifyUserDmAsync(uid, text);
            await _push.TryNotifyUserAsync(uid, "Weekly budget digest", "Open HomeBot for your household budget summary.", "/budget");
        }

        if (ReadDigestToChannel())
            await _notifier.NotifyFeatureChannelAsync("budget", text);

        _budget.MarkNotificationSent(key);
    }

    private List<ulong> HouseholdUsersWanting(string kind) =>
        _prefs.ListHouseholdDiscordUserIds()
            .Where(uid => _prefs.ShouldReceive(uid, kind))
            .ToList();

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

    internal static bool ReadDigestToChannel()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_BUDGET_DIGEST_TO_CHANNEL");
        if (string.IsNullOrWhiteSpace(raw))
            return true;
        return !string.Equals(raw.Trim(), "false", StringComparison.OrdinalIgnoreCase);
    }

    internal static bool ReadAlertsToChannel()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_BUDGET_ALERTS_TO_CHANNEL");
        if (string.IsNullOrWhiteSpace(raw))
            return true;
        return !string.Equals(raw.Trim(), "false", StringComparison.OrdinalIgnoreCase);
    }
}
