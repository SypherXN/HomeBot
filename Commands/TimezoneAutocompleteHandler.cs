using Discord;
using Discord.Interactions;

/// <summary>
/// Filters system time zones for slash-command autocomplete (Discord max 25 choices).
/// </summary>
public class TimezoneAutocompleteHandler : AutocompleteHandler
{
    private static readonly Lazy<List<TimeZoneInfo>> SortedZones = new(() =>
        TimeZoneInfo.GetSystemTimeZones().OrderBy(z => z.Id, StringComparer.OrdinalIgnoreCase).ToList());

    /// <inheritdoc />
    public override Task<AutocompletionResult> GenerateSuggestionsAsync(
        IInteractionContext context,
        IAutocompleteInteraction autocompleteInteraction,
        IParameterInfo parameter,
        IServiceProvider services)
    {
        var partial = autocompleteInteraction.Data.Current?.Value?.ToString()?.Trim() ?? "";

        IEnumerable<AutocompleteResult> results;
        if (string.IsNullOrEmpty(partial))
        {
            results = HomeBotTimeZones.PopularAutocompleteSeeds
                .Take(25)
                .Select(id => new AutocompleteResult(id, id));
        }
        else
        {
            results = SortedZones.Value
                .Where(z =>
                    z.Id.Contains(partial, StringComparison.OrdinalIgnoreCase)
                    || z.DisplayName.Contains(partial, StringComparison.OrdinalIgnoreCase))
                .Take(25)
                .Select(z => new AutocompleteResult(TrimChoiceName(z), z.Id));
        }

        return Task.FromResult(AutocompletionResult.FromSuccess(results));
    }

    private static string TrimChoiceName(TimeZoneInfo z)
    {
        var label = $"{z.Id} — {z.DisplayName}";
        return label.Length <= 100 ? label : z.Id;
    }
}
