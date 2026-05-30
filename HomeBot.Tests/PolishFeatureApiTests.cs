using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Data.Sqlite;
using Xunit;

namespace HomeBot.Tests;

/// <summary>Polish batch: stale buy, bulk mutations, budget receipt URL.</summary>
public sealed class PolishFeatureApiTests : IDisposable
{
    private readonly string _dbPath;
    private readonly ServiceProvider _services;
    private readonly WebApplication _app;
    private readonly HttpClient _client;
    private const string TestToken = "polish-feature-token";
    private const ulong Actor = 280_001;

    public PolishFeatureApiTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"homebot_polish_{Guid.NewGuid():N}.db");
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
    public async Task Buy_stale_returns_old_active_items()
    {
        var buy = _services.GetRequiredService<BuyService>();
        buy.AddItem("Milk", "1", "", null, "", "", Actor);
        using (var conn = OpenDb())
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "UPDATE BuyItems SET CreatedAt = datetime('now', '-20 days') WHERE Name = 'Milk'";
            cmd.ExecuteNonQuery();
        }

        var res = await _client.GetAsync("/api/buy/stale?days=14&limit=5");
        res.EnsureSuccessStatusCode();
        var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var items = doc.RootElement.GetProperty("items");
        Assert.True(items.GetArrayLength() >= 1);
        Assert.Equal("Milk", items[0].GetProperty("name").GetString());
        Assert.True(items[0].TryGetProperty("createdAt", out _));
    }

    [Fact]
    public async Task Buy_bulk_complete_and_delete()
    {
        var buy = _services.GetRequiredService<BuyService>();
        buy.AddItem("A", "1", "", null, "", "", Actor);
        buy.AddItem("B", "1", "", null, "", "", Actor);
        var list = buy.GetBuyList(page: 0);
        var ids = list.Items.Select(i => i.Id).ToList();

        var complete = await _client.PostAsJsonAsync("/api/buy/items/bulk-complete", new { actorUserId = Actor.ToString(), ids });
        complete.EnsureSuccessStatusCode();
        var completeDoc = JsonDocument.Parse(await complete.Content.ReadAsStringAsync());
        Assert.Equal(2, completeDoc.RootElement.GetProperty("count").GetInt32());
        Assert.Equal(0, buy.GetBuyList(page: 0).TotalCount);

        buy.AddItem("C", "1", "", null, "", "", Actor);
        buy.AddItem("D", "1", "", null, "", "", Actor);
        ids = buy.GetBuyList(page: 0).Items.Select(i => i.Id).ToList();
        var delete = await _client.PostAsJsonAsync("/api/buy/items/bulk-delete", new { actorUserId = Actor.ToString(), ids });
        delete.EnsureSuccessStatusCode();
        Assert.Equal(0, buy.GetBuyList(page: 0).TotalCount);
    }

    [Fact]
    public async Task Budget_transaction_receipt_url_round_trip()
    {
        var catRes = await _client.PostAsJsonAsync(
            $"/api/budget/categories?actorUserId={Actor}",
            new { name = "Groceries" });
        catRes.EnsureSuccessStatusCode();
        var catId = JsonDocument.Parse(await catRes.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetInt32();

        var create = await _client.PostAsJsonAsync(
            $"/api/budget/transactions?actorUserId={Actor}",
            new
            {
                type = "expense",
                amountInput = "12.50",
                categoryId = catId,
                spentByUserId = Actor.ToString(),
                receiptUrl = "https://example.com/receipt/1",
            });
        create.EnsureSuccessStatusCode();
        var txId = JsonDocument.Parse(await create.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetInt32();

        var list = await _client.GetAsync("/api/budget/transactions?page=0");
        list.EnsureSuccessStatusCode();
        var row = JsonDocument.Parse(await list.Content.ReadAsStringAsync())
            .RootElement.GetProperty("items")
            .EnumerateArray()
            .First(e => e.GetProperty("id").GetInt32() == txId);
        Assert.Equal("https://example.com/receipt/1", row.GetProperty("receiptUrl").GetString());

        var patch = await _client.PatchAsJsonAsync(
            $"/api/budget/transactions/{txId}?actorUserId={Actor}",
            new { receiptUrl = "https://example.com/receipt/2" });
        patch.EnsureSuccessStatusCode();

        var row2 = _services.GetRequiredService<BudgetService>().GetTransactionById(txId);
        Assert.Equal("https://example.com/receipt/2", row2!.ReceiptUrl);
    }

    private SqliteConnection OpenDb()
    {
        var conn = new SqliteConnection($"Data Source={_dbPath}");
        conn.Open();
        return conn;
    }

    public void Dispose()
    {
        _client.Dispose();
        _app.DisposeAsync().AsTask().GetAwaiter().GetResult();
        _services.Dispose();
        try
        {
            if (File.Exists(_dbPath))
                File.Delete(_dbPath);
        }
        catch
        {
            /* ignore */
        }
    }
}
