/// <summary>
/// JSON bodies for HomeBot REST API (Phase 2). Use query <c>actorUserId</c> (non-zero Discord snowflake) where the API docs require it.
/// </summary>
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
    public ulong PaidBy { get; set; }
    public ulong OwedBy { get; set; }
}

public sealed class MoneyExpenseSplitCreateRequest
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public string AmountInput { get; set; } = "";
    public ulong PaidBy { get; set; }
    public ulong OwedBy { get; set; }
    public int Percent { get; set; } = 50;
}

public sealed class MoneyPaymentCreateRequest
{
    public string AmountInput { get; set; } = "";
    public ulong PaidBy { get; set; }
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
    public ulong? AssignedToUserId { get; set; }
    public bool AssignToEveryone { get; set; }
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public string? Link { get; set; }
    public string? Recurrence { get; set; }
}

public sealed class CalendarItemPatchRequest
{
    public string? Title { get; set; }
    public string? Start { get; set; }
    public string? End { get; set; }
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public string? Link { get; set; }
}
