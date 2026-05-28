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
/// End-to-end HTTP tests against the real minimal API + SQLite (isolated temp file per run).
/// </summary>
public sealed class ApiMutationTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly WebApplication _app;
    private readonly HttpClient _client;
    private const string TestToken = "integration-test-token";
    /// <summary>Stays within JSON safe integer range for <see cref="HttpClientJsonExtensions.PostAsJsonAsync"/>.</summary>
    private const ulong Actor = 100_001;

    public ApiMutationTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_api_test_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        var sc = new ServiceCollection();
        sc.AddSingleton(_ => new DatabaseService(_dbPath));
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
        HomeBotApiHost.Configure(_app, _services, TestToken);

        _app.StartAsync().GetAwaiter().GetResult();
        _client = _app.GetTestClient();
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", TestToken);
    }

    public void Dispose()
    {
        try
        {
            _app.StopAsync().GetAwaiter().GetResult();
        }
        catch
        {
            // ignore shutdown races
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
            // best-effort cleanup on Windows file locks
        }
    }

    [Fact]
    public async Task Health_and_meta_skip_auth()
    {
        var naked = _app.GetTestClient();
        var h = await naked.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, h.StatusCode);

        var m = await naked.GetAsync("/api/meta");
        Assert.Equal(HttpStatusCode.OK, m.StatusCode);
    }

    [Fact]
    public async Task Buy_list_requires_auth()
    {
        var naked = _app.GetTestClient();
        var r = await naked.GetAsync("/api/buy/items");
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
    }

    [Fact]
    public async Task Discord_guild_members_requires_auth()
    {
        var naked = _app.GetTestClient();
        var r = await naked.GetAsync("/api/discord/guild/members");
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
    }

    [Fact]
    public async Task Discord_guild_members_unavailable_without_live_socket()
    {
        var doc = await _client.GetFromJsonAsync<JsonElement>("/api/discord/guild/members");
        Assert.False(doc.GetProperty("available").GetBoolean());
        Assert.Equal(JsonValueKind.Array, doc.GetProperty("members").ValueKind);
        Assert.Equal(0, doc.GetProperty("members").GetArrayLength());
        Assert.True(doc.TryGetProperty("reason", out var reason));
        Assert.Equal(JsonValueKind.String, reason.ValueKind);
    }

    [Fact]
    public async Task Buy_tags_catalog_get_and_put()
    {
        var tags = await _client.GetFromJsonAsync<JsonElement>("/api/buy/tags");
        Assert.True(tags.TryGetProperty("tags", out var arr));
        Assert.Equal(JsonValueKind.Array, arr.ValueKind);
        Assert.False(tags.GetProperty("catalogEnforced").GetBoolean());

        var put = await _client.PutAsJsonAsync("/api/buy/tags", new { tags = new[] { "alpha", "beta" } });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var body = await put.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("ok").GetBoolean());
        var saved = body.GetProperty("tags");
        Assert.Equal(2, saved.GetArrayLength());

        var tags2 = await _client.GetFromJsonAsync<JsonElement>("/api/buy/tags");
        Assert.True(tags2.GetProperty("catalogEnforced").GetBoolean());
    }

    [Fact]
    public async Task Buy_crud_flow_via_http()
    {
        const string name = "ApiTestBuyItem";

        var post = await _client.PostAsJsonAsync(
            $"/api/buy/items?actorUserId={Actor}",
            new { name, quantity = "2", store = "TestMart", tags = "a,b", notes = "via api" });

        Assert.True(
            post.StatusCode is HttpStatusCode.OK or HttpStatusCode.Created,
            await post.Content.ReadAsStringAsync());

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/buy/items?page=0");
        Assert.Equal(JsonValueKind.Object, list.ValueKind);
        var items = list.GetProperty("items");
        Assert.Equal(JsonValueKind.Array, items.ValueKind);

        int id = 0;
        foreach (var el in items.EnumerateArray())
        {
            if (el.GetProperty("name").GetString() == name)
            {
                id = el.GetProperty("id").GetInt32();
                break;
            }
        }

        Assert.NotEqual(0, id);

        var put = await _client.PutAsJsonAsync(
            $"/api/buy/items/{id}",
            new { name = name + "Updated", notes = "patched" });

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var complete = await _client.PostAsync($"/api/buy/items/{id}/complete?actorUserId={Actor}", null);
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);

        var clear = await _client.DeleteAsync("/api/buy/items/completed");
        Assert.Equal(HttpStatusCode.OK, clear.StatusCode);
    }

    [Fact]
    public async Task Wishlist_add_complete_delete()
    {
        const string name = "ApiTestWish";

        var post = await _client.PostAsJsonAsync(
            $"/api/wishlist/items?actorUserId={Actor}",
            new { name, price = "$10" });

        Assert.True(
            post.StatusCode is HttpStatusCode.OK or HttpStatusCode.Created,
            await post.Content.ReadAsStringAsync());

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/wishlist/items?page=0");
        var items = list.GetProperty("items");
        int id = 0;
        foreach (var el in items.EnumerateArray())
        {
            if (el.GetProperty("name").GetString() == name)
            {
                id = el.GetProperty("id").GetInt32();
                break;
            }
        }

        Assert.NotEqual(0, id);

        var complete = await _client.PostAsync($"/api/wishlist/items/{id}/complete?actorUserId={Actor}", null);
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);

        var del = await _client.DeleteAsync($"/api/wishlist/items/{id}?actorUserId={Actor}");
        Assert.Equal(HttpStatusCode.OK, del.StatusCode);
    }

    [Fact]
    public async Task Money_expense_patch_delete()
    {
        ulong u1 = Actor;
        ulong u2 = Actor + 1;

        var post = await _client.PostAsJsonAsync(
            "/api/money/expenses",
            new { name = "ApiTestExp", amountInput = "20", paidBy = u1, owedBy = u2 });

        Assert.True(
            post.StatusCode is HttpStatusCode.OK or HttpStatusCode.Created,
            await post.Content.ReadAsStringAsync());

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/money/transactions?page=0");
        var items = list.GetProperty("items");
        int id = 0;
        foreach (var el in items.EnumerateArray())
        {
            if (el.GetProperty("name").GetString() == "ApiTestExp")
            {
                id = el.GetProperty("id").GetInt32();
                break;
            }
        }

        Assert.NotEqual(0, id);

        var patch = await _client.PatchAsJsonAsync(
            $"/api/money/transactions/{id}",
            new { name = "ApiTestExpRenamed", amountInput = "25" });

        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);

        var del = await _client.DeleteAsync($"/api/money/transactions/{id}?actorUserId={Actor}");
        Assert.Equal(HttpStatusCode.OK, del.StatusCode);
    }

    [Fact]
    public async Task Calendar_task_create_patch_complete_delete()
    {
        var post = await _client.PostAsJsonAsync(
            "/api/calendar/items",
            new { title = "ApiTestTask", start = "", allDay = false, assignToEveryone = false });

        Assert.True(
            post.StatusCode is HttpStatusCode.OK or HttpStatusCode.Created,
            await post.Content.ReadAsStringAsync());

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/calendar/items?page=0");
        var items = list.GetProperty("items");
        int id = 0;
        foreach (var el in items.EnumerateArray())
        {
            if (el.GetProperty("title").GetString() == "ApiTestTask")
            {
                id = el.GetProperty("id").GetInt32();
                break;
            }
        }

        Assert.NotEqual(0, id);

        var patch = await _client.PatchAsJsonAsync(
            $"/api/calendar/items/{id}",
            new { title = "ApiTestTaskRenamed" });

        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);

        var complete = await _client.PostAsync($"/api/calendar/items/{id}/complete?actorUserId={Actor}", null);
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);

        var del = await _client.DeleteAsync($"/api/calendar/items/{id}?actorUserId={Actor}");
        Assert.Equal(HttpStatusCode.OK, del.StatusCode);
    }

    [Fact]
    public async Task Calendar_daily_omit_instance_hides_from_range()
    {
        _services.GetRequiredService<ConfigService>().Set("timezone", "UTC");

        var post = await _client.PostAsJsonAsync(
            "/api/calendar/items",
            new
            {
                title = "ApiDailyOmit",
                start = "2026-04-10 09:00",
                allDay = false,
                assignToEveryone = false,
                recurrence = "daily",
                timezone = "UTC",
            });

        Assert.True(
            post.StatusCode is HttpStatusCode.OK or HttpStatusCode.Created,
            await post.Content.ReadAsStringAsync());

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/calendar/items?page=0");
        var items = list.GetProperty("items");
        int id = 0;
        foreach (var el in items.EnumerateArray())
        {
            if (el.GetProperty("title").GetString() == "ApiDailyOmit")
            {
                id = el.GetProperty("id").GetInt32();
                break;
            }
        }

        Assert.NotEqual(0, id);

        static async Task<int> CountRangeAsync(HttpClient client, int parentId)
        {
            var res = await client.GetAsync(
                "/api/calendar/range?from=2026-04-15&to=2026-04-18&timeZone=UTC");
            res.EnsureSuccessStatusCode();
            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            var root = doc.RootElement;
            Assert.Equal(JsonValueKind.Array, root.ValueKind);
            var n = 0;
            foreach (var row in root.EnumerateArray())
            {
                if (row.GetProperty("id").GetInt32() == parentId)
                    n++;
            }

            return n;
        }

        Assert.Equal(3, await CountRangeAsync(_client, id));

        var omit = await _client.PostAsJsonAsync(
            $"/api/calendar/items/{id}/omit-instance?actorUserId={Actor}",
            new { instanceStartUtc = "2026-04-16T09:00:00Z" });
        Assert.Equal(HttpStatusCode.OK, omit.StatusCode);

        Assert.Equal(2, await CountRangeAsync(_client, id));
    }

    [Fact]
    public async Task Calendar_daily_complete_instance_flags_range_row()
    {
        _services.GetRequiredService<ConfigService>().Set("timezone", "UTC");

        var post = await _client.PostAsJsonAsync(
            "/api/calendar/items",
            new
            {
                title = "ApiDailyCompleteOne",
                start = "2026-04-10 09:00",
                allDay = false,
                assignToEveryone = false,
                recurrence = "daily",
                timezone = "UTC",
            });

        post.EnsureSuccessStatusCode();

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/calendar/items?page=0");
        var items = list.GetProperty("items");
        int id = 0;
        foreach (var el in items.EnumerateArray())
        {
            if (el.GetProperty("title").GetString() == "ApiDailyCompleteOne")
            {
                id = el.GetProperty("id").GetInt32();
                break;
            }
        }

        Assert.NotEqual(0, id);

        var done = await _client.PostAsJsonAsync(
            $"/api/calendar/items/{id}/complete-instance?actorUserId={Actor}",
            new { instanceStartUtc = "2026-04-16T09:00:00Z" });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);

        var res = await _client.GetAsync("/api/calendar/range?from=2026-04-15&to=2026-04-18&timeZone=UTC");
        res.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var found = false;
        foreach (var row in doc.RootElement.EnumerateArray())
        {
            if (row.GetProperty("id").GetInt32() != id)
                continue;
            if (row.GetProperty("instanceStartUtc").GetString() != "2026-04-16T09:00:00Z")
                continue;
            Assert.True(row.GetProperty("isInstanceCompleted").GetBoolean());
            found = true;
            break;
        }

        Assert.True(found);
    }

    [Fact]
    public async Task Undo_after_buy_delete_restores()
    {
        const string name = "UndoRestoreBuy";

        var post = await _client.PostAsJsonAsync(
            $"/api/buy/items?actorUserId={Actor}",
            new { name, quantity = "1" });
        post.EnsureSuccessStatusCode();

        var list1 = await _client.GetFromJsonAsync<JsonElement>("/api/buy/items?page=0");
        int id = 0;
        foreach (var el in list1.GetProperty("items").EnumerateArray())
        {
            if (el.GetProperty("name").GetString() == name)
            {
                id = el.GetProperty("id").GetInt32();
                break;
            }
        }

        Assert.NotEqual(0, id);

        var del = await _client.DeleteAsync($"/api/buy/items/{id}?actorUserId={Actor}");
        del.EnsureSuccessStatusCode();

        var undo = await _client.PostAsync($"/api/undo?actorUserId={Actor}", null);
        undo.EnsureSuccessStatusCode();
        var body = await undo.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("undone").GetBoolean());

        var list2 = await _client.GetFromJsonAsync<JsonElement>("/api/buy/items?page=0");
        var found = false;
        foreach (var el in list2.GetProperty("items").EnumerateArray())
        {
            if (el.GetProperty("id").GetInt32() == id && el.GetProperty("name").GetString() == name)
            {
                found = true;
                break;
            }
        }

        Assert.True(found, "Undo should restore deleted buy row.");
    }
}
