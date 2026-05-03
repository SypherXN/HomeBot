using System.Text.Json.Serialization;

/// <summary>
/// Transport-agnostic representation of one calendar list row.
/// </summary>
public class CalendarListItemModel
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Type { get; set; } = "task";
    public string DateText { get; set; } = "";
    public bool AllDay { get; set; }
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? AssignedTo { get; set; }
    public string? AssignedToMemberLabel { get; set; }
    public string ReminderText { get; set; } = "";
    public string RecurrenceText { get; set; } = "";
    public bool HasLink { get; set; }
    public DateTime SortDate { get; set; } = DateTime.MaxValue;
}
