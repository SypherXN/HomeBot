using Discord.Interactions;

/// <summary>
/// Utility checks for validating command usage against channel bindings.
/// </summary>
public static class ChannelGuard
{
    /// <summary>
    /// Returns whether the current channel matches the configured feature channel.
    /// </summary>
    public static bool IsCorrectChannel(
        ulong currentChannelId,
        ChannelBindingService binding,
        string feature,
        out ulong? expectedChannel)
    {
        expectedChannel = binding.GetChannel(feature);

        // If not configured, allow
        if (!expectedChannel.HasValue)
            return true;

        return currentChannelId == expectedChannel.Value;
    }
}