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
        _config.Set(key.ToLower(), value);

        await RespondAsync($"⚙️ Set `{key}` = `{value}`");
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