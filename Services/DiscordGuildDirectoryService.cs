using Discord;
using Discord.WebSocket;

/// <summary>
/// Resolves Discord guild members for the configured <c>DISCORD_GUILD_ID</c> when the gateway client is connected.
/// Used by the Web UI to pick user ids without copying snowflakes.
/// </summary>
public sealed class DiscordGuildDirectoryService
{
    private readonly DiscordSocketHolder _holder;

    public DiscordGuildDirectoryService(DiscordSocketHolder holder) => _holder = holder;

    /// <summary>
    /// Returns human members (non-bot) sorted by display name. When Discord is offline or misconfigured,
    /// <see cref="DiscordGuildMembersResponse.Available"/> is false and <see cref="DiscordGuildMembersResponse.Members"/> is empty.
    /// </summary>
    public async Task<DiscordGuildMembersResponse> GetMembersAsync()
    {
        var client = _holder.Client;
        if (client is null || client.ConnectionState != ConnectionState.Connected)
        {
            return DiscordGuildMembersResponse.Unavailable(
                "Discord client is not connected. Run the bot with HOMEBOT_DISCORD_ENABLED=true and wait until the gateway is ready.");
        }

        var rawGuild = Environment.GetEnvironmentVariable("DISCORD_GUILD_ID");
        if (string.IsNullOrWhiteSpace(rawGuild) || !ulong.TryParse(rawGuild, out var guildId))
        {
            return DiscordGuildMembersResponse.Unavailable(
                "DISCORD_GUILD_ID is not set or invalid. Set it to your server id (same as slash command registration).");
        }

        var guild = client.GetGuild(guildId);
        if (guild is null)
        {
            return DiscordGuildMembersResponse.Unavailable(
                "Guild not found for DISCORD_GUILD_ID. Ensure the bot is invited to that server.");
        }

        await guild.DownloadUsersAsync().ConfigureAwait(false);

        var members = guild.Users
            .Where(u => !u.IsBot)
            .Select(u => new DiscordGuildMemberDto(
                UserId: u.Id.ToString(),
                DisplayName: MemberLabel(u),
                Username: u.Username))
            .OrderBy(m => m.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new DiscordGuildMembersResponse(
            Available: true,
            Reason: null,
            GuildId: guildId.ToString(),
            Members: members);
    }

    /// <summary>
    /// Cached Discord username for a user id. Does not download the member list (list rows call this often).
    /// </summary>
    public string? TryGetUsername(ulong userId)
    {
        var client = _holder.Client;
        if (client is null || client.ConnectionState != ConnectionState.Connected)
            return null;

        var rawGuild = Environment.GetEnvironmentVariable("DISCORD_GUILD_ID");
        if (!string.IsNullOrWhiteSpace(rawGuild) && ulong.TryParse(rawGuild, out var guildId))
        {
            var member = client.GetGuild(guildId)?.GetUser(userId);
            if (member != null && !string.IsNullOrWhiteSpace(member.Username))
                return member.Username;
        }

        var user = client.GetUser(userId);
        return string.IsNullOrWhiteSpace(user?.Username) ? null : user.Username;
    }

    private static string MemberLabel(SocketGuildUser u)
    {
        if (!string.IsNullOrWhiteSpace(u.Nickname))
            return u.Nickname;
        if (!string.IsNullOrWhiteSpace(u.GlobalName))
            return u.GlobalName!;
        return u.Username;
    }
}

/// <summary>JSON response for <c>GET /api/discord/guild/members</c>.</summary>
public sealed record DiscordGuildMembersResponse(
    bool Available,
    string? Reason,
    string? GuildId,
    IReadOnlyList<DiscordGuildMemberDto> Members)
{
    public static DiscordGuildMembersResponse Unavailable(string reason) =>
        new(false, reason, null, Array.Empty<DiscordGuildMemberDto>());
}

/// <summary>One guild member row for the Web UI picker.</summary>
public sealed record DiscordGuildMemberDto(
    string UserId,
    string DisplayName,
    string Username);
