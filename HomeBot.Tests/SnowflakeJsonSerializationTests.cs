using System.Text.Json;
using Xunit;

namespace HomeBot.Tests;

/// <summary>
/// Ensures Discord snowflakes (ulong) serialize as JSON digit strings so JavaScript clients never
/// see IEEE-754 rounded numbers. Undo payloads and list DTOs rely on <see cref="SnowflakeUlongJsonConverter"/>.
/// </summary>
public sealed class SnowflakeJsonSerializationTests
{
    /// <summary>Greater than <c>Number.MAX_SAFE_INTEGER</c> (9007199254740991).</summary>
    private const ulong LargeSnowflake = 9_007_199_254_740_993UL;

    [Fact]
    public void BuyUndoModel_writes_assigned_to_as_json_string()
    {
        var model = new BuyUndoModel
        {
            Name = "milk",
            Quantity = "1",
            Store = "",
            AssignedTo = LargeSnowflake,
            Tags = "",
            Notes = "",
            CreatedBy = null,
            PurchasedBy = null,
            Status = "active",
        };

        var json = JsonSerializer.Serialize(model);
        Assert.Contains($"\"AssignedTo\":\"{LargeSnowflake}\"", json);
    }

    [Fact]
    public void BuyUndoModel_round_trips_string_and_legacy_number_form()
    {
        var json = $$"""{"Name":"","Quantity":"1","Store":"","AssignedTo":"{{LargeSnowflake}}","Tags":"","Notes":"","CreatedBy":null,"PurchasedBy":null,"Status":"active"}""";
        var a = JsonSerializer.Deserialize<BuyUndoModel>(json);
        Assert.Equal(LargeSnowflake, a!.AssignedTo);

        var jsonNum = $$"""{"Name":"","Quantity":"1","Store":"","AssignedTo":{{LargeSnowflake}},"Tags":"","Notes":"","CreatedBy":null,"PurchasedBy":null,"Status":"active"}""";
        var b = JsonSerializer.Deserialize<BuyUndoModel>(jsonNum);
        Assert.Equal(LargeSnowflake, b!.AssignedTo);
    }

    [Fact]
    public void MoneyUndoModel_writes_paid_by_and_owed_by_as_strings()
    {
        var model = new MoneyUndoModel
        {
            Name = "x",
            Description = "",
            Notes = "",
            Amount = 1,
            AmountInput = "1",
            PaidBy = LargeSnowflake,
            OwedBy = LargeSnowflake + 1,
            Type = "expense",
        };

        var json = JsonSerializer.Serialize(model);
        Assert.Contains($"\"PaidBy\":\"{LargeSnowflake}\"", json);
        Assert.Contains($"\"OwedBy\":\"{LargeSnowflake + 1}\"", json);
    }

    [Fact]
    public void WishlistUndoModel_writes_owner_as_string()
    {
        var model = new WishlistUndoModel
        {
            Name = "book",
            Owner = LargeSnowflake,
            Price = "",
            Link = "",
            Description = "",
            Notes = "",
            Priority = "",
            Tags = "",
            PurchasedBy = null,
            Status = "active",
        };

        var json = JsonSerializer.Serialize(model);
        Assert.Contains($"\"Owner\":\"{LargeSnowflake}\"", json);
    }

    [Fact]
    public void CalendarDeleteUndoModel_writes_assigned_as_string_or_null()
    {
        var with = new CalendarDeleteUndoModel
        {
            Title = "t",
            Type = "task",
            Start = "",
            End = "",
            AllDay = 0,
            Assigned = LargeSnowflake,
            Description = "",
            Notes = "",
            Link = "",
            ReminderOffset = "",
            Recurrence = "",
            Timezone = "",
            Status = "active",
        };

        Assert.Contains($"\"Assigned\":\"{LargeSnowflake}\"", JsonSerializer.Serialize(with));

        var none = new CalendarDeleteUndoModel
        {
            Title = "t",
            Type = "task",
            Start = "",
            End = "",
            AllDay = 0,
            Assigned = null,
            Description = "",
            Notes = "",
            Link = "",
            ReminderOffset = "",
            Recurrence = "",
            Timezone = "",
            Status = "active",
        };
        Assert.Contains("\"Assigned\":null", JsonSerializer.Serialize(none));
    }
}
