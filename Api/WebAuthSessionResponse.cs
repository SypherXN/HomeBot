/// <summary>JSON returned by password login, OAuth consume, and refresh (camelCase serialized).</summary>
public sealed record WebAuthSessionResponse(
    string AccessToken,
    string TokenType,
    int ExpiresInSeconds,
    string Username,
    string DiscordUserId,
    string RefreshToken,
    int RefreshExpiresInSeconds);
