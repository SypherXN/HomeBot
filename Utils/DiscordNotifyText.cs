/// <summary>
/// Trims user-provided strings for safe one-line Discord notifications (no markdown injection).
/// </summary>
public static class DiscordNotifyText
{
    /// <summary>
    /// Collapses whitespace, truncates, and strips characters that break Markdown emphasis.
    /// </summary>
    public static string SanitizeInline(string? text, int maxLen = 80)
    {
        if (string.IsNullOrWhiteSpace(text))
            return "";

        var s = text.Replace('\r', ' ').Replace('\n', ' ');
        while (s.Contains("  ", StringComparison.Ordinal))
            s = s.Replace("  ", " ", StringComparison.Ordinal);
        s = s.Trim();
        if (s.Length > maxLen)
            s = s[..maxLen] + "…";

        return s
            .Replace('*', '·')
            .Replace('_', '·')
            .Replace('`', '\'')
            .Replace('~', '·')
            .Replace('|', '·');
    }
}
