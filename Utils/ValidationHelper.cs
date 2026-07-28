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

        if (!RecurrenceRule.TryParse(input, out _))
        {
            error = "❌ Recurrence must be daily, weekly, biweekly, monthly, or yearly (annual); weekly may list days (weekly:MO,WE) and any rule may end with ;UNTIL=YYYYMMDD or ;COUNT=N.";
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
        if (n == "annual")
            return "yearly";
        if (n == "biweekly")
            return "biweekly";
        // Preserve weekday lists and until/count suffixes; normalize only the leading token case-insensitively.
        var semi = n.IndexOf(';');
        var suffix = semi >= 0 ? n[semi..] : "";
        var core = semi >= 0 ? n[..semi] : n;
        if (core.StartsWith("weekly:", StringComparison.Ordinal))
            return core + suffix;
        return core == "annual" ? "yearly" : core + suffix;
    }
}