using System.Globalization;

/// <summary>
/// Posts web sign-in events to the Discord channel bound for feature <see cref="AuditFeatureKey"/> via <c>/setup-set audit …</c>.
/// </summary>
public sealed class DiscordAuthAuditNotifier
{
    /// <summary>Channel binding feature name for auth audit log messages.</summary>
    public const string AuditFeatureKey = "audit";

    private readonly IDiscordChannelNotifier _channels;

    public DiscordAuthAuditNotifier(IDiscordChannelNotifier channels)
    {
        _channels = channels;
    }

    /// <summary>
    /// Sends a short markdown line when a user completes web sign-in. No-ops when Discord is offline or no channel is bound.
    /// </summary>
    public ValueTask NotifyWebSignInAsync(string methodLabel, string username, string discordUserId)
    {
        var ts = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd HH:mm:ss 'UTC'", CultureInfo.InvariantCulture);
        var safeUser = EscapeForMarkdownCode(username);
        var msg = $"**Web sign-in** ({methodLabel}) · `{safeUser}` · Discord id `{discordUserId}` · {ts}";
        return _channels.NotifyFeatureChannelAsync(AuditFeatureKey, msg);
    }

    private static string EscapeForMarkdownCode(string s)
    {
        if (string.IsNullOrEmpty(s))
            return "";
        return s.Replace('`', '\'');
    }
}
