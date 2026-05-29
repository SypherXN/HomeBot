using System.Text.Json.Serialization;

/// <summary>
/// Transport-agnostic representation of one wishlist list row.
/// </summary>
public class WishlistListItemModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong Owner { get; set; }
    public string OwnerMemberLabel { get; set; } = "";
    public string Price { get; set; } = "";
    public string Link { get; set; } = "";
    public string Description { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Priority { get; set; } = "";
    public List<string> Tags { get; set; } = new();
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? PurchasedBy { get; set; }
    public string? PurchasedByMemberLabel { get; set; }
}
