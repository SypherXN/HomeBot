using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

/// <summary>
/// Builds a throwaway API host for Phase 3 security tests (parallel-safe: no shared env vars).
/// </summary>
internal sealed class ApiTestHarness : IAsyncDisposable
{
    private const string DefaultToken = "phase3-test-token";
    private const ulong Actor = 100_001;

    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly WebApplication _app;

    private ApiTestHarness(string dbPath, ServiceProvider services, WebApplication app)
    {
        _dbPath = dbPath;
        _services = services;
        _app = app;
    }

    public static ApiTestHarness Create(long maxBodyBytes, int mutationPermitsPerMinute, string apiToken = DefaultToken)
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"homebot_phase3_{Guid.NewGuid():N}.db");
        if (File.Exists(dbPath))
            File.Delete(dbPath);

        var sc = new ServiceCollection();
        sc.AddSingleton(_ => new DatabaseService(dbPath));
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
        var services = sc.BuildServiceProvider();

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Development"
        });

        HomeBotApiHost.AddApiCors(builder);
        builder.AddPhase3Services(maxBodyBytes, mutationPermitsPerMinute);
        builder.WebHost.UseTestServer();

        var app = builder.Build();
        HomeBotApiHost.Configure(app, services, apiToken);
        app.StartAsync().GetAwaiter().GetResult();

        return new ApiTestHarness(dbPath, services, app);
    }

    public HttpClient NakedClient => _app.GetTestClient();

    public HttpClient AuthenticatedClient()
    {
        var c = _app.GetTestClient();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", DefaultToken);
        return c;
    }

    public static ulong TestActor => Actor;

    public async ValueTask DisposeAsync()
    {
        try
        {
            await _app.StopAsync();
        }
        catch
        {
            // ignore
        }

        try
        {
            await _app.DisposeAsync();
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
}

public sealed class ApiPhase3Tests
{
    [Fact]
    public async Task OpenApi_document_available_without_auth()
    {
        await using var host = ApiTestHarness.Create(65536, 100_000);
        var r = await host.NakedClient.GetAsync("/openapi/v1.json");
        r.EnsureSuccessStatusCode();
        var text = await r.Content.ReadAsStringAsync();
        Assert.Contains("openapi", text, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Unauthorized_json_includes_machine_code()
    {
        await using var host = ApiTestHarness.Create(65536, 100_000);
        var r = await host.NakedClient.GetAsync("/api/buy/items");
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
        var doc = await JsonDocument.ParseAsync(await r.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("code", out var code));
        Assert.Equal("unauthorized", code.GetString());
        Assert.True(doc.RootElement.TryGetProperty("error", out _));
    }

    [Fact]
    public async Task Oversized_json_body_returns_413()
    {
        await using var host = ApiTestHarness.Create(maxBodyBytes: 512, mutationPermitsPerMinute: 100_000);
        var client = host.AuthenticatedClient();
        var big = new string('x', 800);
        using var content = new StringContent(
            $$"""{"title":"z","start":"","allDay":false,"assignToEveryone":false,"description":"{{big}}"}""",
            Encoding.UTF8,
            "application/json");

        var r = await client.PostAsync("/api/calendar/items", content);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, r.StatusCode);
        var doc = await JsonDocument.ParseAsync(await r.Content.ReadAsStreamAsync());
        Assert.Equal("payload_too_large", doc.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Mutation_rate_limit_returns_429()
    {
        await using var host = ApiTestHarness.Create(65536, mutationPermitsPerMinute: 2);
        var client = host.AuthenticatedClient();
        var actor = ApiTestHarness.TestActor;

        var p1 = await client.PostAsJsonAsync($"/api/buy/items?actorUserId={actor}", new { name = "RL1", quantity = "1" });
        var p2 = await client.PostAsJsonAsync($"/api/buy/items?actorUserId={actor}", new { name = "RL2", quantity = "1" });
        Assert.True(p1.IsSuccessStatusCode, await p1.Content.ReadAsStringAsync());
        Assert.True(p2.IsSuccessStatusCode, await p2.Content.ReadAsStringAsync());

        var p3 = await client.PostAsJsonAsync($"/api/buy/items?actorUserId={actor}", new { name = "RL3", quantity = "1" });
        Assert.Equal(HttpStatusCode.TooManyRequests, p3.StatusCode);
        var doc = await JsonDocument.ParseAsync(await p3.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("code", out var c));
        Assert.Equal("rate_limited", c.GetString());
    }
}
