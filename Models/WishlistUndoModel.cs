/// <summary>
/// Serialized payload used to restore a deleted wishlist item.
/// </summary>
public class WishlistUndoModel
{
    public string Name { get; set; } = "";
    public ulong Owner { get; set; }
    public string Price { get; set; } = "";
    public string Link { get; set; } = "";
    public string Description { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Priority { get; set; } = "";
    public string Tags { get; set; } = "";
}