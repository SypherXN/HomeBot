using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

/// <summary>
/// HTTP tests for medium-tier features: search, balances, webhooks, admin, recurring buy, categorize rules.
/// </summary>
public sealed class MediumFeatureApiTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly WebApplication _app;
    private readonly HttpClient _client;
    private const string TestToken = "medium-feature-token";
    private const ulong Actor = 280_001;

    public MediumFeatureApiTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_medium_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        var sc = new ServiceCollection();
        sc.AddHomeBotApiTestServices(_dbPath);
        _services = sc.BuildServiceProvider();
        _services.GetRequiredService<ConfigService>().Set("timezone", "UTC");

        Environment.SetEnvironmentVariable("HOMEBOT_WEBHOOK_SECRET", "hook-secret-medium");
        Environment.SetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET", new string('x', 32));

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
        _app = builder.Build();
        HomeBotApiHost.Configure(_app, _services, TestToken);
        _app.StartAsync().GetAwaiter().GetResult();
        _client = _app.GetTestClient();
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", TestToken);
    }

    [Fact]
    public async Task Search_finds_buy_item_by_name()
    {
        await _client.PostAsJsonAsync(
            $"/api/buy/items?actorUserId={Actor}",
            new { name = "Organic milk", quantity = "1", store = "Costco" });

        var res = await _client.GetFromJsonAsync<JsonElement>("/api/search?q=milk");
        var buy = res.GetProperty("buy");
        Assert.True(buy.GetArrayLength() >= 1);
        Assert.Contains("milk", buy[0].GetProperty("title").GetString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Money_balances_returns_entries_after_expense()
    {
        await _client.PostAsJsonAsync(
            "/api/money/expenses",
            new { name = "Dinner", amountInput = "40", paidBy = Actor, owedBy = Actor + 1 });

        var bal = await _client.GetFromJsonAsync<JsonElement>($"/api/money/balances?userId={Actor}");
        Assert.Equal(Actor.ToString(), bal.GetProperty("userId").GetString());
        Assert.True(bal.GetProperty("balances").GetArrayLength() >= 1);
    }

    [Fact]
    public async Task Webhook_adds_buy_item_with_secret_header()
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/hooks/buy/add?actorUserId={Actor}")
        {
            Content = JsonContent.Create(new { name = "Webhook eggs", quantity = "12" }),
        };
        req.Headers.Add("X-HomeBot-Webhook-Secret", "hook-secret-medium");

        var res = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var search = await _client.GetFromJsonAsync<JsonElement>("/api/search?q=Webhook");
        Assert.True(search.GetProperty("buy").GetArrayLength() >= 1);
    }

    [Fact]
    public async Task Meta_includes_backup_stats_object()
    {
        var meta = await _client.GetFromJsonAsync<JsonElement>("/api/meta");
        Assert.True(meta.TryGetProperty("backups", out var backups));
        Assert.True(backups.TryGetProperty("backupDir", out _));
    }

    [Fact]
    public async Task Admin_users_list_requires_admin_jwt()
    {
        var auth = _services.GetRequiredService<WebAuthService>();
        auth.TryCreateFirstUser("adminuser", "password123", Actor.ToString(), null);
        auth.TryInsertWebUser("memberuser", "password123", (Actor + 2).ToString());

        var memberLogin = await _client.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "memberuser", password = "password123" });
        memberLogin.EnsureSuccessStatusCode();
        var memberBody = await memberLogin.Content.ReadFromJsonAsync<JsonElement>();
        var memberJwt = memberBody.GetProperty("accessToken").GetString()!;

        var memberClient = _app.GetTestClient();
        memberClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", memberJwt);
        var denied = await memberClient.GetAsync("/api/admin/users");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        var adminLogin = await _client.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "adminuser", password = "password123" });
        adminLogin.EnsureSuccessStatusCode();
        var adminBody = await adminLogin.Content.ReadFromJsonAsync<JsonElement>();
        var adminJwt = adminBody.GetProperty("accessToken").GetString()!;

        var adminClient = _app.GetTestClient();
        adminClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminJwt);
        var ok = await adminClient.GetAsync("/api/admin/users");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    [Fact]
    public async Task Budget_categorize_rule_applies_on_transaction_create()
    {
        var catRes = await _client.PostAsJsonAsync(
            $"/api/budget/categories?actorUserId={Actor}",
            new { name = "GroceriesMedium" });
        catRes.EnsureSuccessStatusCode();
        var cat = await catRes.Content.ReadFromJsonAsync<JsonElement>();
        var catId = cat.GetProperty("id").GetInt32();

        await _client.PostAsJsonAsync(
            "/api/budget/categorize-rules",
            new { matchField = "merchant", matchContains = "Whole Foods", categoryId = catId, priority = 10 });

        var txRes = await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "25",
                spentByUserId = Actor,
                merchant = "Whole Foods Market",
                transactionDate = "2026-05-01",
            });
        txRes.EnsureSuccessStatusCode();

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/budget/transactions?month=2026-05");
        var first = list.GetProperty("items")[0];
        Assert.Equal(catId, first.GetProperty("categoryId").GetInt32());
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("HOMEBOT_WEBHOOK_SECRET", null);
        Environment.SetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET", null);
        try
        {
            _app.StopAsync().GetAwaiter().GetResult();
        }
        catch
        {
            // ignored
        }

        _client.Dispose();
        _services.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try
        {
            if (File.Exists(_dbPath))
                File.Delete(_dbPath);
        }
        catch
        {
            // ignored
        }
    }
}
