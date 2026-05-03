using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

/// <summary>
/// HS256 JWTs for Web UI logins (<c>HOMEBOT_WEB_JWT_SECRET</c>).
/// </summary>
public static class HomeBotJwtTokens
{
    public const string DiscordUidClaim = "discord_uid";

    /// <summary>
    /// Access JWT lifetime in seconds. Default 15 minutes. Set <c>HOMEBOT_WEB_JWT_ACCESS_TTL_SECONDS</c> (300–1209600).
    /// </summary>
    public static int AccessTokenLifetimeSeconds
    {
        get
        {
            var raw = Environment.GetEnvironmentVariable("HOMEBOT_WEB_JWT_ACCESS_TTL_SECONDS");
            if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) &&
                n >= 300 &&
                n <= 86400 * 14)
            {
                return n;
            }

            return 900;
        }
    }

    public static string CreateAccessToken(string username, string discordUserId, string secret, int lifetimeSeconds = 0)
    {
        if (lifetimeSeconds <= 0)
            lifetimeSeconds = AccessTokenLifetimeSeconds;

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var now = DateTime.UtcNow;
        var claims = new Claim[]
        {
            new(JwtRegisteredClaimNames.Sub, username),
            new(DiscordUidClaim, discordUserId),
            new(
                JwtRegisteredClaimNames.Iat,
                new DateTimeOffset(now).ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture),
                ClaimValueTypes.Integer64),
        };

        var token = new JwtSecurityToken(
            claims: claims,
            notBefore: now,
            expires: now.AddSeconds(lifetimeSeconds),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public static bool TryValidate(string bearerToken, string secret, out string username, out string discordUserId)
    {
        username = "";
        discordUserId = "";
        try
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
            var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
            var principal = handler.ValidateToken(
                bearerToken,
                new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = key,
                    ValidateIssuer = false,
                    ValidateAudience = false,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(2),
                },
                out _);

            var sub = principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                ?? principal.FindFirst("sub")?.Value;
            var did = principal.FindFirst(DiscordUidClaim)?.Value;
            if (string.IsNullOrEmpty(sub) || string.IsNullOrEmpty(did))
                return false;

            username = sub;
            discordUserId = did;
            return true;
        }
        catch
        {
            return false;
        }
    }
}
