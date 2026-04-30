/// <summary>
/// Transport-agnostic detail payload for a calendar item.
/// </summary>
public class CalendarItemDetailModel
{
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Link { get; set; } = "";
    public string Start { get; set; } = "";
    public bool AllDay { get; set; }
    public string Reminder { get; set; } = "";
}
