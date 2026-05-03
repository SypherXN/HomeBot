using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

public sealed class ApiWebAuthTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly WebApplication _app;
    private readonly HttpClient _client;
    private const string StaticToken = "static-api-token";
    private const string JwtSecret = "0123456789abcdef0123456789abcdef"; // 32 chars

    public ApiWebAuthTests()
    {
        Environment.SetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET", JwtSecret);

        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_webauth_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        var sc = new ServiceCollection();
        sc.AddSingleton(_ => new DatabaseService(_dbPath));
        sc.AddSingleton<WebAuthService>();
        sc.AddSingleton<WebAuthDiscordVerificationService>();
        sc.AddSingleton<ConfigService>();
        sc.AddSingleton<ChannelBindingService>();
        sc.AddSingleton<UndoService>();
        sc.AddSingleton<LoggingService>();
        sc.AddSingleton<BuyService>();
        sc.AddSingleton<WishlistService>();
        sc.AddSingleton<MoneyService>();
        sc.AddSingleton<CalendarService>();
        sc.AddSingleton<DiscordSocketHolder>();
        sc.AddSingleton<DiscordGuildDirectoryService>();
        sc.AddSingleton<IDiscordChannelNotifier, DiscordChannelNotifier>();
        _services = sc.BuildServiceProvider();

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Development"
        });

        HomeBotApiHost.AddApiCors(builder);
        builder.AddPhase3Services(maxRequestBodyBytes: 65536, mutationPermitsPerMinute: 100_000);
        builder.WebHost.UseTestServer();

        _app = builder.Build();
        HomeBotApiHost.Configure(_app, _services, StaticToken);

        _app.StartAsync().GetAwaiter().GetResult();
        _client = _app.GetTestClient();
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET", null);

        try
        {
            _app.StopAsync().GetAwaiter().GetResult();
        }
        catch
        {
            // ignore
        }

        try
        {
            _app.DisposeAsync().AsTask().GetAwaiter().GetResult();
        }
        catch
        {
            // ignore
        }

        _services.Dispose();

        try
        {
            if (File.Exists(_dbPath))
                File.Delete(_dbPath);
        }
        catch
        {
            // ignore
        }
    }

    [Fact]
    public async Task Bootstrap_login_jwt_then_buy_tag_catalog_works()
    {
        using var naked = _app.GetTestClient();

        var boot = await naked.PostAsJsonAsync(
            "/api/auth/bootstrap",
            new { username = "alice", password = "password1x", discordUserId = "100001" });

        Assert.Equal(HttpStatusCode.OK, boot.StatusCode);

        var login = await naked.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "alice", password = "password1x" });

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var doc = await login.Content.ReadFromJsonAsync<JsonElement>();
        var jwt = doc.GetProperty("accessToken").GetString();
        Assert.False(string.IsNullOrEmpty(jwt));

        using var jwtClient = _app.GetTestClient();
        jwtClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt!);

        var me = await jwtClient.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var meDoc = await me.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("webUser", meDoc.GetProperty("kind").GetString());
        Assert.Equal("alice", meDoc.GetProperty("username").GetString());
        Assert.Equal("100001", meDoc.GetProperty("discordUserId").GetString());

        var tags = await jwtClient.GetAsync("/api/buy/tags");
        Assert.Equal(HttpStatusCode.OK, tags.StatusCode);
    }

    [Fact]
    public async Task Static_token_still_works_for_buy_tags()
    {
        using var c = _app.GetTestClient();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", StaticToken);
        var tags = await c.GetAsync("/api/buy/tags");
        Assert.Equal(HttpStatusCode.OK, tags.StatusCode);
    }

    [Fact]
    public async Task Discord_verify_flow_bootstrap_then_login()
    {
        using var naked = _app.GetTestClient();

        var start = await naked.PostAsJsonAsync("/api/auth/discord/start", new { intent = "bootstrap" });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var startDoc = await start.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = startDoc.GetProperty("sessionId").GetString();
        var code = startDoc.GetProperty("code").GetString();
        Assert.False(string.IsNullOrEmpty(sessionId));
        Assert.False(string.IsNullOrEmpty(code));

        var verifySvc = _services.GetRequiredService<WebAuthDiscordVerificationService>();
        var msg = verifySvc.TryVerifyInDiscord(code!, 555_001u);
        Assert.Contains("Linked", msg, StringComparison.Ordinal);

        var complete = await naked.PostAsJsonAsync(
            "/api/auth/discord/complete-bootstrap",
            new { sessionId, username = "pat", password = "password1x" });
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);

        var login = await naked.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "pat", password = "password1x" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var loginDoc = await login.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("555001", loginDoc.GetProperty("discordUserId").GetString());
    }

    [Fact]
    public async Task Register_with_invite_adds_second_user()
    {
        Environment.SetEnvironmentVariable("HOMEBOT_WEB_INVITE_TOKEN", "household-invite-secret");

        try
        {
            using var naked = _app.GetTestClient();
            var boot = await naked.PostAsJsonAsync(
                "/api/auth/bootstrap",
                new { username = "owner", password = "password1x", discordUserId = "200002" });
            Assert.Equal(HttpStatusCode.OK, boot.StatusCode);

            var reg = await naked.PostAsJsonAsync(
                "/api/auth/register",
                new
                {
                    inviteToken = "household-invite-secret",
                    username = "bob",
                    password = "password1y",
                    discordUserId = "200003"
                });
            Assert.Equal(HttpStatusCode.OK, reg.StatusCode);

            var login = await naked.PostAsJsonAsync(
                "/api/auth/login",
                new { username = "bob", password = "password1y" });
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        }
        finally
        {
            Environment.SetEnvironmentVariable("HOMEBOT_WEB_INVITE_TOKEN", null);
        }
    }
}
