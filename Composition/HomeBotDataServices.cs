using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Registers SQLite-backed domain services (no Discord types). Used by <see cref="Program"/> and integration tests.
/// </summary>
public static class HomeBotDataServices
{
    public static IServiceCollection AddHomeBotDataServices(this IServiceCollection services)
    {
        services.AddSingleton<DatabaseService>();
        services.AddSingleton<WebAuthService>();
        services.AddSingleton<WebRefreshTokenService>();
        services.AddSingleton<WebAuthDiscordVerificationService>();
        services.AddSingleton<DiscordOAuthService>();
        services.AddSingleton<ConfigService>();
        services.AddSingleton<ChannelBindingService>();
        services.AddSingleton<UndoService>();
        services.AddSingleton<LoggingService>();
        services.AddSingleton<BuyService>();
        services.AddSingleton<WishlistService>();
        services.AddSingleton<MoneyService>();
        services.AddSingleton<BudgetService>();
        services.AddSingleton<BudgetNotificationService>();
        services.AddSingleton<CalendarService>();
        services.AddSingleton<BackupStatsService>();
        services.AddSingleton<SearchService>();
        services.AddSingleton<BuyRecurringService>();
        services.AddSingleton<HouseholdReportService>();
        services.AddSingleton<HouseholdAuditService>();
        services.AddSingleton<NotificationPreferencesService>();
        services.AddSingleton<OpsMetricsService>();
        services.AddSingleton<MealPlanningService>();
        services.AddSingleton<GoogleCalendarOAuthService>();
        services.AddSingleton<GoogleCalendarSyncService>();
        services.AddSingleton<WebPushService>();
        services.AddSingleton<DiscordSocketHolder>();
        services.AddSingleton<DiscordGuildDirectoryService>();
        services.AddSingleton<IDiscordChannelNotifier, DiscordChannelNotifier>();
        services.AddSingleton<DiscordAuthAuditNotifier>();
        return services;
    }
}
