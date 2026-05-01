using Discord;
using Discord.WebSocket;

/// <summary>
/// Sends Web/API-sourced updates to the channel configured for each feature via <see cref="ChannelBindingService"/>.
/// </summary>
public sealed class DiscordChannelNotifier : IDiscordChannelNotifier
{
    private readonly DiscordSocketHolder _holder;
    private readonly ChannelBindingService _bindings;
    private readonly LoggingService _log;

    public DiscordChannelNotifier(
        DiscordSocketHolder holder,
        ChannelBindingService bindings,
        LoggingService log)
    {
        _holder = holder;
        _bindings = bindings;
        _log = log;
    }

    /// <inheritdoc />
    public async ValueTask NotifyFeatureChannelAsync(string feature, string markdownMessage)
    {
        var client = _holder.Client;
        if (client is null)
            return;

        if (client.ConnectionState != ConnectionState.Connected)
            return;

        var channelId = _bindings.GetChannel(feature);
        if (!channelId.HasValue)
        {
            _log.Info($"Discord notify skipped: no channel bound for feature '{feature}'.");
            return;
        }

        var channel = client.GetChannel(channelId.Value) as IMessageChannel;
        if (channel is null)
        {
            _log.Info($"Discord notify: channel {channelId} not reachable for feature '{feature}'.");
            return;
        }

        try
        {
            await channel.SendMessageAsync(
                markdownMessage,
                allowedMentions: AllowedMentions.None);
        }
        catch (Exception ex)
        {
            _log.Exception(ex);
        }
    }
}
