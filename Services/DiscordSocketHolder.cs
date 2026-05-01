using Discord.WebSocket;

/// <summary>
/// Holds the live <see cref="DiscordSocketClient"/> after it is constructed so API code can resolve it
/// without capturing a null in a DI singleton factory (race with <see cref="Program.StartApiAsync"/>).
/// </summary>
public sealed class DiscordSocketHolder
{
    public DiscordSocketClient? Client { get; set; }
}
