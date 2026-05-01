using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Registers SQLite-backed domain services (no Discord types). Used by <see cref="Program"/> and integration tests.
/// </summary>
public static class HomeBotDataServices
{
    public static IServiceCollection AddHomeBotDataServices(this IServiceCollection services)
    {
        services.AddSingleton<DatabaseService>();
        services.AddSingleton<ConfigService>();
        services.AddSingleton<ChannelBindingService>();
        services.AddSingleton<UndoService>();
        services.AddSingleton<LoggingService>();
        services.AddSingleton<BuyService>();
        services.AddSingleton<WishlistService>();
        services.AddSingleton<MoneyService>();
        services.AddSingleton<CalendarService>();
        services.AddSingleton<DiscordSocketHolder>();
        services.AddSingleton<IDiscordChannelNotifier, DiscordChannelNotifier>();
        return services;
    }
}
