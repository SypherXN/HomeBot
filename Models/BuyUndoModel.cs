using System.Text.Json.Serialization;

/// <summary>
/// Serialized payload used to restore deleted buy items.
/// </summary>
public class BuyUndoModel
{
    public string Name { get; set; } = "";
    public string Quantity { get; set; } = "1";
    public string Store { get; set; } = "";
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? AssignedTo { get; set; }
    public string Tags { get; set; } = "";
    public string Notes { get; set; } = "";
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? CreatedBy { get; set; }
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? PurchasedBy { get; set; }
    public string Status { get; set; } = "active";
}
