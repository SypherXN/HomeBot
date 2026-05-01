/// <summary>
/// Posts a short message to the Discord channel bound for a feature (buy, wishlist, money, calendar), if the bot is connected.
/// </summary>
public interface IDiscordChannelNotifier
{
    /// <param name="feature">Channel binding key: <c>buy</c>, <c>wishlist</c>, <c>money</c>, or <c>calendar</c>.</param>
    /// <param name="markdownMessage">Plain text / light Markdown (already sanitized for user input).</param>
    ValueTask NotifyFeatureChannelAsync(string feature, string markdownMessage);
}
