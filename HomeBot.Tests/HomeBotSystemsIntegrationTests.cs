using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace HomeBot.Tests;

/// <summary>
/// End-to-end exercise of every major subsystem through the real HTTP API and SQLite,
/// mirroring the flows the Web UI performs.
/// </summary>
public sealed class HomeBotSystemsIntegrationTests : IDisposable
{
    private readonly HomeBotIntegrationTestHost _host;
    private readonly HttpClient _client;
    private const ulong Actor = HomeBotIntegrationTestHost.DefaultActor;

    public HomeBotSystemsIntegrationTests()
    {
        _host = new HomeBotIntegrationTestHost();
        _client = _host.Client;
    }

    [Fact]
    public async Task Meta_exposes_all_household_features()
    {
        var meta = await _client.GetFromJsonAsync<JsonElement>("/api/meta");
        var features = meta.GetProperty("features").EnumerateArray().Select(e => e.GetString()).ToHashSet();
        Assert.Contains("buy", features);
        Assert.Contains("wishlist", features);
        Assert.Contains("money", features);
        Assert.Contains("budget", features);
        Assert.Contains("calendar", features);
        Assert.Contains("undo", features);
        Assert.Contains("search", features);
        Assert.Contains("webhooks", features);
        Assert.Contains("household-report", features);
        Assert.Contains("buy-recurring", features);
        Assert.Contains("web-admin", features);
    }

    [Fact]
    public async Task All_subsystems_end_to_end_workflow()
    {
        await ExerciseBuyAsync();
        await ExerciseWishlistAsync();
        await ExerciseMoneyAsync();
        await ExerciseBudgetAsync();
        await ExerciseCalendarAsync();
    }

    private async Task ExerciseBuyAsync()
    {
        const string name = "SystemsBuy";

        await _client.PutAsJsonAsync("/api/buy/tags", new { tags = new[] { "grocery" } });

        var post = await _client.PostAsJsonAsync(
            $"/api/buy/items?actorUserId={Actor}",
            new { name, quantity = "2", store = "Costco", tags = "grocery", notes = "systems test" });
        post.EnsureSuccessStatusCode();

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/buy/items?page=0&store=Costco");
        var id = FindBuyId(list, name);
        Assert.NotEqual(0, id);

        var put = await _client.PutAsJsonAsync($"/api/buy/items/{id}", new { notes = "updated" });
        put.EnsureSuccessStatusCode();

        (await _client.DeleteAsync($"/api/buy/items/{id}?actorUserId={Actor}")).EnsureSuccessStatusCode();

        var undo = await _client.PostAsync($"/api/undo?actorUserId={Actor}", null);
        undo.EnsureSuccessStatusCode();
        Assert.True((await undo.Content.ReadFromJsonAsync<JsonElement>())!.GetProperty("undone").GetBoolean());

        var restored = await _client.GetFromJsonAsync<JsonElement>("/api/buy/items?page=0");
        Assert.Contains(
            restored.GetProperty("items").EnumerateArray(),
            i => i.GetProperty("id").GetInt32() == id && i.GetProperty("name").GetString() == name);
    }

    private async Task ExerciseWishlistAsync()
    {
        const string name = "SystemsWish";

        var post = await _client.PostAsJsonAsync(
            $"/api/wishlist/items?actorUserId={Actor}",
            new { name, description = "want this", price = "$25", ownerUserId = Actor });
        post.EnsureSuccessStatusCode();

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/wishlist/items?page=0");
        var id = FindWishlistId(list, name);
        Assert.NotEqual(0, id);

        var ownersDoc = await _client.GetFromJsonAsync<JsonElement>("/api/wishlist/owners");
        Assert.True(ownersDoc.TryGetProperty("owners", out var owners));
        Assert.Equal(JsonValueKind.Array, owners.ValueKind);

        (await _client.PutAsJsonAsync(
            $"/api/wishlist/items/{id}",
            new { name, description = "updated", price = "$30" })).EnsureSuccessStatusCode();

        (await _client.PostAsync($"/api/wishlist/items/{id}/complete?actorUserId={Actor}", null))
            .EnsureSuccessStatusCode();
    }

