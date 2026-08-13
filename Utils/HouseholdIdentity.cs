/// <summary>
/// Neutral labels for Discord user IDs in API and web payloads (no mention markup).
/// Prefers the Discord username when the gateway client is connected.
/// </summary>
public static class HouseholdIdentity
{
    static Func<ulong, string?>? _usernameLookup;

    /// <summary>
    /// Optional Discord username lookup registered at host start.
    /// </summary>
    public static void UseUsernameLookup(Func<ulong, string?>? lookup) => _usernameLookup = lookup;

    /// <summary>
    /// Display label for a household member: Discord username when known, otherwise member-123456789.
    /// </summary>
    public static string MemberLabel(ulong discordUserId)
    {
        var username = _usernameLookup?.Invoke(discordUserId);
        if (!string.IsNullOrWhiteSpace(username))
            return username.Trim();
        return $"member-{discordUserId}";
    }

    /// <summary>
    /// Returns null when the id is absent.
    /// </summary>
    public static string? MemberLabel(ulong? discordUserId) =>
        discordUserId.HasValue ? MemberLabel(discordUserId.Value) : null;
}
