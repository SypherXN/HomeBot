using System.Text.RegularExpressions;

/// <summary>
/// Parses shorthand reminder offsets such as 10m, 2h, and 1d.
/// </summary>
public static class ReminderParser
{
    /// <summary>
    /// Parses reminder text into a <see cref="TimeSpan"/>.
    /// </summary>
    public static TimeSpan? Parse(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return null;

        input = input.Trim().ToLower();

        var match = Regex.Match(input, @"(\d+)(m|h|d)");

        if (!match.Success)
            return null;

        int value = int.Parse(match.Groups[1].Value);
        string unit = match.Groups[2].Value;

        return unit switch
        {
            "m" => TimeSpan.FromMinutes(value),
            "h" => TimeSpan.FromHours(value),
            "d" => TimeSpan.FromDays(value),
            _ => null
        };
    }
}