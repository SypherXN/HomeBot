using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
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
    private readonly string? _restoreJwtSecret;
    private const string StaticToken = "static-api-token";
    private const string JwtSecret = "0123456789abcdef0123456789abcdef"; // 32 chars

    public ApiWebAuthTests()
    {
        _restoreJwtSecret = Environment.GetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET");
        Environment.SetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET", JwtSecret);

        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_webauth_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        var sc = new ServiceCollection();
        sc.AddHomeBotApiTestServices(_dbPath);
        _services = sc.BuildServiceProvider();

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Development"
        });

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

        _app = builder.Build();
        HomeBotApiHost.Configure(_app, _services, StaticToken);

        _app.StartAsync().GetAwaiter().GetResult();
        _client = _app.GetTestClient();
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET", _restoreJwtSecret);

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
    public async Task Login_refresh_rotates_and_old_refresh_rejected()
    {
        using var naked = _app.GetTestClient();

        var boot = await naked.PostAsJsonAsync(
            "/api/auth/bootstrap",
            new { username = "refreshy", password = "password1x", discordUserId = "100002" });
        Assert.Equal(HttpStatusCode.OK, boot.StatusCode);

        var login = await naked.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "refreshy", password = "password1x" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var loginDoc = await login.Content.ReadFromJsonAsync<JsonElement>();
        var rt1 = loginDoc.GetProperty("refreshToken").GetString();
        Assert.False(string.IsNullOrEmpty(rt1));

        var refresh1 = await naked.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = rt1 });
        Assert.Equal(HttpStatusCode.OK, refresh1.StatusCode);
        var doc1 = await refresh1.Content.ReadFromJsonAsync<JsonElement>();
        var rt2 = doc1.GetProperty("refreshToken").GetString();
        var jwt2 = doc1.GetProperty("accessToken").GetString();
        Assert.False(string.IsNullOrEmpty(rt2));
        Assert.NotEqual(rt1, rt2);

        var replay = await naked.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = rt1 });
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);

        using var c = _app.GetTestClient();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt2!);
        var me = await c.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
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
    public async Task Register_with_pasted_discord_id_is_rejected()
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
            Assert.Equal(HttpStatusCode.BadRequest, reg.StatusCode);
            var denied = await reg.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("discord_unverified", denied.GetProperty("code").GetString());

            var login = await naked.PostAsJsonAsync(
                "/api/auth/login",
                new { username = "bob", password = "password1y" });
            Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
        }
        finally
        {
            Environment.SetEnvironmentVariable("HOMEBOT_WEB_INVITE_TOKEN", null);
        }
    }

    [Fact]
    public async Task Register_with_verified_session_and_invite_adds_second_user()
    {
        Environment.SetEnvironmentVariable("HOMEBOT_WEB_INVITE_TOKEN", "household-invite-secret");
        try
        {
            using var naked = _app.GetTestClient();
            var boot = await naked.PostAsJsonAsync(
                "/api/auth/bootstrap",
                new { username = "owner2", password = "password1x", discordUserId = "210002" });
            Assert.Equal(HttpStatusCode.OK, boot.StatusCode);

            var start = await naked.PostAsJsonAsync("/api/auth/discord/start", new { intent = "register" });
            Assert.Equal(HttpStatusCode.OK, start.StatusCode);
            var startDoc = await start.Content.ReadFromJsonAsync<JsonElement>();
            var verifySvc = _services.GetRequiredService<WebAuthDiscordVerificationService>();
            Assert.Contains("Linked", verifySvc.TryVerifyInDiscord(startDoc.GetProperty("code").GetString()!, 210_003u), StringComparison.Ordinal);

            var reg = await naked.PostAsJsonAsync(
                "/api/auth/register",
                new
                {
                    inviteToken = "household-invite-secret",
                    username = "cara",
                    password = "password1y",
                    sessionId = startDoc.GetProperty("sessionId").GetString()
                });
            Assert.Equal(HttpStatusCode.OK, reg.StatusCode);

            var login = await naked.PostAsJsonAsync("/api/auth/login", new { username = "cara", password = "password1y" });
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            var loginDoc = await login.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("210003", loginDoc.GetProperty("discordUserId").GetString());
        }
        finally
        {
            Environment.SetEnvironmentVariable("HOMEBOT_WEB_INVITE_TOKEN", null);
        }
    }

    [Fact]
    public async Task Duplicate_normalized_discord_id_is_rejected()
    {
        var auth = _services.GetRequiredService<WebAuthService>();
        Assert.Null(auth.TryInsertWebUser("one", "password1x", "300001"));
        var dup = auth.TryInsertWebUser("two", "password1x", "000300001");
        Assert.NotNull(dup);
        var ctx = new DefaultHttpContext { RequestServices = _app.Services };
        ctx.Response.Body = new MemoryStream();
        await dup!.ExecuteAsync(ctx);
        Assert.Equal(409, ctx.Response.StatusCode);
        ctx.Response.Body.Position = 0;
        using var json = await JsonDocument.ParseAsync(ctx.Response.Body);
        Assert.Equal("discord_identity_taken", json.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public void Unverified_and_inactive_accounts_are_not_admin()
    {
        var previous = Environment.GetEnvironmentVariable("HOMEBOT_WEB_ADMIN_DISCORD_IDS");
        Environment.SetEnvironmentVariable("HOMEBOT_WEB_ADMIN_DISCORD_IDS", "424242");
        try
        {
            var auth = _services.GetRequiredService<WebAuthService>();
            Assert.Null(auth.TryCreateFirstUser("sneaky", "password1x", "424242", null));
            Assert.False(auth.IsAdmin("sneaky", "424242"));
            Assert.NotNull(auth.TryIssueJwtForWebUserByDiscordId("424242"));
            Assert.False(auth.IsAdmin("sneaky", "424242"));
            Assert.NotNull(auth.TryIssueJwtForWebUserByDiscordId("424242", markDiscordVerified: true));
            Assert.True(auth.IsAdmin("sneaky", "424242"));
            Assert.Null(auth.TryDeactivateUser("sneaky"));
            Assert.False(auth.IsAdmin("sneaky", "424242"));
        }
        finally
        {
            Environment.SetEnvironmentVariable("HOMEBOT_WEB_ADMIN_DISCORD_IDS", previous);
        }
    }

    [Fact]
    public void Duplicate_discord_ids_block_preflight_without_deleting_rows()
    {
        var path = Path.Combine(Path.GetTempPath(), $"homebot_dupe_{Guid.NewGuid():N}.db");
        try
        {
            using (var conn = new SqliteConnection($"Data Source={path}"))
            {
                conn.Open();
                using var create = conn.CreateCommand();
                create.CommandText = @"
                    CREATE TABLE WebUsers (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT,
                        Username TEXT NOT NULL,
                        PasswordHash TEXT NOT NULL,
                        DiscordUserId TEXT NOT NULL);
                    INSERT INTO WebUsers (Username, PasswordHash, DiscordUserId) VALUES ('a', 'x', '100');
                    INSERT INTO WebUsers (Username, PasswordHash, DiscordUserId) VALUES ('b', 'x', '000100');";
                create.ExecuteNonQuery();

                var ex = Assert.Throws<InvalidOperationException>(() =>
                    DatabaseSchemaMigrations.RejectDuplicateWebDiscordIdentities(conn));
                Assert.Contains("015_web_verified_identity", ex.Message, StringComparison.Ordinal);
                Assert.Contains("No accounts were changed or deleted", ex.Message, StringComparison.Ordinal);

                using var count = conn.CreateCommand();
                count.CommandText = "SELECT COUNT(*) FROM WebUsers";
                Assert.Equal(2, Convert.ToInt32(count.ExecuteScalar()));
            }
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            if (File.Exists(path))
                File.Delete(path);
        }
    }
}
