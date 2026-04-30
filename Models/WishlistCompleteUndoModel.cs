/// <summary>
/// Serialized payload used to undo wishlist completion status changes.
/// </summary>
public class WishlistCompleteUndoModel
{
    public string Status { get; set; } = "";
    public ulong? PurchasedBy { get; set; }
}