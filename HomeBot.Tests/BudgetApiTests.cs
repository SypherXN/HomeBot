using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HomeBot.Tests;

public sealed class BudgetApiTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly WebApplication _app;
    private readonly HttpClient _client;
    private const string TestToken = "budget-test-token";
    private const ulong Actor = 200_001;

    public BudgetApiTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_budget_test_{Guid.NewGuid():N}.db");
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
    public async Task Budget_crud_and_summaries_work()
    {
        var month = DateTime.UtcNow.ToString("yyyy-MM");

        var catRes = await _client.PostAsJsonAsync(
            $"/api/budget/categories?actorUserId={Actor}",
            new { name = "Groceries", visibility = "household" });
        Assert.Equal(HttpStatusCode.Created, catRes.StatusCode);
        var catBody = await catRes.Content.ReadFromJsonAsync<Dictionary<string, int>>();
        Assert.NotNull(catBody);
        var catId = catBody["id"];

        var txRes = await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "42.50",
                categoryId = catId,
                spentByUserId = Actor.ToString(),
                transactionDate = $"{month}-15"
            });
        Assert.Equal(HttpStatusCode.Created, txRes.StatusCode);

        var sumRes = await _client.GetAsync($"/api/budget/summary/month?month={month}");
        sumRes.EnsureSuccessStatusCode();
        var sum = await sumRes.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.NotNull(sum);

        var byCat = await _client.GetAsync($"/api/budget/summary/by-category?month={month}");
        byCat.EnsureSuccessStatusCode();

        var byUser = await _client.GetAsync($"/api/budget/summary/by-user?month={month}");
        byUser.EnsureSuccessStatusCode();

        var list = await _client.GetAsync($"/api/budget/transactions?month={month}&page=0");
        list.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Merchant_suggestions_include_all_history_and_last_known_categories()
    {
        var categoryResponse = await _client.PostAsJsonAsync(
            $"/api/budget/categories?actorUserId={Actor}",
            new { name = "Groceries", visibility = "household" });
        categoryResponse.EnsureSuccessStatusCode();
        var category = await categoryResponse.Content.ReadFromJsonAsync<Dictionary<string, int>>();
        var categoryId = category!["id"];

        async Task Add(string? merchant, int? catId, string date)
        {
            var response = await _client.PostAsJsonAsync(
                $"/api/budget/transactions?actorUserId={Actor}",
                new { type = "expense", amountInput = "1", categoryId = catId,
                    spentByUserId = Actor.ToString(), transactionDate = date, merchant });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }

        // Older months and more than a ledger page / the former 60-name cap.
        for (var i = 0; i < 65; i++)
            await Add($"Past merchant {i}", null, "2020-01-15");
        await Add(" Costco ", categoryId, "2020-02-01");
        await Add("COSTCO", null, "2020-03-01");
        await Add(" ", null, "2020-04-01");
        await Add(null, null, "2020-05-01");

        var merchants = await _client.GetFromJsonAsync<List<BudgetMerchantModel>>("/api/budget/merchants");
        Assert.NotNull(merchants);
        Assert.Equal(66, merchants.Count);
        Assert.Equal("COSTCO", merchants[0].Merchant);
        Assert.Equal(categoryId, merchants[0].CategoryId);
        Assert.Equal("Groceries", merchants[0].CategoryName);
        Assert.Contains(merchants, m => m.Merchant == "Past merchant 0");
        Assert.Contains(merchants, m => m.Merchant == "Past merchant 64");

        _client.DefaultRequestHeaders.Authorization = null;
        var unauthorized = await _client.GetAsync("/api/budget/merchants");
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);
    }

    [Fact]
    public void Schema_migrations_are_idempotent()
    {
        var path = Path.Combine(Path.GetTempPath(), $"homebot_mig_test_{Guid.NewGuid():N}.db");
        _ = new DatabaseService(path);
        _ = new DatabaseService(path);
        using (var conn = new DatabaseService(path).GetConnection())
        {
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM SchemaMigrations";
            var count = Convert.ToInt32(cmd.ExecuteScalar());
            Assert.True(count >= 2);
            cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name='BudgetCategories'";
            Assert.NotNull(cmd.ExecuteScalar());
        }

        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        if (File.Exists(path)) File.Delete(path);
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
