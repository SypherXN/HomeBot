using Discord;
using Discord.Interactions;

/// <summary>
/// Slash commands for binding bot features to specific channels.
/// </summary>
public class SetupCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly ChannelBindingService _binding;

    public SetupCommands(ChannelBindingService binding)
    {
        _binding = binding;
    }

    /// <summary>
    /// Sets the target channel for a feature key.
    /// </summary>
    [SlashCommand("setup-set", "Bind a feature to a channel")]
    public async Task Set(string feature, ITextChannel channel)
    {
        _binding.SetChannel(feature.ToLower(), channel.Id);

        await RespondAsync($"🔗 `{feature}` bound to {channel.Mention}");
    }

    /// <summary>
    /// Displays all configured feature-to-channel bindings.
    /// </summary>
    [SlashCommand("setup-view", "View channel bindings")]
    public async Task View()
    {
        var all = _binding.GetAll();

        if (all.Count == 0)
        {
            await RespondAsync("No channels configured.");
            return;
        }

        var lines = all.Select(kv => $"{kv.Key} → <#{kv.Value}>");

        await RespondAsync(string.Join("\n", lines));
    }
}