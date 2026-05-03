using Discord.Interactions;

/// <summary>
/// Confirms a Web UI setup code from the browser (guild members only).
/// </summary>
public class WebUiVerifyCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly WebAuthDiscordVerificationService _verification;

    public WebUiVerifyCommands(WebAuthDiscordVerificationService verification)
    {
        _verification = verification;
    }

    [SlashCommand("webui-verify", "Confirm a Web UI account setup code from the browser")]
    public async Task Verify([Summary(description: "8-character code from the Web setup page")] string code)
    {
        var guildIdRaw = Environment.GetEnvironmentVariable("DISCORD_GUILD_ID");
        if (string.IsNullOrWhiteSpace(guildIdRaw) || !ulong.TryParse(guildIdRaw, out var expectedGuildId))
        {
            await RespondAsync("❌ DISCORD_GUILD_ID is not configured on the bot.", ephemeral: true);
            return;
        }

        if (Context.Guild?.Id != expectedGuildId)
        {
            await RespondAsync("❌ This command only works in your HomeBot server.", ephemeral: true);
            return;
        }

        var msg = _verification.TryVerifyInDiscord(code, Context.User.Id);
        await RespondAsync(msg, ephemeral: true);
    }
}
