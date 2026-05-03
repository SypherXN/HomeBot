/// <summary>
/// Snapshot of a <c>CalendarRecurrenceExceptions</c> row for undo after UPDATE, or full row after INSERT for reference.
/// </summary>
public sealed class RecurrenceExceptionUndoModel
{
    public int Id { get; set; }
    public int CalendarItemId { get; set; }
    public string InstanceStartUtc { get; set; } = "";
    public string ExceptionKind { get; set; } = "";
    public string? OverrideTitle { get; set; }
    public string? OverrideDescription { get; set; }
    public string? OverrideNotes { get; set; }
    public string? OverrideLink { get; set; }
    public string? OverrideInstanceStartUtc { get; set; }
    public string? OverrideInstanceEndUtc { get; set; }
    public int InstanceCompleted { get; set; }
}
