using System.Text.Json.Serialization;

/// <summary>
/// Serialized payload used to restore deleted calendar items.
/// </summary>
public class CalendarDeleteUndoModel
{
    public string Title { get; set; } = "";
    public string Type { get; set; } = "task";
    public string Start { get; set; } = "";
    public string End { get; set; } = "";
    public int AllDay { get; set; }
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? Assigned { get; set; }
    public string Description { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Link { get; set; } = "";
    public string ReminderOffset { get; set; } = "";
    public string Recurrence { get; set; } = "";
    public string Timezone { get; set; } = "";
    public string Status { get; set; } = "active";
}
