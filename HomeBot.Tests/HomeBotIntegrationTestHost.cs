using System.Net.Http.Headers;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace HomeBot.Tests;

/// <summary>
/// Builds an isolated in-memory API + SQLite for integration tests.
/// </summary>
internal sealed class HomeBotIntegrationTestHost : IDisposable
{
    public string DbPath { get; }
    public ServiceProvider Services { get; }
    public WebApplication App { get; }
    public HttpClient Client { get; }
    public const string DefaultToken = "systems-integration-token";
    public const ulong DefaultActor = 300_001;

    public HomeBotIntegrationTestHost(string? token = null)
    {
        DbPath = Path.Combine(Path.GetTempPath(), $"homebot_systems_{Guid.NewGuid():N}.db");
        if (File.Exists(DbPath))
            File.Delete(DbPath);

        var sc = new ServiceCollection();
        sc.AddSingleton(_ => new DatabaseService(DbPath));
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
        sc.AddSingleton<CalendarService>();
        sc.AddSingleton<DiscordSocketHolder>();
        sc.AddSingleton<DiscordGuildDirectoryService>();
        sc.AddSingleton<IDiscordChannelNotifier, DiscordChannelNotifier>();
        sc.AddSingleton<DiscordAuthAuditNotifier>();
        Services = sc.BuildServiceProvider();
        Services.GetRequiredService<ConfigService>().Set("timezone", "UTC");

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        HomeBotApiHost.AddApiCors(builder);
        builder.AddPhase3Services(
            maxRequestBodyBytes: 65536,
            mutationPermitsPerMinute: 100_000,
            authLoginPerMinute: 100_000,
            oauthConsumePerMinute: 100_000,
            oauthBrowserPerMinute: 100_000,
            authAccountWritePerMinute: 100_000,
            discordStatusPollPerMinute: 100_000,
            authRefreshPerMinute: 100_000);
        builder.WebHost.UseTestServer();
        App = builder.Build();
        HomeBotApiHost.Configure(App, Services, token ?? DefaultToken);
        App.StartAsync().GetAwaiter().GetResult();
        Client = App.GetTestClient();
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token ?? DefaultToken);
    }

    public void Dispose()
    {
        try
        {
            App.StopAsync().GetAwaiter().GetResult();
        }
        catch
        {
            // ignored
        }

        try
        {
            App.DisposeAsync().AsTask().GetAwaiter().GetResult();
        }
        catch
        {
            // ignored
        }

        Client.Dispose();
        Services.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try
        {
            if (File.Exists(DbPath))
                File.Delete(DbPath);
        }
        catch
        {
            // ignore file lock races on Windows
        }
    }
}
