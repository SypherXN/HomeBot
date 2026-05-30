using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

public static class GoogleCalendarApiRegistration
{
    public static void MapGoogleCalendarApi(this WebApplication app, IServiceProvider root)
    {
        app.MapGet("/api/calendar/google/status", (HttpRequest http) =>
        {
            if (!TryDiscordUserFromJwt(http, root, out var did))
                return ApiResults.BadRequest("JWT required with discord user.", "jwt_required");
            var oauth = root.GetRequiredService<GoogleCalendarOAuthService>();
            var conn = oauth.GetConnection(did);
            return Results.Ok(new
            {
                configured = oauth.IsConfigured(),
                connected = conn != null,
                connection = conn,
            });
        });

        app.MapGet("/api/calendar/google/oauth/url", (HttpRequest http) =>
        {
            if (!TryDiscordUserFromJwt(http, root, out var did))
                return ApiResults.BadRequest("JWT required.", "jwt_required");
            var oauth = root.GetRequiredService<GoogleCalendarOAuthService>();
            var err = oauth.TryGetAuthorizeUrl(did, out var url);
            return err ?? Results.Ok(new { url });
        });

        app.MapGet("/api/calendar/google/oauth/callback", async (HttpRequest http) =>
        {
            var code = http.Query["code"].ToString();
            var state = http.Query["state"].ToString();
            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
                return ApiResults.BadRequest("code and state required.", "missing_oauth_params");

            var oauth = root.GetRequiredService<GoogleCalendarOAuthService>();
            var err = await oauth.TryHandleCallbackAsync(code, state);
            if (err != null)
                return err;

            var frontend = Environment.GetEnvironmentVariable("HOMEBOT_WEB_OAUTH_FRONTEND_URL")?.Trim()
                ?? "http://localhost:5173";
            return Results.Redirect($"{frontend.TrimEnd('/')}/calendar?google=connected");
        });

        var w = app.MapGroup("/api/calendar/google").RequireRateLimiting("mutation");

        w.MapPost("/disconnect", (HttpRequest http) =>
        {
            if (!TryDiscordUserFromJwt(http, root, out var did))
                return ApiResults.BadRequest("JWT required.", "jwt_required");
            root.GetRequiredService<GoogleCalendarOAuthService>().Disconnect(did);
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/sync", async (HttpRequest http) =>
        {
            if (!TryDiscordUserFromJwt(http, root, out var did))
                return ApiResults.BadRequest("JWT required.", "jwt_required");
            var oauth = root.GetRequiredService<GoogleCalendarOAuthService>();
            var conn = oauth.GetConnection(did);
            if (conn == null)
                return ApiResults.BadRequest("Not connected.", "not_connected");
            await root.GetRequiredService<GoogleCalendarSyncService>().SyncConnectionAsync(conn);
            return Results.Ok(new { ok = true });
        });

        w.MapGet("/calendars", async (HttpRequest http) =>
        {
            if (!TryDiscordUserFromJwt(http, root, out var did))
                return ApiResults.BadRequest("JWT required.", "jwt_required");
            try
            {
                var calendars = await root.GetRequiredService<GoogleCalendarOAuthService>().ListCalendarsAsync(did);
                return Results.Ok(new { calendars });
            }
            catch (InvalidOperationException ex)
            {
                return ApiResults.BadRequest(ex.Message, "not_connected");
            }
        });

        w.MapPut("/calendar", (HttpRequest http, GoogleCalendarPickRequest? body) =>
        {
            if (!TryDiscordUserFromJwt(http, root, out var did))
                return ApiResults.BadRequest("JWT required.", "jwt_required");
            if (body is null || string.IsNullOrWhiteSpace(body.CalendarId))
                return ApiResults.BadRequest("calendarId required.", "missing_body");
            try
            {
                root.GetRequiredService<GoogleCalendarOAuthService>().SetCalendarId(did, body.CalendarId);
                return Results.Ok(new { ok = true, calendarId = body.CalendarId.Trim() });
            }
            catch (InvalidOperationException ex)
            {
                return ApiResults.BadRequest(ex.Message, "not_connected");
            }
        });
    }

    private static bool TryDiscordUserFromJwt(HttpRequest http, IServiceProvider root, out string discordUserId)
    {
        discordUserId = "";
        const string prefix = "Bearer ";
        var auth = http.Headers.Authorization.ToString();
        if (!auth.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return false;
        var token = auth[prefix.Length..].Trim();
        var secret = WebAuthService.ReadJwtSecret();
        if (!WebAuthService.IsJwtSecretConfigured(secret))
            return false;
        return HomeBotJwtTokens.TryValidate(token, secret!, out _, out discordUserId);
    }
}

public sealed class GoogleCalendarPickRequest
{
    public string CalendarId { get; set; } = "";
}
