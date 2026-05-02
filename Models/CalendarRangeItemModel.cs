/// <summary>
/// One occurrence within a calendar range query. Non-recurring rows produce a single
/// model at the stored start. Daily/weekly recurring rows produce one model per occurrence
/// inside the requested window; all instances for a series share the parent <see cref="Id"/>.
/// </summary>
public class CalendarRangeItemModel
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Type { get; set; } = "event";
    public bool AllDay { get; set; }
    public ulong? AssignedTo { get; set; }
    public string? AssignedToMemberLabel { get; set; }
    public string ReminderText { get; set; } = "";
    public string RecurrenceText { get; set; } = "";
    public string Recurrence { get; set; } = "";
    public bool HasLink { get; set; }

    /// <summary>UTC ISO 8601 timestamp ("Z") for the occurrence start.</summary>
    public string InstanceStartUtc { get; set; } = "";

    /// <summary>UTC ISO 8601 timestamp ("Z") for the occurrence end, or null if the row has no end.</summary>
    public string? InstanceEndUtc { get; set; }

    /// <summary>True when this row was synthesized from a recurring series.</summary>
    public bool IsRecurringInstance { get; set; }

    /// <summary>IANA or Windows time zone id used when this occurrence was computed (row / event zone).</summary>
    public string TimeZoneId { get; set; } = "";
}
