using System.Text.Json.Serialization;

/// <summary>
/// Transport-agnostic detail payload for a calendar item.
/// </summary>
public class CalendarItemDetailModel{
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Link { get; set; } = "";
    public string Start { get; set; } = "";
    /// <summary>UTC storage string <c>yyyy-MM-dd HH:mm</c> when the series has an end; empty when none.</summary>
    public string End { get; set; } = "";
    public bool AllDay { get; set; }
    public string Reminder { get; set; } = "";
    public string Timezone { get; set; } = "";
    /// <summary>Series recurrence token (e.g. daily); empty for non-recurring.</summary>
    public string Recurrence { get; set; } = "";
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? AssignedTo { get; set; }
    /// <summary>When the client requested one occurrence, the canonical UTC key (range <c>instanceStartUtc</c>).</summary>
    public string? InstanceStartUtc { get; set; }
}
