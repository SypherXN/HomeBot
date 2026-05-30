using System.Text.Json.Serialization;

/// <summary>
/// Transport-agnostic representation of one buy list item.
/// </summary>
public class BuyListItemModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Quantity { get; set; } = "1";
    public string Store { get; set; } = "";
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? AssignedTo { get; set; }
    /// <summary>Neutral display label for web/API (e.g. member-…); no Discord mention syntax.</summary>
    public string? AssignedToMemberLabel { get; set; }
    public List<string> Tags { get; set; } = new();
    public string Notes { get; set; } = "";
    /// <summary>UTC timestamp when the row was created (ISO 8601 or SQLite datetime).</summary>
    public string? CreatedAt { get; set; }
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? PurchasedBy { get; set; }
    public string? PurchasedByMemberLabel { get; set; }
}
