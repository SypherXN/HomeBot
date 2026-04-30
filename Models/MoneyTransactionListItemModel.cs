/// <summary>
/// Transport-agnostic representation of one money transaction row.
/// </summary>
public class MoneyTransactionListItemModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public double Amount { get; set; }
    public ulong PaidBy { get; set; }
    public string PaidByMemberLabel { get; set; } = "";
    public ulong OwedBy { get; set; }
    public string OwedByMemberLabel { get; set; } = "";
    public string Type { get; set; } = "";
}
