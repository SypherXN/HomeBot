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
/// HTTP tests for Tier 1 polish: budget undo, account on tx, bill calendar, Discord notify, money edit fields.
/// </summary>
public sealed class Tier1FeatureApiTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly CapturingDiscordNotifier _notifier;
    private readonly WebApplication _app;
    private readonly HttpClient _client;
    private const string TestToken = "tier1-feature-token";
    private const ulong Actor = 260_001;

    public Tier1FeatureApiTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_tier1_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        _notifier = new CapturingDiscordNotifier();

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
        sc.AddSingleton<IDiscordChannelNotifier>(_notifier);
        sc.AddSingleton<DiscordAuthAuditNotifier>();
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
    public async Task Budget_transaction_create_notifies_budget_channel()
    {
        _notifier.Clear();
        var catId = await CreateCategoryAsync("NotifyCat");

        var post = await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "12",
                categoryId = catId,
                spentByUserId = Actor.ToString(),
                transactionDate = "2026-06-01",
            });
        Assert.Equal(HttpStatusCode.Created, post.StatusCode);

        var budgetMsgs = _notifier.Messages.Where(m => m.Feature == "budget").ToList();
        Assert.NotEmpty(budgetMsgs);
        Assert.Contains(budgetMsgs, m => m.Message.Contains("NotifyCat", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(budgetMsgs, m => m.Message.Contains("via web", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Budget_transaction_create_undo_via_api_removes_row()
    {
        var catId = await CreateCategoryAsync("UndoCat");
        var post = await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "9",
                categoryId = catId,
                spentByUserId = Actor.ToString(),
                transactionDate = "2026-06-10",
            });
        var txId = (await post.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];

        var listBefore = await _client.GetFromJsonAsync<JsonElement>("/api/budget/transactions?month=2026-06&page=0");
        Assert.Contains(
            listBefore.GetProperty("items").EnumerateArray(),
            t => t.GetProperty("id").GetInt32() == txId);

        var undo = await _client.PostAsync($"/api/undo?actorUserId={Actor}", null);
        undo.EnsureSuccessStatusCode();
        var undoBody = await undo.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(undoBody.GetProperty("undone").GetBoolean());

        var listAfter = await _client.GetFromJsonAsync<JsonElement>("/api/budget/transactions?month=2026-06&page=0");
        Assert.DoesNotContain(
            listAfter.GetProperty("items").EnumerateArray(),
            t => t.GetProperty("id").GetInt32() == txId);
    }

    [Fact]
    public async Task Budget_transaction_with_accountId_uses_account()
    {
        _notifier.Clear();
        var accRes = await _client.PostAsJsonAsync(
            $"/api/budget/accounts?actorUserId={Actor}",
            new { name = "Wallet", accountType = "checking" });
        var accId = (await accRes.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];
        var catId = await CreateCategoryAsync("AcctCat");

        var post = await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "5",
                categoryId = catId,
                spentByUserId = Actor.ToString(),
                accountId = accId,
                transactionDate = "2026-06-05",
            });
        post.EnsureSuccessStatusCode();

        var accounts = await _client.GetFromJsonAsync<JsonElement>("/api/budget/accounts");
        var wallet = accounts.EnumerateArray().First(a => a.GetProperty("id").GetInt32() == accId);
        Assert.Equal(-5, wallet.GetProperty("currentBalance").GetDouble());
    }

    [Fact]
    public async Task Budget_bill_create_with_calendar_reminder_links_calendar()
    {
        _notifier.Clear();
        var post = await _client.PostAsJsonAsync(
            $"/api/budget/bills?actorUserId={Actor}",
            new
            {
                name = "RentTier1",
                amountEstimate = 1200,
                dueDay = 5,
                createCalendarReminder = true,
            });
        Assert.Equal(HttpStatusCode.Created, post.StatusCode);
        var body = await post.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.TryGetProperty("calendarItemId", out var calProp));
        Assert.True(calProp.ValueKind == JsonValueKind.Number);
        Assert.True(calProp.GetInt32() > 0);

        var bills = await _client.GetFromJsonAsync<JsonElement>("/api/budget/bills");
        var bill = bills.EnumerateArray().First(b => b.GetProperty("name").GetString() == "RentTier1");
        Assert.Equal(calProp.GetInt32(), bill.GetProperty("calendarItemId").GetInt32());

        var calList = await _client.GetFromJsonAsync<JsonElement>("/api/calendar/items?page=0");
        var found = calList.GetProperty("items").EnumerateArray()
            .Any(i => i.GetProperty("title").GetString()?.Contains("RentTier1", StringComparison.Ordinal) == true);
        Assert.True(found);

        Assert.Contains(_notifier.Messages, m => m.Feature == "budget" && m.Message.Contains("RentTier1"));
    }

    [Fact]
    public async Task Budget_bill_calendar_reminder_endpoint_rejects_duplicate()
    {
        var create = await _client.PostAsJsonAsync(
            $"/api/budget/bills?actorUserId={Actor}",
            new { name = "Power", amountEstimate = 80, dueDay = 12, createCalendarReminder = true });
        create.EnsureSuccessStatusCode();
        var billId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var again = await _client.PostAsync(
            $"/api/budget/bills/{billId}/calendar-reminder?actorUserId={Actor}",
            null);
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
    }

    [Fact]
    public async Task Budget_bill_calendar_reminder_endpoint_links_unlinked_bill()
    {
        _notifier.Clear();
        var create = await _client.PostAsJsonAsync(
            $"/api/budget/bills?actorUserId={Actor}",
            new { name = "Internet", amountEstimate = 60, dueDay = 20 });
        var billId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var link = await _client.PostAsync(
            $"/api/budget/bills/{billId}/calendar-reminder?actorUserId={Actor}",
            null);
        link.EnsureSuccessStatusCode();
        var linkBody = await link.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(linkBody.GetProperty("calendarItemId").GetInt32() > 0);

        Assert.Contains(_notifier.Messages, m => m.Feature == "calendar");
    }

    [Fact]
    public async Task Budget_envelopes_can_be_copied_via_sequential_puts()
    {
        var catId = await CreateCategoryAsync("EnvCat");
        await _client.PutAsJsonAsync(
            $"/api/budget/envelopes?actorUserId={Actor}",
            new { month = "2026-04", categoryId = catId, targetAmount = 400 });
        await _client.PutAsJsonAsync(
            $"/api/budget/envelopes?actorUserId={Actor}",
            new { month = "2026-05", categoryId = catId, targetAmount = 450 });

        var prev = await _client.GetFromJsonAsync<JsonElement>("/api/budget/envelopes?month=2026-05");
        var prevTarget = prev.EnumerateArray().First(e => e.GetProperty("categoryId").GetInt32() == catId)
            .GetProperty("targetAmount").GetDouble();

        await _client.PutAsJsonAsync(
            $"/api/budget/envelopes?actorUserId={Actor}",
            new { month = "2026-06", categoryId = catId, targetAmount = prevTarget });

        var june = await _client.GetFromJsonAsync<JsonElement>("/api/budget/envelopes?month=2026-06");
        var juneEnv = june.EnumerateArray().First(e => e.GetProperty("categoryId").GetInt32() == catId);
        Assert.Equal(450, juneEnv.GetProperty("targetAmount").GetDouble());
    }

    [Fact]
    public async Task Money_split_list_includes_description_and_notes()
    {
        ulong u1 = Actor;
        ulong u2 = Actor + 1;

        var post = await _client.PostAsJsonAsync(
            "/api/money/expenses/split",
            new
            {
                name = "Tier1Split",
                description = "dinner out",
                notes = "receipt saved",
                amountInput = "40",
                paidBy = u1,
                owedBy = u2,
                percent = 50,
            });
        post.EnsureSuccessStatusCode();

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/money/transactions?page=0");
        var row = list.GetProperty("items").EnumerateArray()
            .First(i => i.GetProperty("name").GetString() == "Tier1Split");
        Assert.Equal("dinner out", row.GetProperty("description").GetString());
        Assert.Equal("receipt saved", row.GetProperty("notes").GetString());
    }

    [Fact]
    public async Task Money_patch_updates_description_and_amount()
    {
        ulong u1 = Actor;
        ulong u2 = Actor + 2;

        await _client.PostAsJsonAsync(
            "/api/money/expenses/split",
            new
            {
                name = "Tier1Patch",
                description = "before",
                amountInput = "30",
                paidBy = u1,
                owedBy = u2,
                percent = 50,
            });

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/money/transactions?page=0");
        int id = 0;
        foreach (var el in list.GetProperty("items").EnumerateArray())
        {
            if (el.GetProperty("name").GetString() == "Tier1Patch")
            {
                id = el.GetProperty("id").GetInt32();
                break;
            }
        }

        Assert.NotEqual(0, id);

        var patch = await _client.PatchAsJsonAsync(
            $"/api/money/transactions/{id}",
            new { name = "Tier1PatchDone", amountInput = "35", description = "after", notes = "updated" });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);

        var list2 = await _client.GetFromJsonAsync<JsonElement>("/api/money/transactions?page=0");
        var row = list2.GetProperty("items").EnumerateArray().First(i => i.GetProperty("id").GetInt32() == id);
        Assert.Equal("Tier1PatchDone", row.GetProperty("name").GetString());
        Assert.Equal(35, row.GetProperty("amount").GetDouble());
        Assert.Equal("after", row.GetProperty("description").GetString());
        Assert.Equal("updated", row.GetProperty("notes").GetString());
    }

    [Fact]
    public async Task Budget_transfer_notifies_budget_channel()
    {
        _notifier.Clear();
        var idA = (await (await _client.PostAsJsonAsync(
            $"/api/budget/accounts?actorUserId={Actor}",
            new { name = "A", accountType = "checking" })).Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];
        var idB = (await (await _client.PostAsJsonAsync(
            $"/api/budget/accounts?actorUserId={Actor}",
            new { name = "B", accountType = "savings" })).Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];

        await _client.PostAsJsonAsync(
            $"/api/budget/transfers?actorUserId={Actor}",
            new { amountInput = "25", fromAccountId = idA, toAccountId = idB, transactionDate = "2026-06-15" });

        Assert.Contains(
            _notifier.Messages,
            m => m.Feature == "budget" && m.Message.Contains("transfer", StringComparison.OrdinalIgnoreCase));
    }

    private async Task<int> CreateCategoryAsync(string name)
    {
        var res = await _client.PostAsJsonAsync(
            $"/api/budget/categories?actorUserId={Actor}",
            new { name, visibility = "household" });
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
