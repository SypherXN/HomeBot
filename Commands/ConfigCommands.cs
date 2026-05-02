using Discord;
using Discord.Interactions;

/// <summary>
/// Slash commands for reading and writing bot configuration values.
/// </summary>
public class ConfigCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly ConfigService _config;

    public ConfigCommands(ConfigService config)
    {
        _config = config;
    }

    /// <summary>
    /// Stores a configuration value by key.
    /// </summary>
    [SlashCommand("config-set", "Set a config value")]
    public async Task Set(string key, string value)
    {
        var k = key.ToLower();
        if (string.Equals(k, "timezone", StringComparison.Ordinal))
        {
            if (!TimeZoneResolver.TryFind(value, out var tz))
            {
                await RespondAsync(
                    $"Unknown timezone `{value}`. Use `/timezone-set` with suggestions, or `/timezone-list` for examples.",
                    ephemeral: true);
                return;
            }

            value = TimeZoneResolver.ToStorageId(tz);
        }

        _config.Set(k, value);

        await RespondAsync($"⚙️ Set `{key}` = `{value}`");
    }

    /// <summary>
    /// Sets the household calendar timezone using autocomplete (IANA recommended).
    /// </summary>
    [SlashCommand("timezone-set", "Set household calendar timezone (type to filter suggestions)")]
    public async Task TimezoneSet(
        [Summary("zone"), Autocomplete(typeof(TimezoneAutocompleteHandler))]
        string zone)
    {
        if (!TimeZoneResolver.TryFind(zone, out var tz))
        {
            await RespondAsync("Could not resolve that timezone. Try `/timezone-list` for common ids.", ephemeral: true);
            return;
        }

        var stored = TimeZoneResolver.ToStorageId(tz);
        _config.Set("timezone", stored);
        await RespondAsync($"🌍 Timezone set to **`{stored}`** ({tz.DisplayName}).");
    }

    /// <summary>
    /// Shows common IANA timezone ids and how to set the household zone on Discord.
    /// </summary>
    [SlashCommand("timezone-list", "Show common timezone ids and tips")]
    public async Task TimezoneList()
    {
        var embed = new EmbedBuilder()
            .WithTitle("Time zones")
            .WithDescription(HomeBotTimeZones.HelpEmbedBody)
            .WithColor(Color.Blue)
            .Build();
        await RespondAsync(embed: embed, ephemeral: true);
    }

    /// <summary>
    /// Displays all persisted configuration key-value pairs.
    /// </summary>
    [SlashCommand("config-view", "View all config")]
    public async Task View()
    {
        var all = _config.GetAll();

        if (all.Count == 0)
        {
            await RespondAsync("No config set.");
            return;
        }

        var lines = all.Select(kv => $"{kv.Key}: {kv.Value}");

        await RespondAsync("```" + string.Join("\n", lines) + "```");
    }
}