using System.Text.Json.Serialization;

/// <summary>
/// Transport-agnostic money summary for a user pair.
/// </summary>
public class MoneySummaryModel
{
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong User1Id { get; set; }
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong User2Id { get; set; }
    public string User1Name { get; set; } = "";
    public string User1MemberLabel { get; set; } = "";
    public string User2Name { get; set; } = "";
    public string User2MemberLabel { get; set; } = "";
    public double Balance { get; set; }
}

public sealed class MoneyBalancesModel
{
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong UserId { get; set; }
    public string MemberLabel { get; set; } = "";
    public List<MoneyBalanceEntryModel> Balances { get; set; } = [];
}

public sealed class MoneyBalanceEntryModel
{
    [JsonConverter(typeof(SnowflakeUlongJsonConverter))]
    public ulong OtherUserId { get; set; }
    public string OtherMemberLabel { get; set; } = "";
    public double Balance { get; set; }
}