    private async Task ExerciseMoneyAsync()
    {
        ulong u1 = Actor;
        ulong u2 = Actor + 1;

        (await _client.PostAsJsonAsync(
            "/api/money/expenses/split",
            new
            {
                name = "SystemsSplit",
                description = "dinner",
                notes = "receipt",
                amountInput = "40",
                paidBy = u1,
                owedBy = u2,
                percent = 50,
            })).EnsureSuccessStatusCode();

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/money/transactions?page=0");
        var txId = FindMoneyId(list, "SystemsSplit");
        Assert.NotEqual(0, txId);

        (await _client.PatchAsJsonAsync(
            $"/api/money/transactions/{txId}",
            new { description = "dinner updated" })).EnsureSuccessStatusCode();

        (await _client.PostAsJsonAsync(
            "/api/money/payments",
            new { amountInput = "10", paidBy = u2, receivedBy = u1 })).EnsureSuccessStatusCode();

        var summary = await _client.GetFromJsonAsync<JsonElement>(
            $"/api/money/summary?user1={u1}&user2={u2}");
        Assert.Equal(JsonValueKind.Object, summary.ValueKind);
    }

    private async Task ExerciseBudgetAsync()
    {
        var catRes = await _client.PostAsJsonAsync(
            $"/api/budget/categories?actorUserId={Actor}",
            new { name = "SystemsCat", visibility = "household" });
        catRes.EnsureSuccessStatusCode();
        var catId = (await catRes.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];

        var acctA = await CreateBudgetAccountAsync("SystemsAcctA");
        var acctB = await CreateBudgetAccountAsync("SystemsAcctB");

        var txRes = await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "75",
                categoryId = catId,
                spentByUserId = Actor,
                transactionDate = "2026-07-01",
                accountId = acctA,
            });
        txRes.EnsureSuccessStatusCode();
        var txId = (await txRes.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];

        (await _client.PatchAsJsonAsync(
            $"/api/budget/transactions/{txId}?actorUserId={Actor}",
            new { accountId = acctB })).EnsureSuccessStatusCode();

        await _client.PutAsJsonAsync(
            $"/api/budget/envelopes?actorUserId={Actor}",
            new { month = "2026-07", categoryId = catId, targetAmount = 500 });

        var month = await _client.GetFromJsonAsync<JsonElement>("/api/budget/summary/month?month=2026-07");
        Assert.True(month.TryGetProperty("totalExpenses", out _));
        Assert.True(month.TryGetProperty("net", out _));

        var billRes = await _client.PostAsJsonAsync(
            $"/api/budget/bills?actorUserId={Actor}",
            new
            {
                name = "SystemsBill",
                amountEstimate = 80,
                dueDay = 15,
                categoryId = catId,
                createCalendarReminder = true,
            });
        billRes.EnsureSuccessStatusCode();
        var billBody = await billRes.Content.ReadFromJsonAsync<JsonElement>();
        var billId = billBody.GetProperty("id").GetInt32();
        Assert.True(
            billBody.TryGetProperty("calendarItemId", out var calProp) &&
            calProp.ValueKind == JsonValueKind.Number &&
            calProp.GetInt32() > 0);

        (await _client.PostAsJsonAsync(
            $"/api/budget/goals?actorUserId={Actor}",
            new { name = "Emergency", targetAmount = 1000 })).EnsureSuccessStatusCode();

        var notifications = await _client.GetFromJsonAsync<JsonElement>("/api/budget/notifications");
        Assert.Equal(JsonValueKind.Array, notifications.ValueKind);

        (await _client.PatchAsJsonAsync(
            $"/api/budget/accounts/{acctA}?actorUserId={Actor}",
            new { isActive = false })).EnsureSuccessStatusCode();

        var activeAccounts = await _client.GetFromJsonAsync<JsonElement>("/api/budget/accounts");
        Assert.DoesNotContain(
            activeAccounts.EnumerateArray(),
            a => a.GetProperty("id").GetInt32() == acctA);

        var trends = await _client.GetFromJsonAsync<JsonElement>("/api/budget/trends?months=3");
        Assert.Equal(JsonValueKind.Array, trends.ValueKind);
    }

    private async Task ExerciseCalendarAsync()
    {
        var post = await _client.PostAsJsonAsync(
            "/api/calendar/items",
            new
            {
                title = "SystemsEvent",
                start = "2026-07-10 14:00",
                end = "2026-07-10 15:00",
                allDay = false,
                recurrence = "daily",
                timezone = "UTC",
            });
        post.EnsureSuccessStatusCode();

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/calendar/items?page=0");
        var id = FindCalendarId(list, "SystemsEvent");
        Assert.NotEqual(0, id);

        var today = await _client.GetFromJsonAsync<JsonElement>("/api/calendar/today?page=0");
        Assert.True(today.TryGetProperty("items", out var todayItems));
        Assert.Equal(JsonValueKind.Array, todayItems.ValueKind);

        var upcoming = await _client.GetFromJsonAsync<JsonElement>("/api/calendar/upcoming?page=0");
        Assert.True(upcoming.TryGetProperty("items", out _));

        var rangeRes = await _client.GetAsync(
            "/api/calendar/range?from=2026-07-08&to=2026-07-15&timeZone=UTC");
        rangeRes.EnsureSuccessStatusCode();
        using (var rangeDoc = JsonDocument.Parse(await rangeRes.Content.ReadAsStringAsync()))
        {
            var hits = rangeDoc.RootElement.EnumerateArray()
                .Where(r => r.GetProperty("id").GetInt32() == id)
                .ToList();
            Assert.NotEmpty(hits);

            var instanceKey = hits[0].GetProperty("instanceStartUtc").GetString();
            Assert.False(string.IsNullOrWhiteSpace(instanceKey));

            (await _client.PostAsJsonAsync(
                $"/api/calendar/items/{id}/omit-instance?actorUserId={Actor}",
                new { instanceStartUtc = instanceKey })).EnsureSuccessStatusCode();

            var range2 = await _client.GetAsync(
                "/api/calendar/range?from=2026-07-08&to=2026-07-15&timeZone=UTC");
            range2.EnsureSuccessStatusCode();
            using var rangeDoc2 = JsonDocument.Parse(await range2.Content.ReadAsStringAsync());
            Assert.DoesNotContain(
                rangeDoc2.RootElement.EnumerateArray(),
                r => r.GetProperty("id").GetInt32() == id &&
                     r.GetProperty("instanceStartUtc").GetString() == instanceKey);
        }

        var ics = await _client.GetAsync(
            "/api/calendar/export.ics?from=2026-07-01&to=2026-07-31&timeZone=UTC");
        Assert.Equal(HttpStatusCode.OK, ics.StatusCode);
        var icsBody = await ics.Content.ReadAsStringAsync();
        Assert.Contains("BEGIN:VCALENDAR", icsBody, StringComparison.Ordinal);
        Assert.Contains("SystemsEvent", icsBody, StringComparison.Ordinal);

        (await _client.DeleteAsync($"/api/calendar/items/{id}?actorUserId={Actor}")).EnsureSuccessStatusCode();
    }

    private async Task<int> CreateBudgetAccountAsync(string name)
    {
        var res = await _client.PostAsJsonAsync(
            $"/api/budget/accounts?actorUserId={Actor}",
            new { name, accountType = "checking" });
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];
    }

    private static int FindBuyId(JsonElement list, string name)
    {
        foreach (var el in list.GetProperty("items").EnumerateArray())
        {
            if (el.GetProperty("name").GetString() == name)
                return el.GetProperty("id").GetInt32();
        }

        return 0;
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

    private static int FindMoneyId(JsonElement list, string name)
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

    public void Dispose() => _host.Dispose();
}
