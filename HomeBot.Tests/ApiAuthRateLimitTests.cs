using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

/// <summary>
/// Verifies per-IP rate limits on public auth endpoints (tight limits via <see cref="HomeBotApiPhase3.AddPhase3Services"/> overrides).
/// </summary>
public sealed class ApiAuthRateLimitTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly WebApplication _app;
    private readonly HttpClient _client;
    private readonly string? _restoreJwtSecret;
    private const string StaticToken = "static-api-token";
    private const string JwtSecret = "0123456789abcdef0123456789abcdef";

    public ApiAuthRateLimitTests()
    {
        _restoreJwtSecret = Environment.GetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET");
        Environment.SetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET", JwtSecret);

        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_authrl_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        var sc = new ServiceCollection();
        sc.AddHomeBotApiTestServices(_dbPath);
        _services = sc.BuildServiceProvider();

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Development",
        });

        HomeBotApiHost.AddApiCors(builder);
        builder.AddPhase3Services(
            maxRequestBodyBytes: 65536,
            mutationPermitsPerMinute: 100_000,
            authLoginPerMinute: 3,
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
    public async Task Login_rate_limit_returns_429_after_permit_window_exhausted()
    {
        for (var i = 0; i < 3; i++)
        {
            var r = await _client.PostAsJsonAsync("/api/auth/login", new { username = "nobody", password = "bad" });
            Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
        }

        var limited = await _client.PostAsJsonAsync("/api/auth/login", new { username = "nobody", password = "bad" });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        using var doc = JsonDocument.Parse(await limited.Content.ReadAsStringAsync());
        Assert.Equal("rate_limited", doc.RootElement.GetProperty("code").GetString());
    }
}
