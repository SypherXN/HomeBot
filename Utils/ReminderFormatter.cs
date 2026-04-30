/// <summary>
/// Converts reminder offsets (seconds) into compact display text.
/// </summary>
public static class ReminderFormatter
{
    /// <summary>
    /// Formats seconds as d/h/m shorthand.
    /// </summary>
    public static string Format(string secondsStr)
    {
        if (string.IsNullOrWhiteSpace(secondsStr))
            return "";

        if (!double.TryParse(secondsStr, out var seconds))
            return "";

        var ts = TimeSpan.FromSeconds(seconds);

        if (ts.TotalDays >= 1)
            return $"{(int)ts.TotalDays}d";

        if (ts.TotalHours >= 1)
            return $"{(int)ts.TotalHours}h";

        return $"{(int)ts.TotalMinutes}m";
    }
}