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
/// HTTP tests for Tier A: account archive, transaction account patch, calendar ICS export.
/// </summary>
public sealed class TierAFeatureApiTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly WebApplication _app;
    private readonly HttpClient _client;
    private const string TestToken = "tier-a-feature-token";
    private const ulong Actor = 270_001;

    public TierAFeatureApiTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_tier_a_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        var sc = new ServiceCollection();
        sc.AddHomeBotApiTestServices(_dbPath);
        _services = sc.BuildServiceProvider();
        _services.GetRequiredService<ConfigService>().Set("timezone", "UTC");

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
    public async Task Calendar_export_ics_returns_vcalendar_for_range()
    {
        var post = await _client.PostAsJsonAsync(
            "/api/calendar/items",
            new
            {
                title = "TierA Event",
                start = "2026-06-10 14:00",
                end = "",
                allDay = false,
                description = "",
                notes = "",
                recurrence = "",
                timezone = "UTC",
            });
        post.EnsureSuccessStatusCode();

        var res = await _client.GetAsync(
            "/api/calendar/export.ics?from=2026-06-01&to=2026-06-30&timeZone=UTC");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("text/calendar; charset=utf-8", res.Content.Headers.ContentType?.ToString());

        var body = await res.Content.ReadAsStringAsync();
        Assert.Contains("BEGIN:VCALENDAR", body, StringComparison.Ordinal);
        Assert.Contains("TierA Event", body, StringComparison.Ordinal);
        Assert.Contains("END:VCALENDAR", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Budget_account_archive_excludes_from_default_list()
    {
        var create = await _client.PostAsJsonAsync(
            $"/api/budget/accounts?actorUserId={Actor}",
            new { name = "Old Card", accountType = "credit" });
        var id = (await create.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];

        var patch = await _client.PatchAsJsonAsync(
            $"/api/budget/accounts/{id}?actorUserId={Actor}",
            new { isActive = false });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);

        var activeOnly = await _client.GetFromJsonAsync<JsonElement>("/api/budget/accounts");
        Assert.DoesNotContain(
            activeOnly.EnumerateArray(),
            a => a.GetProperty("id").GetInt32() == id);

        var withInactive = await _client.GetFromJsonAsync<JsonElement>(
            "/api/budget/accounts?includeInactive=true");
        Assert.Contains(
            withInactive.EnumerateArray(),
            a => a.GetProperty("id").GetInt32() == id && !a.GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task Budget_transaction_patch_accountId_moves_balance()
    {
        var catId = await CreateCategoryAsync("AcctMove");
        var idA = await CreateAccountAsync("AcctA");
        var idB = await CreateAccountAsync("AcctB");

        var tx = await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                amountInput = "100",
                categoryId = catId,
                type = "expense",
                spentByUserId = Actor,
                transactionDate = "2026-06-01",
                accountId = idA,
            });
        tx.EnsureSuccessStatusCode();
        var txId = (await tx.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];

        async Task<double> BalAsync(int accountId)
        {
            var accounts = await _client.GetFromJsonAsync<JsonElement>("/api/budget/accounts");
            foreach (var a in accounts.EnumerateArray())
            {
                if (a.GetProperty("id").GetInt32() == accountId)
                    return a.GetProperty("currentBalance").GetDouble();
            }

            throw new InvalidOperationException($"account {accountId} missing");
        }

        Assert.Equal(-100, await BalAsync(idA));

        var patch = await _client.PatchAsJsonAsync(
            $"/api/budget/transactions/{txId}?actorUserId={Actor}",
            new { accountId = idB });
        patch.EnsureSuccessStatusCode();

        Assert.Equal(0, await BalAsync(idA));
        Assert.Equal(-100, await BalAsync(idB));
    }

    [Fact]
    public async Task Budget_notifications_endpoint_returns_json_array()
    {
        var res = await _client.GetAsync("/api/budget/notifications");
        res.EnsureSuccessStatusCode();
        var json = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Array, json.ValueKind);
    }

    [Fact]
    public async Task Budget_notifications_count_returns_number()
    {
        var res = await _client.GetAsync("/api/budget/notifications/count");
        res.EnsureSuccessStatusCode();
        var json = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(json.TryGetProperty("count", out var count));
        Assert.Equal(JsonValueKind.Number, count.ValueKind);
    }

    [Fact]
    public async Task Budget_notification_dismiss_reduces_pending_list()
    {
        var before = await _client.GetFromJsonAsync<JsonElement>("/api/budget/notifications");
        if (before.ValueKind != JsonValueKind.Array || before.GetArrayLength() == 0)
            return;

        var key = before[0].GetProperty("key").GetString();
        Assert.False(string.IsNullOrWhiteSpace(key));

        var dismiss = await _client.PostAsJsonAsync(
            $"/api/budget/notifications/dismiss?actorUserId={Actor}",
            new { key });
        dismiss.EnsureSuccessStatusCode();

        var after = await _client.GetFromJsonAsync<JsonElement>("/api/budget/notifications");
        foreach (var item in after.EnumerateArray())
        {
            Assert.NotEqual(key, item.GetProperty("key").GetString());
        }
    }

    [Fact]
    public async Task Household_settings_round_trip_page_size()
    {
        var put = await _client.PutAsJsonAsync("/api/household/settings", new { key = "page_size", value = "12" });
        put.EnsureSuccessStatusCode();

        var get = await _client.GetFromJsonAsync<JsonElement>("/api/household/settings");
        Assert.Equal("12", get.GetProperty("settings").GetProperty("page_size").GetString());
    }

    private async Task<int> CreateCategoryAsync(string name)
    {
        var res = await _client.PostAsJsonAsync(
            $"/api/budget/categories?actorUserId={Actor}",
            new { name, visibility = "household" });
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];
    }

    private async Task<int> CreateAccountAsync(string name)
    {
        var res = await _client.PostAsJsonAsync(
            $"/api/budget/accounts?actorUserId={Actor}",
            new { name, accountType = "checking" });
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];
    }

    public void Dispose()
    {
        try
        {
            _app.StopAsync().GetAwaiter().GetResult();
        }
        catch
        {
            // ignored
        }

        try
        {
            _app.DisposeAsync().AsTask().GetAwaiter().GetResult();
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
            // ignore file lock races on Windows
        }
    }
}
