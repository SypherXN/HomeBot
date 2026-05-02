/// <summary>
/// Curated IANA ids for Discord autocomplete seeds and help text (portable across OS).
/// </summary>
public static class HomeBotTimeZones
{
    /// <summary>Shown when the user has not typed a filter yet (max 25 for Discord autocomplete).</summary>
    public static readonly string[] PopularAutocompleteSeeds =
    [
        "UTC",
        "America/Los_Angeles",
        "America/Denver",
        "America/Chicago",
        "America/New_York",
        "America/Toronto",
        "America/Vancouver",
        "Europe/London",
        "Europe/Paris",
        "Europe/Berlin",
        "Asia/Tokyo",
        "Asia/Shanghai",
        "Asia/Singapore",
        "Australia/Sydney",
        "Pacific/Auckland",
        "America/Sao_Paulo",
        "Africa/Johannesburg",
    ];

    /// <summary>Lines for /timezone-list embed (short, IANA-focused).</summary>
    public static string HelpEmbedBody =>
        "Use **IANA** ids when possible (they work on Windows and Linux).\n\n"
        + "**Examples:**\n"
        + string.Join("\n", PopularAutocompleteSeeds.Select(z => $"- `{z}`"))
        + "\n\n**Discord:** `/timezone-set` — type a few letters and pick from suggestions.\n"
        + "**Legacy:** Windows names like `Pacific Standard Time` are converted when possible.\n"
        + "**Config:** `/config-set timezone America/Los_Angeles` (validated).";
}
