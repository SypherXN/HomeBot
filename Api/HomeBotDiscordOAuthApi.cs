using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Discord OAuth2 browser login (authorization code). Complements password login for the same <c>WebUsers</c> row.
/// </summary>
public static class HomeBotDiscordOAuthApi
{
    public static void MapHomeBotDiscordOAuthApi(this WebApplication app, IServiceProvider root)
    {
        app.MapGet(
            "/api/auth/discord/oauth/url",
            () =>
            {
                var oauth = root.GetRequiredService<DiscordOAuthService>();
                if (!oauth.IsOAuthConfigured())
                {
                    return Results.Ok(new
                    {
                        configured = false,
                        authorizeUrl = (string?)null,
                        reason = "Set HOMEBOT_DISCORD_OAUTH_CLIENT_ID, HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET, and HOMEBOT_DISCORD_OAUTH_REDIRECT_URI.",
                    });
                }

                var err = oauth.TryGetAuthorizeUrl(out var url);
                if (err != null)
                    return err;

                return Results.Ok(new { configured = true, authorizeUrl = url });
            }).RequireRateLimiting("auth_oauth_browser");

        app.MapGet(
            "/api/auth/discord/oauth/callback",
            async (HttpRequest req, CancellationToken cancellationToken) =>
            {
                var oauth = root.GetRequiredService<DiscordOAuthService>();
                var code = req.Query["code"].ToString();
                var state = req.Query["state"].ToString();
                return await oauth.HandleCallbackAsync(code, state, cancellationToken).ConfigureAwait(false);
            }).RequireRateLimiting("auth_oauth_browser");

        app.MapPost(
            "/api/auth/discord/oauth/consume",
            async (HttpRequest http) =>
            {
                var oauth = root.GetRequiredService<DiscordOAuthService>();
                var body = await http.ReadFromJsonAsync<ConsumeBody>().ConfigureAwait(false);
                if (body is null || string.IsNullOrWhiteSpace(body.Code))
                    return ApiResults.Validation("code is required.");

                var err = oauth.TryConsumeExchange(body.Code.Trim(), out var tokens);
                if (err != null)
                    return err;

                var t = tokens!;
                var audit = root.GetRequiredService<DiscordAuthAuditNotifier>();
                _ = audit.NotifyWebSignInAsync("discord_oauth", t.Username, t.DiscordUserId);

                return Results.Ok(
                    new WebAuthSessionResponse(
                        t.AccessToken,
                        "Bearer",
                        HomeBotJwtTokens.AccessTokenLifetimeSeconds,
                        t.Username,
                        t.DiscordUserId,
                        t.RefreshToken,
                        t.RefreshExpiresInSeconds));
            }).RequireRateLimiting("auth_oauth_consume");
    }

    private sealed record ConsumeBody(string Code);
}
