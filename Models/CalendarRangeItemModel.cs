using System.Text.Json.Serialization;

/// <summary>
/// One occurrence within a calendar range query. Non-recurring rows produce a single
/// model at the stored start. Daily/weekly recurring rows produce one model per occurrence
/// inside the requested window; all instances for a series share the parent <see cref="Id"/>.
/// </summary>
public class CalendarRangeItemModel
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Type { get; set; } = "event";
    public bool AllDay { get; set; }
    [JsonConverter(typeof(SnowflakeUlongNullableJsonConverter))]
    public ulong? AssignedTo { get; set; }
    public string? AssignedToMemberLabel { get; set; }
    public string ReminderText { get; set; } = "";
    public string RecurrenceText { get; set; } = "";
    public string Recurrence { get; set; } = "";
    public bool HasLink { get; set; }

    /// <summary>Canonical UTC key for this recurrence slot (matches <c>CalendarRecurrenceExceptions.InstanceStartUtc</c>).</summary>
    public string InstanceStartUtc { get; set; } = "";

    /// <summary>When a per-instance time override exists, the effective start for layout; otherwise null (use <see cref="InstanceStartUtc"/>).</summary>
    public string? DisplayInstanceStartUtc { get; set; }

    /// <summary>UTC ISO 8601 timestamp ("Z") for the occurrence end, or null if the row has no end.</summary>
    public string? InstanceEndUtc { get; set; }

    /// <summary>Effective end when display start differs; mirrors <see cref="DisplayInstanceStartUtc"/>.</summary>
    public string? DisplayInstanceEndUtc { get; set; }

    /// <summary>True when this row was synthesized from a recurring series.</summary>
    public bool IsRecurringInstance { get; set; }

    /// <summary>True when this occurrence was marked complete without completing the whole series.</summary>
    public bool IsInstanceCompleted { get; set; }

    /// <summary>True when the whole series/item was marked complete (only returned when includeCompleted is set on the range query).</summary>
    public bool IsCompleted { get; set; }

    /// <summary>True when title/description/notes/link or time was overridden for this occurrence.</summary>
    public bool HasInstanceOverride { get; set; }

    /// <summary>IANA or Windows time zone id used when this occurrence was computed (row / event zone).</summary>
    public string TimeZoneId { get; set; } = "";
}
