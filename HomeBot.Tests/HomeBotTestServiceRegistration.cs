using Microsoft.Extensions.DependencyInjection;

namespace HomeBot.Tests;

/// <summary>
/// Shared DI registration for API integration tests (matches <see cref="HomeBotDataServices"/>).
/// </summary>
internal static class HomeBotTestServiceRegistration
{
    public static IServiceCollection AddHomeBotApiTestServices(this IServiceCollection sc, string dbPath)
    {
        sc.AddSingleton(_ => new DatabaseService(dbPath));
        sc.AddSingleton<WebAuthService>();
        sc.AddSingleton<WebRefreshTokenService>();
        sc.AddSingleton<WebAuthDiscordVerificationService>();
        sc.AddSingleton<DiscordOAuthService>();
        sc.AddSingleton<ConfigService>();
        sc.AddSingleton<ChannelBindingService>();
        sc.AddSingleton<UndoService>();
        sc.AddSingleton<LoggingService>();
        sc.AddSingleton<BuyService>();
        sc.AddSingleton<WishlistService>();
        sc.AddSingleton<MoneyService>();
        sc.AddSingleton<BudgetService>();
        sc.AddSingleton<BudgetNotificationService>();
        sc.AddSingleton<CalendarService>();
        sc.AddSingleton<BackupStatsService>();
        sc.AddSingleton<SearchService>();
        sc.AddSingleton<BuyRecurringService>();
        sc.AddSingleton<HouseholdReportService>();
        sc.AddSingleton<HouseholdAuditService>();
        sc.AddSingleton<NotificationPreferencesService>();
        sc.AddSingleton<OpsMetricsService>();
        sc.AddSingleton<MealPlanningService>();
        sc.AddSingleton<GoogleCalendarOAuthService>();
        sc.AddSingleton<GoogleCalendarSyncService>();
        sc.AddSingleton<WebPushService>();
        sc.AddSingleton<DiscordSocketHolder>();
        sc.AddSingleton<DiscordGuildDirectoryService>();
        sc.AddSingleton<IDiscordChannelNotifier, DiscordChannelNotifier>();
        sc.AddSingleton<DiscordAuthAuditNotifier>();
        return sc;
    }
}
