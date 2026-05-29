using System.Text.Json.Serialization;

/// <summary>
/// Transport-agnostic representation of one money transaction row.
/// </summary>
public class MoneyTransactionListItemModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public double Amount { get; set; }
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong PaidBy { get; set; }
    public string PaidByMemberLabel { get; set; } = "";
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong OwedBy { get; set; }
    public string OwedByMemberLabel { get; set; } = "";
    public string Type { get; set; } = "";
    public string Description { get; set; } = "";
    public string Notes { get; set; } = "";
}
