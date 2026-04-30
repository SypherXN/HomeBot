/// <summary>
/// Transport-agnostic money summary for a user pair.
/// </summary>
public class MoneySummaryModel
{
    public ulong User1Id { get; set; }
    public ulong User2Id { get; set; }
    public string User1Name { get; set; } = "";
    public string User2Name { get; set; } = "";
    public double Balance { get; set; }
}
