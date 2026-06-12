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

        var normalized = NormalizeRecurrence(input);
        if (normalized != "daily" && normalized != "weekly" && normalized != "monthly" && normalized != "yearly")
        {
            error = "❌ Recurrence must be 'daily', 'weekly', 'monthly', or 'yearly' (annual)";
            return false;
        }

        error = "";
        return true;
    }

    /// <summary>Maps client tokens (e.g. annual) to the stored recurrence value.</summary>
    public static string NormalizeRecurrence(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return "";
        var n = input.Trim().ToLowerInvariant();
        return n == "annual" ? "yearly" : n;
    }
}