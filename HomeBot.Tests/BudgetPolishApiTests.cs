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
/// HTTP tests for budget polish: accounts, transfers, category/transaction patch, envelopes,
/// bills, recurring, trends, tax summary, CSV export, income plan.
/// </summary>
public sealed class BudgetPolishApiTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly WebApplication _app;
    private readonly HttpClient _client;
    private const string TestToken = "budget-polish-token";
    private const ulong Actor = 250_001;

    public BudgetPolishApiTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_budget_polish_api_{Guid.NewGuid():N}.db");
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);

        var sc = new ServiceCollection();
        sc.AddHomeBotApiTestServices(_dbPath);
        _services = sc.BuildServiceProvider();

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
    public async Task Accounts_and_transfer_update_balances()
    {
        var chkRes = await _client.PostAsJsonAsync(
            $"/api/budget/accounts?actorUserId={Actor}",
            new { name = "Checking", accountType = "checking" });
        Assert.Equal(HttpStatusCode.Created, chkRes.StatusCode);
        var chkId = (await chkRes.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];

        var savRes = await _client.PostAsJsonAsync(
            $"/api/budget/accounts?actorUserId={Actor}",
            new { name = "Savings", accountType = "savings" });
        var savId = (await savRes.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];

        var xfer = await _client.PostAsJsonAsync(
            $"/api/budget/transfers?actorUserId={Actor}",
            new
            {
                amountInput = "50",
                fromAccountId = chkId,
                toAccountId = savId,
                transactionDate = "2026-03-10",
            });
        Assert.Equal(HttpStatusCode.Created, xfer.StatusCode);

        var accounts = await _client.GetFromJsonAsync<JsonElement>("/api/budget/accounts");
        double Bal(int id)
        {
            foreach (var a in accounts.EnumerateArray())
            {
                if (a.GetProperty("id").GetInt32() == id)
                    return a.GetProperty("currentBalance").GetDouble();
            }

            throw new InvalidOperationException($"account {id} missing");
        }

        Assert.Equal(-50, Bal(chkId));
        Assert.Equal(50, Bal(savId));
    }

    [Fact]
    public async Task Category_patch_and_delete()
    {
        var post = await _client.PostAsJsonAsync(
            $"/api/budget/categories?actorUserId={Actor}",
            new { name = "TempCat", visibility = "household" });
        var catId = (await post.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];

        var patch = await _client.PatchAsJsonAsync(
            $"/api/budget/categories/{catId}?actorUserId={Actor}",
            new { name = "RenamedCat", visibility = "personal", isTaxDeductible = true });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);

        var cats = await _client.GetFromJsonAsync<JsonElement>("/api/budget/categories");
        var row = cats.EnumerateArray().First(c => c.GetProperty("id").GetInt32() == catId);
        Assert.Equal("RenamedCat", row.GetProperty("name").GetString());
        Assert.True(row.GetProperty("isTaxDeductible").GetBoolean());

        var del = await _client.DeleteAsync($"/api/budget/categories/{catId}?actorUserId={Actor}");
        Assert.Equal(HttpStatusCode.OK, del.StatusCode);

        cats = await _client.GetFromJsonAsync<JsonElement>("/api/budget/categories");
        Assert.DoesNotContain(cats.EnumerateArray(), c => c.GetProperty("id").GetInt32() == catId);
    }

    [Fact]
    public async Task Transaction_patch_updates_date_spender_and_tags()
    {
        var catId = await CreateCategoryAsync("Food");
        var post = await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "10",
                categoryId = catId,
                spentByUserId = Actor.ToString(),
                transactionDate = "2026-01-05",
                tags = new[] { "groceries" },
            });
        var txId = (await post.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];

        var other = Actor + 2;
        var patch = await _client.PatchAsJsonAsync(
            $"/api/budget/transactions/{txId}?actorUserId={Actor}",
            new
            {
                amountInput = "14",
                categoryId = catId,
                spentByUserId = other.ToString(),
                transactionDate = "2026-02-20",
                note = "lunch",
                tags = new[] { "dining" },
            });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/budget/transactions?month=2026-02&page=0");
        var row = list.GetProperty("items").EnumerateArray().First(t => t.GetProperty("id").GetInt32() == txId);
        Assert.Equal(14, row.GetProperty("amount").GetDouble());
        Assert.Equal(other, row.GetProperty("spentByUserId").GetUInt64());
        Assert.Equal("2026-02-20", row.GetProperty("transactionDate").GetString());
        Assert.Contains("dining", row.GetProperty("tags").EnumerateArray().Select(t => t.GetString()));
    }

    [Fact]
    public async Task Envelope_put_and_get()
    {
        var catId = await CreateCategoryAsync("Rent");
        var put = await _client.PutAsJsonAsync(
            $"/api/budget/envelopes?actorUserId={Actor}",
            new { month = "2026-05", categoryId = catId, targetAmount = 1200 });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var envs = await _client.GetFromJsonAsync<JsonElement>("/api/budget/envelopes?month=2026-05");
        var env = envs.EnumerateArray().First(e => e.GetProperty("categoryId").GetInt32() == catId);
        Assert.Equal(1200, env.GetProperty("targetAmount").GetDouble());
    }

    [Fact]
    public async Task Bill_create_patch_and_pay()
    {
        var catId = await CreateCategoryAsync("Utilities");
        var billPost = await _client.PostAsJsonAsync(
            $"/api/budget/bills?actorUserId={Actor}",
            new { name = "Water", amountEstimate = 40, dueDay = 10, categoryId = catId });
        var billBody = await billPost.Content.ReadFromJsonAsync<JsonElement>();
        var billId = billBody.GetProperty("id").GetInt32();

        var patch = await _client.PatchAsJsonAsync(
            $"/api/budget/bills/{billId}?actorUserId={Actor}",
            new { name = "Water bill", amountEstimate = 45, dueDay = 12 });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);

        var pay = await _client.PostAsJsonAsync(
            $"/api/budget/bills/{billId}/pay?actorUserId={Actor}",
            new { amountInput = "44.99", spentByUserId = Actor.ToString() });
        Assert.Equal(HttpStatusCode.OK, pay.StatusCode);
        var payBody = await pay.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(payBody.GetProperty("transactionId").GetInt32() > 0);
    }

    [Fact]
    public async Task Recurring_create_and_patch()
    {
        var catId = await CreateCategoryAsync("Sub");
        var post = await _client.PostAsJsonAsync(
            $"/api/budget/recurring?actorUserId={Actor}",
            new
            {
                amountInput = "9.99",
                categoryId = catId,
                spentByUserId = Actor.ToString(),
                cadence = "monthly",
                nextRunDate = "2026-06-01",
            });
        var recId = (await post.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["id"];

        var patch = await _client.PatchAsJsonAsync(
            $"/api/budget/recurring/{recId}?actorUserId={Actor}",
            new { amountInput = "12.99", note = "streaming" });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/budget/recurring");
        var row = list.EnumerateArray().First(r => r.GetProperty("id").GetInt32() == recId);
        Assert.Equal(12.99, row.GetProperty("amount").GetDouble());
        Assert.Equal("streaming", row.GetProperty("note").GetString());
    }

    [Fact]
    public async Task Income_plan_goals_trends_and_tax_summary()
    {
        var put = await _client.PutAsJsonAsync(
            $"/api/budget/income-plan?actorUserId={Actor}",
            new { month = "2026-07", plannedAmount = 5000 });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var plan = await _client.GetFromJsonAsync<JsonElement>("/api/budget/income-plan?month=2026-07");
        Assert.Equal(5000, plan.GetProperty("plannedAmount").GetDouble());

        var goal = await _client.PostAsJsonAsync(
            $"/api/budget/goals?actorUserId={Actor}",
            new { name = "Vacation", targetAmount = 2000, currentAmount = 100 });
        Assert.Equal(HttpStatusCode.Created, goal.StatusCode);

        var trends = await _client.GetAsync("/api/budget/trends?months=3&groupBy=category");
        trends.EnsureSuccessStatusCode();

        var tax = await _client.GetFromJsonAsync<JsonElement>("/api/budget/tax-summary?year=2026");
        Assert.Equal(JsonValueKind.Array, tax.ValueKind);
    }

    [Fact]
    public async Task Export_csv_respects_from_and_to()
    {
        var catId = await CreateCategoryAsync("ExportCat");
        await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "5",
                categoryId = catId,
                spentByUserId = Actor.ToString(),
                transactionDate = "2026-03-01",
            });
        await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "7",
                categoryId = catId,
                spentByUserId = Actor.ToString(),
                transactionDate = "2026-04-01",
            });

        var csvRes = await _client.GetAsync("/api/budget/export.csv?from=2026-03-01&to=2026-03-31");
        csvRes.EnsureSuccessStatusCode();
        var csv = await csvRes.Content.ReadAsStringAsync();
        Assert.Contains("ExportCat", csv);
        Assert.DoesNotContain("2026-04-01", csv);
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
