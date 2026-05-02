using System.Text.Json.Serialization;

/// <summary>
/// JSON bodies for HomeBot REST API (Phase 2). Use query <c>actorUserId</c> (non-zero Discord snowflake) where the API docs require it.
/// </summary>
/// <summary>PUT /api/buy/tags — replaces the allowed buy-tag vocabulary (comma list in Settings).</summary>
public sealed class BuyTagCatalogPutRequest
{
    public List<string>? Tags { get; set; }
}

/// <summary>PUT /api/wishlist/tags — replaces allowed wishlist tag tokens.</summary>
public sealed class WishlistTagCatalogPutRequest
{
    public List<string>? Tags { get; set; }
}

public sealed class BuyItemCreateRequest
{
    public string Name { get; set; } = "";
    public string? Quantity { get; set; }
    public string? Store { get; set; }
    public ulong? AssignedTo { get; set; }
    public string? Tags { get; set; }
    public string? Notes { get; set; }
}

public sealed class BuyItemUpdateRequest
{
    public string? Name { get; set; }
    public string? Quantity { get; set; }
    public string? Store { get; set; }
    public ulong? AssignedTo { get; set; }
    public string? Tags { get; set; }
    public string? Notes { get; set; }
}

public sealed class WishlistItemCreateRequest
{
    public string Name { get; set; } = "";
    public ulong? OwnerUserId { get; set; }
    public string? Price { get; set; }
    public string? Link { get; set; }
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public string? Priority { get; set; }
    public string? Tags { get; set; }
}

public sealed class WishlistItemUpdateRequest
{
    public string? Name { get; set; }
    public ulong? OwnerUserId { get; set; }
    public string? Price { get; set; }
    public string? Link { get; set; }
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public string? Priority { get; set; }
    public string? Tags { get; set; }
}

public sealed class MoneyExpenseCreateRequest
{
    public string Name { get; set; } = "";
    public string AmountInput { get; set; } = "";
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong PaidBy { get; set; }
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong OwedBy { get; set; }
}

public sealed class MoneyExpenseSplitCreateRequest
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public string AmountInput { get; set; } = "";
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong PaidBy { get; set; }
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong OwedBy { get; set; }
    public int Percent { get; set; } = 50;
}

public sealed class MoneyPaymentCreateRequest
{
    public string AmountInput { get; set; } = "";
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong PaidBy { get; set; }
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong ReceivedBy { get; set; }
}

public sealed class MoneyTransactionPatchRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public string? AmountInput { get; set; }
}

public sealed class CalendarItemCreateRequest
{
    public string Title { get; set; } = "";
    public string? Start { get; set; }
    public string? End { get; set; }
    public bool AllDay { get; set; }
    public string? Reminder { get; set; }
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? AssignedToUserId { get; set; }
    public bool AssignToEveryone { get; set; }
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public string? Link { get; set; }
    public string? Recurrence { get; set; }
    /// <summary>Optional IANA or Windows id; wall times in <see cref="Start"/>/<see cref="End"/> are interpreted in this zone. Defaults to household Settings timezone.</summary>
    public string? Timezone { get; set; }
}

public sealed class CalendarItemPatchRequest
{
    public string? Title { get; set; }
    public string? Start { get; set; }
    public string? End { get; set; }
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public string? Link { get; set; }
    public string? Timezone { get; set; }
}
