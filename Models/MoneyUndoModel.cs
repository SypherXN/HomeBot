/// <summary>
/// Serialized payload used to restore a deleted money transaction.
/// </summary>
public class MoneyUndoModel
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Notes { get; set; } = "";
    public double Amount { get; set; }
    public string AmountInput { get; set; } = "";
    public ulong PaidBy { get; set; }
    public ulong OwedBy { get; set; }
    public string Type { get; set; } = "";
}