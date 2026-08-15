using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

/// <summary>
/// HTTP integration tests mapped to capabilities in docs/FEATURES.md (API-testable surfaces).
/// </summary>
public sealed class FeaturesDocumentationApiTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly WebApplication _app;
    private readonly HttpClient _client;
    private readonly string? _restoreJwt;
    private readonly string? _restoreWebhook;
    private readonly string? _restoreVapidPub;
    private readonly string? _restoreVapidPriv;
    private const string TestToken = "features-doc-token";
    private const string JwtSecret = "0123456789abcdef0123456789abcdef";
    private const string WebhookSecret = "features-webhook-secret";
    private const ulong Actor = 290_001;

    public FeaturesDocumentationApiTests()
    {
        _restoreJwt = Environment.GetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET");
        _restoreWebhook = Environment.GetEnvironmentVariable("HOMEBOT_WEBHOOK_SECRET");
        _restoreVapidPub = Environment.GetEnvironmentVariable("HOMEBOT_VAPID_PUBLIC_KEY");
        _restoreVapidPriv = Environment.GetEnvironmentVariable("HOMEBOT_VAPID_PRIVATE_KEY");

        Environment.SetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET", JwtSecret);
        Environment.SetEnvironmentVariable("HOMEBOT_WEBHOOK_SECRET", WebhookSecret);
        Environment.SetEnvironmentVariable("HOMEBOT_VAPID_PUBLIC_KEY", "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U");
        Environment.SetEnvironmentVariable("HOMEBOT_VAPID_PRIVATE_KEY", "UUxI4O8-FbRWD_AAPYZfk4B28ZtKd5RSamCA0oc3UWs");
        Environment.SetEnvironmentVariable("HOMEBOT_VAPID_SUBJECT", "mailto:test@homebot.local");

        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_features_doc_{Guid.NewGuid():N}.db");
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

    // --- Meta & essentials (FEATURES: HTTP API essentials) ---

    [Fact]
    public async Task Meta_lists_documented_api_features()
    {
        var meta = await _client.GetFromJsonAsync<JsonElement>("/api/meta");
        var features = meta.GetProperty("features").EnumerateArray().Select(e => e.GetString()).ToHashSet();
        foreach (var f in new[]
                 {
                     "buy", "wishlist", "money", "budget", "calendar", "undo",
                     "search", "webhooks", "household-report", "buy-recurring", "web-admin",
                 })
            Assert.Contains(f, features);

        Assert.True(meta.TryGetProperty("backups", out _));
        Assert.Equal("/openapi/v1.json", meta.GetProperty("openApi").GetString());
    }

    [Fact]
    public async Task OpenApi_document_lists_core_paths()
    {
        var res = await _app.GetTestClient().GetAsync("/openapi/v1.json");
        res.EnsureSuccessStatusCode();
        var text = await res.Content.ReadAsStringAsync();
        Assert.Contains("/api/meals/recipes", text, StringComparison.Ordinal);
        Assert.Contains("/api/search", text, StringComparison.Ordinal);
        Assert.Contains("/api/buy/stale", text, StringComparison.Ordinal);
        Assert.Contains("/api/buy/stores", text, StringComparison.Ordinal);
        Assert.Contains("/api/ops/health", text, StringComparison.Ordinal);
    }

    // --- Buy (FEATURES: Buy list) ---

    [Fact]
    public async Task Buy_tag_catalog_clear_completed_and_createdAt()
    {
        await _client.PutAsJsonAsync("/api/buy/tags", new { tags = new[] { "dairy" } });
        var tags = await _client.GetFromJsonAsync<JsonElement>("/api/buy/tags");
        Assert.Contains("dairy", tags.GetProperty("tags").EnumerateArray().Select(t => t.GetString()));

        var post = await _client.PostAsJsonAsync(
            $"/api/buy/items?actorUserId={Actor}",
            new { name = "DocBuyItem", quantity = "1", tags = "dairy" });
        post.EnsureSuccessStatusCode();

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/buy/items?page=0");
        var row = list.GetProperty("items").EnumerateArray().First(i => i.GetProperty("name").GetString() == "DocBuyItem");
        Assert.True(row.TryGetProperty("createdAt", out var createdAt));
        Assert.False(string.IsNullOrWhiteSpace(createdAt.GetString()));

        var id = row.GetProperty("id").GetInt32();
        await _client.PostAsync($"/api/buy/items/{id}/complete?actorUserId={Actor}", null);
        (await _client.DeleteAsync("/api/buy/items/completed")).EnsureSuccessStatusCode();

        var after = await _client.GetFromJsonAsync<JsonElement>("/api/buy/items?page=0");
        Assert.DoesNotContain(
            after.GetProperty("items").EnumerateArray(),
            i => i.GetProperty("id").GetInt32() == id);
    }

    // --- Wishlist (FEATURES: Wishlist) ---

    [Fact]
    public async Task Wishlist_add_to_buy_bulk_and_undo()
    {
        var post = await _client.PostAsJsonAsync(
            $"/api/wishlist/items?actorUserId={Actor}",
            new { name = "DocWishGift", ownerUserId = Actor.ToString() });
        post.EnsureSuccessStatusCode();
        var list = await _client.GetFromJsonAsync<JsonElement>("/api/wishlist/items?page=0");
        var id = FindWishlistId(list, "DocWishGift");
        Assert.NotEqual(0, id);

        (await _client.PostAsync($"/api/wishlist/items/{id}/add-to-buy?actorUserId={Actor}", null))
            .EnsureSuccessStatusCode();
        var buy = await _client.GetFromJsonAsync<JsonElement>("/api/buy/items?page=0");
        Assert.Contains(
            buy.GetProperty("items").EnumerateArray(),
            i => i.GetProperty("name").GetString() == "DocWishGift");

        await _client.PostAsJsonAsync(
            $"/api/wishlist/items?actorUserId={Actor}",
            new { name = "BulkA", ownerUserId = Actor.ToString() });
        await _client.PostAsJsonAsync(
            $"/api/wishlist/items?actorUserId={Actor}",
            new { name = "BulkB", ownerUserId = Actor.ToString() });
        var list2 = await _client.GetFromJsonAsync<JsonElement>("/api/wishlist/items?page=0");
        var ids = new[]
        {
            FindWishlistId(list2, "BulkA"),
            FindWishlistId(list2, "BulkB"),
        };
        Assert.All(ids, i => Assert.NotEqual(0, i));

        (await _client.PostAsJsonAsync("/api/wishlist/items/bulk-complete", new { actorUserId = Actor.ToString(), ids }))
            .EnsureSuccessStatusCode();

        var undo = await _client.PostAsync($"/api/undo?actorUserId={Actor}", null);
        undo.EnsureSuccessStatusCode();
        Assert.True((await undo.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("undone").GetBoolean());
    }

    // --- Money (FEATURES: Money) ---

    [Fact]
    public async Task Money_simple_expense_payment_delete_and_undo()
    {
        ulong u2 = Actor + 1;
        (await _client.PostAsJsonAsync(
            "/api/money/expenses",
            new { name = "DocSimple", amountInput = "15+5", paidBy = Actor, owedBy = u2 })).EnsureSuccessStatusCode();

        (await _client.PostAsJsonAsync(
            "/api/money/payments",
            new { amountInput = "10", paidBy = u2, receivedBy = Actor })).EnsureSuccessStatusCode();

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/money/transactions?page=0");
        var txId = list.GetProperty("items").EnumerateArray()
            .First(i => i.GetProperty("name").GetString() == "DocSimple")
            .GetProperty("id").GetInt32();

        (await _client.DeleteAsync($"/api/money/transactions/{txId}?actorUserId={Actor}")).EnsureSuccessStatusCode();

        var undo = await _client.PostAsync($"/api/undo?actorUserId={Actor}", null);
        undo.EnsureSuccessStatusCode();

        var restored = await _client.GetFromJsonAsync<JsonElement>("/api/money/transactions?page=0");
        Assert.Contains(
            restored.GetProperty("items").EnumerateArray(),
            i => i.GetProperty("id").GetInt32() == txId);
    }

    // --- Budget extras (FEATURES: Budget Web UI areas) ---

    [Fact]
    public async Task Budget_csv_tax_forecast_income_plan_and_bill_pay()
    {
        var catId = await CreateBudgetCategoryAsync("DocBudgetCat");
        await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "33",
                categoryId = catId,
                spentByUserId = Actor.ToString(),
                transactionDate = "2026-08-01",
            });

        var csv = await _client.GetAsync("/api/budget/export.csv?from=2026-08-01&to=2026-08-31");
        csv.EnsureSuccessStatusCode();
        Assert.Contains("text/csv", csv.Content.Headers.ContentType?.ToString() ?? "", StringComparison.OrdinalIgnoreCase);

        var tax = await _client.GetFromJsonAsync<JsonElement>("/api/budget/tax-summary?year=2026");
        Assert.Equal(JsonValueKind.Array, tax.ValueKind);

        var forecast = await _client.GetFromJsonAsync<JsonElement>("/api/budget/forecast?month=2026-08");
        Assert.Equal(JsonValueKind.Array, forecast.ValueKind);

        await _client.PutAsJsonAsync(
            $"/api/budget/income-plan?actorUserId={Actor}",
            new { month = "2026-08", plannedIncome = 5000 });

        var bill = await _client.PostAsJsonAsync(
            $"/api/budget/bills?actorUserId={Actor}",
            new { name = "DocBill", amountEstimate = 50, dueDay = 10, categoryId = catId });
        bill.EnsureSuccessStatusCode();
        var billId = (await bill.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        (await _client.PostAsJsonAsync(
            $"/api/budget/bills/{billId}/pay?actorUserId={Actor}",
            new { amountInput = "50", transactionDate = "2026-08-05" })).EnsureSuccessStatusCode();
    }

    // --- Calendar (FEATURES: Calendar) ---

    [Fact]
    public async Task Calendar_import_ics_instance_complete_and_reset()
    {
        const string ics = """
            BEGIN:VCALENDAR
            BEGIN:VEVENT
            SUMMARY:DocImportEvent
            DTSTART:20260820T140000Z
            DTEND:20260820T150000Z
            END:VEVENT
            END:VCALENDAR
            """;

        using var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent(Encoding.UTF8.GetBytes(ics)), "file", "import.ics");
        var import = await _client.PostAsync($"/api/calendar/import.ics?actorUserId={Actor}", content);
        import.EnsureSuccessStatusCode();
        var imported = await import.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(imported.GetProperty("imported").GetInt32() >= 1);

        var post = await _client.PostAsJsonAsync(
            "/api/calendar/items",
            new
            {
                title = "DocRecurring",
                start = "2026-08-10 10:00",
                end = "2026-08-10 11:00",
                recurrence = "daily",
                timezone = "UTC",
            });
        post.EnsureSuccessStatusCode();
        var calList = await _client.GetFromJsonAsync<JsonElement>("/api/calendar/items?page=0");
        var calId = FindCalendarId(calList, "DocRecurring");
        Assert.NotEqual(0, calId);

        var range = await _client.GetFromJsonAsync<JsonElement>(
            "/api/calendar/range?from=2026-08-10&to=2026-08-12&timeZone=UTC");
        var instance = range.EnumerateArray().First(r => r.GetProperty("id").GetInt32() == calId);
        var instanceKey = instance.GetProperty("instanceStartUtc").GetString()!;

        (await _client.PostAsJsonAsync(
            $"/api/calendar/items/{calId}/complete-instance?actorUserId={Actor}",
            new { instanceStartUtc = instanceKey })).EnsureSuccessStatusCode();

        (await _client.DeleteAsync(
            $"/api/calendar/items/{calId}/instance?actorUserId={Actor}&instanceStartUtc={Uri.EscapeDataString(instanceKey)}"))
            .EnsureSuccessStatusCode();
    }

    // --- Meals (FEATURES: Meal planning) ---

    [Fact]
    public async Task Meals_recipe_plan_add_to_buy_and_calendar()
    {
        var recipe = await _client.PostAsJsonAsync(
            "/api/meals/recipes",
            new
            {
                name = "DocTacos",
                ingredients = new[] { new { name = "Tortillas", quantity = "8" }, new { name = "Cheese", quantity = "1" } },
            });
        recipe.EnsureSuccessStatusCode();
        var recipeId = (await recipe.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var plan = await _client.PostAsJsonAsync(
            $"/api/meals/plan?actorUserId={Actor}",
            new { planDate = "2026-08-15", mealSlot = "dinner", recipeId });
        plan.EnsureSuccessStatusCode();
        var planId = (await plan.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        (await _client.PostAsync($"/api/meals/plan/{planId}/add-to-buy?actorUserId={Actor}", null))
            .EnsureSuccessStatusCode();
        var buy = await _client.GetFromJsonAsync<JsonElement>("/api/buy/items?page=0");
        Assert.Contains(buy.GetProperty("items").EnumerateArray(), i => i.GetProperty("name").GetString() == "Tortillas");

        (await _client.PostAsync($"/api/meals/plan/{planId}/calendar?actorUserId={Actor}", null))
            .EnsureSuccessStatusCode();

        var entries = await _client.GetFromJsonAsync<JsonElement>("/api/meals/plan?from=2026-08-15&to=2026-08-15");
        var entry = entries.GetProperty("entries").EnumerateArray().First(e => e.GetProperty("id").GetInt32() == planId);
        Assert.True(entry.GetProperty("calendarItemId").GetInt32() > 0);
    }

    // --- Medium-tier (FEATURES: Medium-tier features) ---

    [Fact]
    public async Task Search_covers_all_domains()
    {
        await _client.PostAsJsonAsync(
            $"/api/wishlist/items?actorUserId={Actor}",
            new { name = "SearchableWish", ownerUserId = Actor.ToString() });

        var catId = await CreateBudgetCategoryAsync("SearchCat");
        await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "1",
                categoryId = catId,
                spentByUserId = Actor.ToString(),
                merchant = "SearchableMerchant",
                transactionDate = "2026-08-01",
            });

        await _client.PostAsJsonAsync(
            "/api/calendar/items",
            new { title = "SearchableEvent", start = "2026-08-20 12:00", timezone = "UTC" });

        var res = await _client.GetFromJsonAsync<JsonElement>("/api/search?q=Searchable");
        Assert.True(res.GetProperty("wishlist").GetArrayLength() >= 1);
        Assert.True(res.GetProperty("budget").GetArrayLength() >= 1);
        Assert.True(res.GetProperty("calendar").GetArrayLength() >= 1);
    }

    [Fact]
    public async Task Buy_recurring_crud_and_process_due()
    {
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var create = await _client.PostAsJsonAsync(
            $"/api/buy/recurring?actorUserId={Actor}",
            new { name = "WeeklyMilk", quantity = "1", cadence = "weekly", nextDueDate = today });
        create.EnsureSuccessStatusCode();
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/buy/recurring");
        Assert.Contains(list.GetProperty("items").EnumerateArray(), i => i.GetProperty("id").GetInt32() == id);

        (await _client.PutAsJsonAsync($"/api/buy/recurring/{id}", new { notes = "updated" })).EnsureSuccessStatusCode();

        var added = _services.GetRequiredService<BuyRecurringService>().ProcessDueItems();
        Assert.True(added >= 1);
        var buy = _services.GetRequiredService<BuyService>().GetBuyList(page: 0);
        Assert.Contains(buy.Items, i => i.Name == "WeeklyMilk");

        (await _client.DeleteAsync($"/api/buy/recurring/{id}")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Webhooks_calendar_budget_and_secret_validation()
    {
        var calReq = new HttpRequestMessage(HttpMethod.Post, $"/api/hooks/calendar/add?actorUserId={Actor}")
        {
            Content = JsonContent.Create(new { title = "WebhookEvent", start = "2026-08-01 18:00" }),
        };
        calReq.Headers.Add("X-HomeBot-Webhook-Secret", WebhookSecret);
        (await _client.SendAsync(calReq)).EnsureSuccessStatusCode();

        var catId = await CreateBudgetCategoryAsync("WebhookCat");
        var budgetReq = new HttpRequestMessage(HttpMethod.Post, $"/api/hooks/budget/expense?actorUserId={Actor}")
        {
            Content = JsonContent.Create(new
            {
                amountInput = "9.99",
                categoryId = catId,
                merchant = "WebhookStore",
                receiptUrl = "https://example.com/r",
            }),
        };
        budgetReq.Headers.Add("X-HomeBot-Webhook-Secret", WebhookSecret);
        (await _client.SendAsync(budgetReq)).EnsureSuccessStatusCode();

        var bad = new HttpRequestMessage(HttpMethod.Post, $"/api/hooks/buy/add?actorUserId={Actor}")
        {
            Content = JsonContent.Create(new { name = "Nope" }),
        };
        bad.Headers.Add("X-HomeBot-Webhook-Secret", "wrong");
        Assert.Equal(HttpStatusCode.Forbidden, (await _client.SendAsync(bad)).StatusCode);
    }

    [Fact]
    public async Task Household_report_and_audit_log()
    {
        _services.GetRequiredService<HouseholdAuditService>().Log("test", "doc-feature", Actor, "tester", "detail");

        var audit = await _client.GetFromJsonAsync<JsonElement>("/api/audit/household?limit=10");
        Assert.True(audit.GetProperty("entries").GetArrayLength() >= 1);

        var report = await _client.GetFromJsonAsync<JsonElement>("/api/household/report?month=2026-08");
        Assert.True(report.TryGetProperty("markdown", out var md));
        Assert.Equal(JsonValueKind.String, md.ValueKind);
    }

    [Fact]
    public async Task Notification_preferences_and_categorize_rule_delete()
    {
        var jwt = await LoginJwtAsync(Actor.ToString());

        var prefsClient = _app.GetTestClient();
        prefsClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

        var get = await prefsClient.GetFromJsonAsync<JsonElement>("/api/notifications/preferences");
        Assert.True(get.GetProperty("budgetAlerts").GetBoolean());

        (await prefsClient.PutAsJsonAsync("/api/notifications/preferences", new
        {
            budgetAlerts = false,
            calendarDm = true,
            weeklyDigest = false,
        })).EnsureSuccessStatusCode();

        var after = await prefsClient.GetFromJsonAsync<JsonElement>("/api/notifications/preferences");
        Assert.False(after.GetProperty("budgetAlerts").GetBoolean());
        Assert.False(after.GetProperty("weeklyDigest").GetBoolean());

        var catId = await CreateBudgetCategoryAsync("RuleCat");
        var rule = await _client.PostAsJsonAsync(
            "/api/budget/categorize-rules",
            new { matchField = "merchant", matchContains = "RuleShop", categoryId = catId, priority = 1 });
        var ruleId = (await rule.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        (await _client.DeleteAsync($"/api/budget/categorize-rules/{ruleId}")).EnsureSuccessStatusCode();
        var rules = await _client.GetFromJsonAsync<JsonElement>("/api/budget/categorize-rules");
        Assert.DoesNotContain(
            rules.GetProperty("rules").EnumerateArray(),
            r => r.GetProperty("id").GetInt32() == ruleId);
    }

    // --- Google Calendar, Push, Ops (FEATURES: medium-tier) ---

    [Fact]
    public async Task Google_calendar_status_requires_jwt()
    {
        var anon = await _app.GetTestClient().GetAsync("/api/calendar/google/status");
        Assert.Equal(HttpStatusCode.Unauthorized, anon.StatusCode);

        var jwt = await LoginJwtAsync(Actor.ToString());
        var client = _app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        var status = await client.GetFromJsonAsync<JsonElement>("/api/calendar/google/status");
        Assert.False(status.GetProperty("configured").GetBoolean());
        Assert.False(status.GetProperty("connected").GetBoolean());
    }

    [Fact]
    public async Task Push_vapid_and_subscribe_with_jwt()
    {
        var pub = await _client.GetFromJsonAsync<JsonElement>("/api/push/vapid-public-key");
        Assert.True(pub.GetProperty("configured").GetBoolean());
        Assert.False(string.IsNullOrWhiteSpace(pub.GetProperty("publicKey").GetString()));

        var jwt = await LoginJwtAsync(Actor.ToString());
        var pushClient = _app.GetTestClient();
        pushClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

        var sub = await pushClient.PostAsJsonAsync("/api/push/subscribe", new
        {
            endpoint = "https://push.example.com/sub/doc-test",
            keys = new { p256dh = "key", auth = "auth" },
        });
        sub.EnsureSuccessStatusCode();

        (await pushClient.PostAsJsonAsync("/api/push/unsubscribe", new
        {
            endpoint = "https://push.example.com/sub/doc-test",
        })).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Ops_health_and_prometheus_metrics()
    {
        var health = await _client.GetFromJsonAsync<JsonElement>("/api/ops/health");
        Assert.True(health.TryGetProperty("databaseBytes", out _));
        Assert.True(health.TryGetProperty("tableCounts", out _));

        var metricsReq = new HttpRequestMessage(HttpMethod.Get, "/api/ops/metrics");
        metricsReq.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/plain"));
        var metrics = await _client.SendAsync(metricsReq);
        metrics.EnsureSuccessStatusCode();
        var body = await metrics.Content.ReadAsStringAsync();
        Assert.Contains("homebot_", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Household_settings_timezone_round_trip()
    {
        (await _client.PutAsJsonAsync("/api/household/settings", new { key = "timezone", value = "America/New_York" }))
            .EnsureSuccessStatusCode();
        var get = await _client.GetFromJsonAsync<JsonElement>("/api/household/settings");
        Assert.Equal("America/New_York", get.GetProperty("settings").GetProperty("timezone").GetString());
    }

    private async Task<int> CreateBudgetCategoryAsync(string name)
    {
        var res = await _client.PostAsJsonAsync(
            $"/api/budget/categories?actorUserId={Actor}",
            new { name, visibility = "household" });
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
    }

    private async Task<string> LoginJwtAsync(string discordUserId)
    {
        var auth = _services.GetRequiredService<WebAuthService>();
        auth.TryCreateFirstUser("featuresdoc", "password123", discordUserId, null);

        var login = await _client.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "featuresdoc", password = "password123" });
        login.EnsureSuccessStatusCode();
        return (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString()!;
    }

    private static int FindWishlistId(JsonElement list, string name)
    {
        foreach (var el in list.GetProperty("items").EnumerateArray())
        {
            if (el.GetProperty("name").GetString() == name)
                return el.GetProperty("id").GetInt32();
        }

        return 0;
    }

    private static int FindCalendarId(JsonElement list, string title)
    {
        foreach (var el in list.GetProperty("items").EnumerateArray())
        {
            if (el.GetProperty("title").GetString() == title)
                return el.GetProperty("id").GetInt32();
        }

        return 0;
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET", _restoreJwt);
        Environment.SetEnvironmentVariable("HOMEBOT_WEBHOOK_SECRET", _restoreWebhook);
        Environment.SetEnvironmentVariable("HOMEBOT_VAPID_PUBLIC_KEY", _restoreVapidPub);
        Environment.SetEnvironmentVariable("HOMEBOT_VAPID_PRIVATE_KEY", _restoreVapidPriv);
        Environment.SetEnvironmentVariable("HOMEBOT_VAPID_SUBJECT", null);

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
