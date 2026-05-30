using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Admin authorization for web user management routes.
/// </summary>
public static class WebAdminAuth
{
    public static bool TryRequireAdmin(
        HttpRequest request,
        IServiceProvider root,
        string staticApiToken,
        out IResult? error)
    {
        error = null;
        const string prefix = "Bearer ";
        var authHeader = request.Headers.Authorization.ToString();
        if (!authHeader.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            error = ApiResults.Forbidden("Admin access requires a bearer token.");
            return false;
        }

        var token = authHeader[prefix.Length..].Trim();
        var auth = root.GetRequiredService<WebAuthService>();

        if (!string.IsNullOrWhiteSpace(staticApiToken) &&
            string.Equals(token, staticApiToken, StringComparison.Ordinal))
        {
            return true;
        }

        var jwtSecret = WebAuthService.ReadJwtSecret();
        if (!WebAuthService.IsJwtSecretConfigured(jwtSecret) ||
            !HomeBotJwtTokens.TryValidate(token, jwtSecret!, out var username, out var discordUserId))
        {
            error = ApiResults.Forbidden("Admin access denied.");
            return false;
        }

        if (!auth.IsAdmin(username, discordUserId))
        {
            error = ApiResults.Forbidden("Admin access denied.");
            return false;
        }

        return true;
    }
}
