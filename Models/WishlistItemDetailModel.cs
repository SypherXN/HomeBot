/// <summary>
/// Transport-agnostic detail payload for a wishlist item.
/// </summary>
public class WishlistItemDetailModel
{
    public string Name { get; set; } = "";
    public ulong Owner { get; set; }
    public string OwnerMemberLabel { get; set; } = "";
    public string Price { get; set; } = "";
    public string Link { get; set; } = "";
    public string Description { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Priority { get; set; } = "";
}
