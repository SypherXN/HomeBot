/// <summary>
/// Neutral labels for Discord user IDs in API and web payloads (no mention markup).
/// </summary>
public static class HouseholdIdentity
{
    /// <summary>
    /// Stable display label for a household member, e.g. member-123456789.
    /// </summary>
    public static string MemberLabel(ulong discordUserId) => $"member-{discordUserId}";

    /// <summary>
    /// Returns null when the id is absent.
    /// </summary>
    public static string? MemberLabel(ulong? discordUserId) =>
        discordUserId.HasValue ? MemberLabel(discordUserId.Value) : null;
}
