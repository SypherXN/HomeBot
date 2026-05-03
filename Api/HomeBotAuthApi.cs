using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Web UI login and household user registration (small user count).
/// </summary>
public static class HomeBotAuthApi
{
    public static void MapHomeBotAuthApi(this WebApplication app, IServiceProvider root, string staticApiToken)
    {
        app.MapPost("/api/auth/login", async (HttpRequest http) =>
        {
            if (!WebAuthService.IsJwtSecretConfigured(WebAuthService.ReadJwtSecret()))
            {
                return Results.Json(
                    new ApiErrorBody(
                        "Web login is not configured (set HOMEBOT_WEB_JWT_SECRET to at least 32 UTF-8 bytes).",
                        "service_unavailable"),
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            var body = await http.ReadFromJsonAsync<LoginBody>();
            if (body is null || string.IsNullOrWhiteSpace(body.Username) || body.Password is null)
                return ApiResults.Validation("username and password are required.");

            var auth = root.GetRequiredService<WebAuthService>();
            var pair = auth.TryLogin(body.Username, body.Password);
            if (pair is null)
            {
                return Results.Json(
                    new ApiErrorBody("Invalid username or password.", "invalid_credentials"),
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            var (accessToken, username, discordUserId) = pair.Value;
            var audit = root.GetRequiredService<DiscordAuthAuditNotifier>();
            _ = audit.NotifyWebSignInAsync("password", username, discordUserId);

            var refreshSvc = root.GetRequiredService<WebRefreshTokenService>();
            var (rPlain, rExp) = refreshSvc.IssueForUser(username, discordUserId);
            var refreshTtl = (int)Math.Clamp((rExp - DateTimeOffset.UtcNow).TotalSeconds, 1, int.MaxValue);

            return Results.Ok(new WebAuthSessionResponse(
                accessToken,
                "Bearer",
                HomeBotJwtTokens.AccessTokenLifetimeSeconds,
                username,
                discordUserId,
                rPlain,
                refreshTtl));
        }).RequireRateLimiting("auth_login");

        app.MapPost("/api/auth/bootstrap", async (HttpRequest http) =>
        {
            if (!WebAuthService.IsJwtSecretConfigured(WebAuthService.ReadJwtSecret()))
            {
                return ApiResults.BadRequest(
                    "Set HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes) before creating web users.",
                    "jwt_not_configured");
            }

            var body = await http.ReadFromJsonAsync<BootstrapBody>();
            if (body is null || string.IsNullOrWhiteSpace(body.Username) || body.Password is null ||
                string.IsNullOrWhiteSpace(body.DiscordUserId))
            {
                return ApiResults.Validation("username, password, and discordUserId are required.");
            }

            var auth = root.GetRequiredService<WebAuthService>();
            var err = auth.TryCreateFirstUser(body.Username, body.Password, body.DiscordUserId, body.SetupToken);
            if (err != null)
                return err;

            return Results.Ok(new { ok = true, message = "First web user created. You can sign in at POST /api/auth/login." });
        }).RequireRateLimiting("auth_account_write");

        app.MapPost("/api/auth/register", async (HttpRequest http) =>
        {
            if (!WebAuthService.IsJwtSecretConfigured(WebAuthService.ReadJwtSecret()))
            {
                return ApiResults.BadRequest(
                    "Set HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes) before creating web users.",
                    "jwt_not_configured");
            }

            var body = await http.ReadFromJsonAsync<RegisterBody>();
            if (body is null || string.IsNullOrWhiteSpace(body.InviteToken) || string.IsNullOrWhiteSpace(body.Username) ||
                body.Password is null || string.IsNullOrWhiteSpace(body.DiscordUserId))
            {
                return ApiResults.Validation("inviteToken, username, password, and discordUserId are required.");
            }

            var auth = root.GetRequiredService<WebAuthService>();
            var err = auth.TryRegisterInvited(body.InviteToken, body.Username, body.Password, body.DiscordUserId);
            if (err != null)
                return err;

            return Results.Ok(new { ok = true, message = "User created. Sign in at POST /api/auth/login." });
        }).RequireRateLimiting("auth_account_write");

        app.MapPost("/api/auth/discord/start", async (HttpRequest http) =>
        {
            if (!WebAuthService.IsJwtSecretConfigured(WebAuthService.ReadJwtSecret()))
            {
                return ApiResults.BadRequest(
                    "Set HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes) before creating web users.",
                    "jwt_not_configured");
            }

            var body = await http.ReadFromJsonAsync<DiscordStartBody>();
            if (body is null || string.IsNullOrWhiteSpace(body.Intent))
                return ApiResults.Validation("intent is required: 'bootstrap' or 'register'.");

            var verify = root.GetRequiredService<WebAuthDiscordVerificationService>();
            var err = verify.TryStart(body.Intent.Trim(), out var res);
            if (err != null)
                return err;

            return Results.Ok(
                new
                {
                    sessionId = res!.SessionId,
                    code = res.Code,
                    expiresAt = res.ExpiresAt,
                    message =
                        "In your HomeBot Discord server, run /webui-verify and enter this code. Then return here to choose username and password.",
                });
        }).RequireRateLimiting("auth_account_write");

        app.MapGet("/api/auth/discord/status", (HttpRequest http) =>
        {
            var sessionId = http.Query["sessionId"].ToString();
            if (string.IsNullOrWhiteSpace(sessionId))
                return ApiResults.Validation("Query sessionId is required.");

            var verify = root.GetRequiredService<WebAuthDiscordVerificationService>();
            var st = verify.GetStatus(sessionId);
            return Results.Ok(
                new
                {
                    exists = st.Exists,
                    discordVerified = st.DiscordVerified,
                    consumed = st.Consumed,
                    expired = st.Expired,
                    expiresAt = st.ExpiresAt,
                });
        }).RequireRateLimiting("auth_discord_status_poll");

        app.MapPost("/api/auth/discord/complete-bootstrap", async (HttpRequest http) =>
        {
            if (!WebAuthService.IsJwtSecretConfigured(WebAuthService.ReadJwtSecret()))
            {
                return ApiResults.BadRequest(
                    "Set HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes) before creating web users.",
                    "jwt_not_configured");
            }

            var body = await http.ReadFromJsonAsync<DiscordCompleteBody>();
            if (body is null || string.IsNullOrWhiteSpace(body.SessionId) || string.IsNullOrWhiteSpace(body.Username) ||
                body.Password is null)
            {
                return ApiResults.Validation("sessionId, username, and password are required.");
            }

            var verify = root.GetRequiredService<WebAuthDiscordVerificationService>();
            var err = verify.TryCompleteBootstrap(body.SessionId, body.Username, body.Password);
            if (err != null)
                return err;

            return Results.Ok(new { ok = true, message = "First web user created. Sign in with your username and password." });
        }).RequireRateLimiting("auth_account_write");

        app.MapPost("/api/auth/discord/complete-register", async (HttpRequest http) =>
        {
            if (!WebAuthService.IsJwtSecretConfigured(WebAuthService.ReadJwtSecret()))
            {
                return ApiResults.BadRequest(
                    "Set HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes) before creating web users.",
                    "jwt_not_configured");
            }

            var body = await http.ReadFromJsonAsync<DiscordCompleteBody>();
            if (body is null || string.IsNullOrWhiteSpace(body.SessionId) || string.IsNullOrWhiteSpace(body.Username) ||
                body.Password is null)
            {
                return ApiResults.Validation("sessionId, username, and password are required.");
            }

            var verify = root.GetRequiredService<WebAuthDiscordVerificationService>();
            var err = verify.TryCompleteRegister(body.SessionId, body.Username, body.Password);
            if (err != null)
                return err;

            return Results.Ok(new { ok = true, message = "User created. Sign in with your username and password." });
        }).RequireRateLimiting("auth_account_write");

        app.MapPost("/api/auth/refresh", async (HttpRequest http) =>
        {
            if (!WebAuthService.IsJwtSecretConfigured(WebAuthService.ReadJwtSecret()))
            {
                return Results.Json(
                    new ApiErrorBody(
                        "Web login is not configured (set HOMEBOT_WEB_JWT_SECRET to at least 32 UTF-8 bytes).",
                        "service_unavailable"),
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            var body = await http.ReadFromJsonAsync<RefreshBody>();
            if (body is null || string.IsNullOrWhiteSpace(body.RefreshToken))
                return ApiResults.Validation("refreshToken is required.");

            var refreshSvc = root.GetRequiredService<WebRefreshTokenService>();
            var auth = root.GetRequiredService<WebAuthService>();

            if (!refreshSvc.TryPeekValid(body.RefreshToken.Trim(), out var u, out var d))
            {
                return Results.Json(
                    new ApiErrorBody("Invalid or expired refresh token.", "refresh_invalid"),
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            var jwt = auth.TryIssueJwtForWebUserByDiscordId(d);
            if (jwt is null || !string.Equals(jwt.Value.Username, u, StringComparison.OrdinalIgnoreCase))
            {
                refreshSvc.RevokePlain(body.RefreshToken.Trim());
                return Results.Json(
                    new ApiErrorBody("Account no longer exists or has changed.", "refresh_user_missing"),
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            refreshSvc.DeleteByPlain(body.RefreshToken.Trim());
            var (newR, rExp) = refreshSvc.IssueForUser(jwt.Value.Username, jwt.Value.DiscordUserId);
            var refreshTtl = (int)Math.Clamp((rExp - DateTimeOffset.UtcNow).TotalSeconds, 1, int.MaxValue);

            return Results.Ok(new WebAuthSessionResponse(
                jwt.Value.AccessToken,
                "Bearer",
                HomeBotJwtTokens.AccessTokenLifetimeSeconds,
                jwt.Value.Username,
                jwt.Value.DiscordUserId,
                newR,
                refreshTtl));
        }).RequireRateLimiting("auth_refresh");

        app.MapPost("/api/auth/logout", async (HttpRequest http) =>
        {
            var body = await http.ReadFromJsonAsync<LogoutBody>();
            if (body is null || string.IsNullOrWhiteSpace(body.RefreshToken))
                return ApiResults.Validation("refreshToken is required.");

            var refreshSvc = root.GetRequiredService<WebRefreshTokenService>();
            refreshSvc.RevokePlain(body.RefreshToken.Trim());
            return Results.Ok(new { ok = true });
        }).RequireRateLimiting("auth_refresh");

        app.MapGet("/api/auth/me", (HttpRequest http) =>
        {
            var authHeader = http.Headers.Authorization.ToString();
            const string prefix = "Bearer ";
            if (!authHeader.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return Results.Json(new ApiErrorBody("Missing bearer token.", "unauthorized"), statusCode: 401);
            }

            var token = authHeader[prefix.Length..].Trim();
            var secret = WebAuthService.ReadJwtSecret();
            if (!string.IsNullOrEmpty(staticApiToken) && string.Equals(token, staticApiToken, StringComparison.Ordinal))
                return Results.Ok(new MeResponse("apiToken", null, null));

            if (!WebAuthService.IsJwtSecretConfigured(secret))
                return Results.Json(new ApiErrorBody("Invalid or expired token.", "unauthorized"), statusCode: 401);

            if (!HomeBotJwtTokens.TryValidate(token, secret!, out var username, out var discordUserId))
            {
                return Results.Json(new ApiErrorBody("Invalid or expired token.", "unauthorized"), statusCode: 401);
            }

            return Results.Ok(new MeResponse("webUser", username, discordUserId));
        });
    }

    private sealed record LoginBody(string Username, string Password);

    private sealed record BootstrapBody(
        string Username,
        string Password,
        string DiscordUserId,
        string? SetupToken);

    private sealed record RegisterBody(string InviteToken, string Username, string Password, string DiscordUserId);

    private sealed record DiscordStartBody(string Intent);

    private sealed record DiscordCompleteBody(string SessionId, string Username, string Password);

    private sealed record RefreshBody(string RefreshToken);

    private sealed record LogoutBody(string RefreshToken);

    private sealed record MeResponse(string Kind, string? Username, string? DiscordUserId);
}
