/// <summary>
/// Shared validation helpers for calendar command input fields.
/// </summary>
public static class ValidationHelper
{
    /// <summary>
    /// Validates natural-language date input.
    /// </summary>
    public static bool ValidateDate(string input, out string error)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            error = "";
            return true;
        }

        var parsed = DateParser.Parse(input);

        if (!parsed.HasValue)
        {
            error = "❌ Invalid date format. Try: 'tomorrow 6pm' or '5/1/2026 6pm'";
            return false;
        }

        error = "";
        return true;
    }

    /// <summary>
    /// Validates reminder offset syntax.
    /// </summary>
    public static bool ValidateReminder(string input, out string error)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            error = "";
            return true;
        }

        var parsed = ReminderParser.Parse(input);

        if (!parsed.HasValue)
        {
            error = "❌ Invalid reminder format. Use: 10m, 2h, 1d";
            return false;
        }

        error = "";
        return true;
    }

    /// <summary>
    /// Validates recurrence values supported by the bot.
    /// </summary>
    public static bool ValidateRecurrence(string input, out string error)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            error = "";
            return true;
        }

        if (input != "daily" && input != "weekly")
        {
            error = "❌ Recurrence must be 'daily' or 'weekly'";
            return false;
        }

        error = "";
        return true;
    }
}