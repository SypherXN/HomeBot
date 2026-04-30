/// <summary>
/// Transport-agnostic representation of one buy list item.
/// </summary>
public class BuyListItemModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Quantity { get; set; } = "1";
    public string Store { get; set; } = "";
    public ulong? AssignedTo { get; set; }
    public List<string> Tags { get; set; } = new();
    public string Notes { get; set; } = "";
    public ulong? PurchasedBy { get; set; }
}
