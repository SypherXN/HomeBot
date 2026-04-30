/// <summary>
/// Transport-agnostic representation of one wishlist list row.
/// </summary>
public class WishlistListItemModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public ulong Owner { get; set; }
    public string Price { get; set; } = "";
    public string Link { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Priority { get; set; } = "";
    public List<string> Tags { get; set; } = new();
    public ulong? PurchasedBy { get; set; }
}
