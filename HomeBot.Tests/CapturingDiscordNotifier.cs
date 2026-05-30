/// <summary>Records Discord channel notifications for test assertions (no live socket).</summary>
public sealed class CapturingDiscordNotifier : IDiscordChannelNotifier
{
    private readonly List<(string Feature, string Message)> _messages = new();
    private readonly object _lock = new();

    public IReadOnlyList<(string Feature, string Message)> Messages
    {
        get
        {
            lock (_lock)
                return _messages.ToList();
        }
    }

    public void Clear()
    {
        lock (_lock)
            _messages.Clear();
    }

    public ValueTask NotifyFeatureChannelAsync(string feature, string markdownMessage)
    {
        lock (_lock)
            _messages.Add((feature, markdownMessage));
        return ValueTask.CompletedTask;
    }

    public ValueTask NotifyUserDmAsync(ulong discordUserId, string markdownMessage)
    {
        lock (_lock)
            _messages.Add(($"dm:{discordUserId}", markdownMessage));
        return ValueTask.CompletedTask;
    }
}
