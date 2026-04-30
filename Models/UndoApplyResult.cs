/// <summary>
/// Outcome of applying the user's last logged undo action.
/// </summary>
public sealed class UndoApplyResult
{
    public bool IsNothingToUndo { get; private init; }
    public bool IsSuccess { get; private init; }
    public string? Message { get; private init; }

    public static UndoApplyResult NothingToUndo() =>
        new() { IsNothingToUndo = true, Message = "Nothing to undo." };

    public static UndoApplyResult Ok() =>
        new() { IsSuccess = true };

    public static UndoApplyResult Fail(string message) =>
        new() { Message = message };
}
