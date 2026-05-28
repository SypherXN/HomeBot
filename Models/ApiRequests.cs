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
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? AssignedTo { get; set; }
    public string? Tags { get; set; }
    public string? Notes { get; set; }
}

public sealed class BuyItemUpdateRequest
{
    public string? Name { get; set; }
    public string? Quantity { get; set; }
    public string? Store { get; set; }
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? AssignedTo { get; set; }
    public string? Tags { get; set; }
    public string? Notes { get; set; }
}

public sealed class WishlistItemCreateRequest
{
    public string Name { get; set; } = "";
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
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
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
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

/// <summary>POST omit-instance / complete-instance: canonical occurrence start (range <c>instanceStartUtc</c>).</summary>
public sealed class CalendarInstanceOmitRequest
{
    public string InstanceStartUtc { get; set; } = "";
}

/// <summary>Per-instance PATCH on a recurring series occurrence.</summary>
public sealed class CalendarInstancePatchRequest
{
    public string InstanceStartUtc { get; set; } = "";
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public string? Link { get; set; }
    /// <summary>UTC ISO occurrence start override (e.g. move this day only).</summary>
    public string? OverrideInstanceStartUtc { get; set; }
    /// <summary>UTC ISO occurrence end override.</summary>
    public string? OverrideInstanceEndUtc { get; set; }
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

public sealed class BudgetCategoryCreateRequest
{
    public string Name { get; set; } = "";
    public string? Color { get; set; }
    public string? Icon { get; set; }
    public string? Visibility { get; set; }
    public bool IsTaxDeductible { get; set; }
}

public sealed class BudgetCategoryUpdateRequest
{
    public string Name { get; set; } = "";
    public string? Color { get; set; }
    public string? Icon { get; set; }
    public string? Visibility { get; set; }
    public bool IsTaxDeductible { get; set; }
}

public sealed class BudgetTransactionCreateRequest
{
    public string? Type { get; set; }
    public string AmountInput { get; set; } = "";
    public int? CategoryId { get; set; }
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong SpentByUserId { get; set; }
    public string? TransactionDate { get; set; }
    public string? Note { get; set; }
    public string? Merchant { get; set; }
    public int? AccountId { get; set; }
    public bool IsPending { get; set; }
    public string? Currency { get; set; }
    public double ExchangeRateToHome { get; set; } = 1;
    public List<BudgetTransactionSplitModel>? Splits { get; set; }
    public List<string>? Tags { get; set; }
}

public sealed class BudgetTransactionUpdateRequest
{
    public string? AmountInput { get; set; }
    public int? CategoryId { get; set; }
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? SpentByUserId { get; set; }
    public string? TransactionDate { get; set; }
    public string? Note { get; set; }
    public string? Merchant { get; set; }
    public bool? IsPending { get; set; }
    public string? ClearedAt { get; set; }
    public List<BudgetTransactionSplitModel>? Splits { get; set; }
    public List<string>? Tags { get; set; }
}

public sealed class BudgetTransferCreateRequest
{
    public string AmountInput { get; set; } = "";
    public int FromAccountId { get; set; }
    public int ToAccountId { get; set; }
    public string? TransactionDate { get; set; }
    public string? Note { get; set; }
}

public sealed class BudgetEnvelopeSetRequest
{
    public string Month { get; set; } = "";
    public int CategoryId { get; set; }
    public double TargetAmount { get; set; }
}

public sealed class BudgetGoalCreateRequest
{
    public string Name { get; set; } = "";
    public double TargetAmount { get; set; }
    public double CurrentAmount { get; set; }
    public string? TargetDate { get; set; }
    public int? CategoryId { get; set; }
}

public sealed class BudgetGoalUpdateRequest
{
    public string? Name { get; set; }
    public double? TargetAmount { get; set; }
    public double? CurrentAmount { get; set; }
    public string? TargetDate { get; set; }
    public int? CategoryId { get; set; }
}

public sealed class BudgetIncomePlanSetRequest
{
    public string Month { get; set; } = "";
    public double PlannedAmount { get; set; }
}

public sealed class BudgetRecurringCreateRequest
{
    public string AmountInput { get; set; } = "";
    public int? CategoryId { get; set; }
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong SpentByUserId { get; set; }
    public string? Cadence { get; set; }
    public string? NextRunDate { get; set; }
    public string? Type { get; set; }
    public string? Note { get; set; }
    public string? Merchant { get; set; }
    public int? AccountId { get; set; }
}

public sealed class BudgetBillCreateRequest
{
    public string Name { get; set; } = "";
    public double AmountEstimate { get; set; }
    public int DueDay { get; set; } = 1;
    public int? CategoryId { get; set; }
    public int? CalendarItemId { get; set; }
}

public sealed class BudgetBillUpdateRequest
{
    public string? Name { get; set; }
    public double? AmountEstimate { get; set; }
    public int? DueDay { get; set; }
    public int? CategoryId { get; set; }
    public bool? IsActive { get; set; }
}

public sealed class BudgetBillPayRequest
{
    public string AmountInput { get; set; } = "";
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong SpentByUserId { get; set; }
}

public sealed class BudgetRecurringUpdateRequest
{
    public string? AmountInput { get; set; }
    public int? CategoryId { get; set; }
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? SpentByUserId { get; set; }
    public string? Cadence { get; set; }
    public string? NextRunDate { get; set; }
    public string? Type { get; set; }
    public string? Note { get; set; }
    public string? Merchant { get; set; }
    public bool? IsActive { get; set; }
}

public sealed class BudgetAccountCreateRequest
{
    public string Name { get; set; } = "";
    public string? AccountType { get; set; }
    public string? Currency { get; set; }
    public double? CreditLimit { get; set; }
}

public sealed class BudgetExchangeRateSetRequest
{
    public string FromCurrency { get; set; } = "";
    public string ToCurrency { get; set; } = "";
    public double Rate { get; set; }
    public string? EffectiveDate { get; set; }
}
