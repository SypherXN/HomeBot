using System.Collections.Generic;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

/// <summary>
/// Shared HTTP pipeline for the HomeBot API (used by <see cref="Program"/> and integration tests).
/// </summary>
public static class HomeBotApiHost
{
    /// <summary>
    /// CORS origins from <c>HOMEBOT_ALLOWED_ORIGINS</c> (or dev default), plus the origin of
    /// <c>HOMEBOT_WEB_OAUTH_FRONTEND_URL</c> when it parses as http(s) so browser OAuth + API calls work without
    /// manually duplicating the SPA URL in both env vars.
    /// </summary>
    public static string[] ResolveCorsOrigins()
    {
        var set = new HashSet<string>(StringComparer.Ordinal);

        foreach (var o in EnumerateEnvAllowedOrigins())
        {
            var n = NormalizeOriginString(o);
            if (n.Length > 0)
                _ = set.Add(n);
        }

        if (TryGetOAuthSpaOrigin(out var spaOrigin))
        {
            if (set.Add(spaOrigin))
            {
                Console.WriteLine(
                    $"ℹ️ CORS: added SPA origin from HOMEBOT_WEB_OAUTH_FRONTEND_URL ({spaOrigin}). " +
                    "Set HOMEBOT_ALLOWED_ORIGINS explicitly if you need a fixed list.");
            }
        }

        return set.Count > 0 ? set.ToArray() : new[] { "http://localhost:5173" };
    }

    private static IEnumerable<string> EnumerateEnvAllowedOrigins()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_ALLOWED_ORIGINS");

        if (string.IsNullOrWhiteSpace(raw))
        {
            yield return "http://localhost:5173";
            yield break;
        }

        foreach (var part in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            yield return part;
    }

    private static string NormalizeOriginString(string value)
    {
        var v = value.Trim();
        if (v.Length == 0)
            return v;
        return v.TrimEnd('/');
    }

    /// <summary>
    /// Browser "origin" (scheme + host + port) for the configured OAuth return URL base.
    /// </summary>
    public static bool TryGetOAuthSpaOrigin(out string origin)
    {
        origin = "";
        var baseUrl = DiscordOAuthService.ReadFrontendBase().Trim();
        if (string.IsNullOrEmpty(baseUrl))
            return false;

        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri))
            return false;

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            return false;

        origin = $"{uri.Scheme}://{uri.Authority}";
        return true;
    }

    /// <summary>
    /// One-shot console hints for common misconfiguration when the API is enabled.
    /// </summary>
    public static void LogOperationalWarnings()
    {
        var apiToken = Environment.GetEnvironmentVariable("HOMEBOT_API_TOKEN")?.Trim() ?? "";
        var jwt = WebAuthService.ReadJwtSecret();
        if (string.IsNullOrWhiteSpace(apiToken) && !WebAuthService.IsJwtSecretConfigured(jwt))
        {
            Console.WriteLine(
                "⚠️ Operational: neither HOMEBOT_API_TOKEN nor HOMEBOT_WEB_JWT_SECRET (32+ bytes) is set — " +
                "protected /api routes will return 503 until at least one is configured.");
        }

        var id = DiscordOAuthService.ReadClientId();
        var secret = DiscordOAuthService.ReadClientSecret();
        var redirect = DiscordOAuthService.ReadRedirectUri();
        var parts = (string.IsNullOrEmpty(id) ? 0 : 1) + (string.IsNullOrEmpty(secret) ? 0 : 1) +
                    (string.IsNullOrEmpty(redirect) ? 0 : 1);
        if (parts is > 0 and < 3)
        {
            Console.WriteLine(
                "⚠️ Operational: Discord OAuth env is incomplete — set all of HOMEBOT_DISCORD_OAUTH_CLIENT_ID, " +
                "HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET, and HOMEBOT_DISCORD_OAUTH_REDIRECT_URI together (or clear them).");
        }

        if (parts == 3 && !WebAuthService.IsJwtSecretConfigured(jwt))
        {
            Console.WriteLine(
                "⚠️ Operational: Discord OAuth is fully configured but HOMEBOT_WEB_JWT_SECRET is missing or too short — " +
                "OAuth sign-in cannot issue JWTs until JWT is configured.");
        }

        if (parts == 3 && !string.IsNullOrWhiteSpace(redirect))
        {
            if (!Uri.TryCreate(redirect, UriKind.Absolute, out var ru))
            {
                Console.WriteLine(
                    "⚠️ Operational: HOMEBOT_DISCORD_OAUTH_REDIRECT_URI should be an absolute URL " +
                    "(e.g. https://api.example.com/api/auth/discord/oauth/callback).");
            }
            else if (ru.Scheme != Uri.UriSchemeHttp && ru.Scheme != Uri.UriSchemeHttps)
            {
                Console.WriteLine("⚠️ Operational: HOMEBOT_DISCORD_OAUTH_REDIRECT_URI must use http or https.");
            }
        }

        if (TryGetOAuthSpaOrigin(out var spa) && parts == 3)
        {
            var inList = false;
            foreach (var o in EnumerateEnvAllowedOrigins())
            {
                if (string.Equals(NormalizeOriginString(o), spa, StringComparison.Ordinal))
                {
                    inList = true;
                    break;
                }
            }

            var rawOrigins = Environment.GetEnvironmentVariable("HOMEBOT_ALLOWED_ORIGINS");
            if (!string.IsNullOrWhiteSpace(rawOrigins) && !inList)
            {
                Console.WriteLine(
                    $"ℹ️ Operational: HOMEBOT_ALLOWED_ORIGINS did not include the OAuth SPA origin ({spa}); " +
                    "it was merged into the CORS policy automatically for this process.");
            }
        }
    }

    /// <summary>
    /// In non-development environments, refuses to start the API when Discord OAuth environment variables
    /// are only partly set (avoids a half-configured production that fails unpredictably at OAuth time).
    /// Set <c>HOMEBOT_ALLOW_PARTIAL_OAUTH_ENV=true</c> to skip this check.
    /// </summary>
    public static void ValidateAuthEnvironmentForHosting(IHostEnvironment env)
    {
        if (env.IsDevelopment())
            return;

        if (string.Equals(
                Environment.GetEnvironmentVariable("HOMEBOT_ALLOW_PARTIAL_OAUTH_ENV"),
                "true",
                StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var id = DiscordOAuthService.ReadClientId();
        var secret = DiscordOAuthService.ReadClientSecret();
        var redirect = DiscordOAuthService.ReadRedirectUri();
        var parts = (string.IsNullOrEmpty(id) ? 0 : 1) + (string.IsNullOrEmpty(secret) ? 0 : 1) +
                    (string.IsNullOrEmpty(redirect) ? 0 : 1);
        if (parts is > 0 and < 3)
        {
            throw new InvalidOperationException(
                "Discord OAuth environment is incomplete (non-development): set all of HOMEBOT_DISCORD_OAUTH_CLIENT_ID, " +
                "HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET, and HOMEBOT_DISCORD_OAUTH_REDIRECT_URI, or unset all three. " +
                "To allow partial config anyway, set HOMEBOT_ALLOW_PARTIAL_OAUTH_ENV=true.");
        }
    }

    /// <summary>
    /// Registers CORS, optional HTTPS middleware, bearer gate, health/meta, and feature routes.
    /// </summary>
    public static void Configure(WebApplication app, IServiceProvider root, string apiToken)
    {
        HomeBotApiPhase3.UseApiExceptionHandling(app);
        HomeBotApiPhase3.UseApiHttpLogging(app);

        app.UseCors("WebUiOrigins");

        if (!app.Environment.IsDevelopment())
        {
            app.UseHsts();
            app.UseHttpsRedirection();
        }

        app.UseRateLimiter();

        HomeBotApiPhase3.UseApiMaxPayloadContentLengthGuard(app);

        app.Use(async (context, next) =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                var mut = context.Request.Method is "POST" or "PUT" or "PATCH" or "DELETE";
                OpsMetricsService.RecordRequest(mut);
            }

            if (!context.Request.Path.StartsWithSegments("/api"))
            {
                await next();
                return;
            }

            if (context.Request.Path.StartsWithSegments("/api/health") ||
                context.Request.Path.StartsWithSegments("/api/meta") ||
                context.Request.Path.StartsWithSegments("/api/push/vapid-public-key") ||
                context.Request.Path.StartsWithSegments("/api/hooks") ||
                context.Request.Path.StartsWithSegments("/openapi"))
            {
                await next();
                return;
            }

            var isAuthPublic =
                context.Request.Path.StartsWithSegments("/api/auth/login") ||
                context.Request.Path.StartsWithSegments("/api/auth/bootstrap") ||
                context.Request.Path.StartsWithSegments("/api/auth/register") ||
                context.Request.Path.StartsWithSegments("/api/auth/discord/start") ||
                context.Request.Path.StartsWithSegments("/api/auth/discord/status") ||
                context.Request.Path.StartsWithSegments("/api/auth/discord/complete-bootstrap") ||
                context.Request.Path.StartsWithSegments("/api/auth/discord/complete-register") ||
                context.Request.Path.StartsWithSegments("/api/auth/discord/oauth/url") ||
                context.Request.Path.StartsWithSegments("/api/auth/discord/oauth/callback") ||
                context.Request.Path.StartsWithSegments("/api/auth/discord/oauth/consume") ||
                context.Request.Path.StartsWithSegments("/api/calendar/google/oauth/callback") ||
                context.Request.Path.StartsWithSegments("/api/auth/refresh") ||
                context.Request.Path.StartsWithSegments("/api/auth/logout");

            if (isAuthPublic)
            {
                await next();
                return;
            }

            var jwtSecret = WebAuthService.ReadJwtSecret();
            var jwtOk = WebAuthService.IsJwtSecretConfigured(jwtSecret);
            var staticOk = !string.IsNullOrWhiteSpace(apiToken);

            if (!staticOk && !jwtOk)
            {
                context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                await context.Response.WriteAsJsonAsync(
                    new ApiErrorBody(
                        "API authentication not configured: set HOMEBOT_API_TOKEN and/or HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes).",
                        "service_unavailable"));
                return;
            }

            var authHeader = context.Request.Headers.Authorization.ToString();
            const string prefix = "Bearer ";

            if (!authHeader.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(
                    new ApiErrorBody("Missing bearer token.", "unauthorized"));
                return;
            }

            var token = authHeader[prefix.Length..].Trim();
            var accepted = false;
            if (staticOk && string.Equals(token, apiToken, StringComparison.Ordinal))
                accepted = true;
            else if (jwtOk && HomeBotJwtTokens.TryValidate(token, jwtSecret!, out _, out _))
                accepted = true;

            if (!accepted)
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(
                    new ApiErrorBody("Invalid token.", "unauthorized"));
                return;
            }

            await next();
        });

        app.MapGet("/api/health", () => Results.Ok(new
        {
            status = "ok",
            service = "homebot-api",
            timestamp = DateTimeOffset.UtcNow
        }));

        app.MapGet("/api/meta", (HttpContext ctx) =>
        {
            var backup = root.GetRequiredService<BackupStatsService>().GetLocalBackupStats();
            return Results.Ok(new
            {
                name = "HomeBot API",
                version = "phase3",
                features = new[]
                {
                    "buy", "wishlist", "money", "budget", "calendar", "undo",
                    "search", "webhooks", "household-report", "buy-recurring", "web-admin",
                },
                docs = "Authorization: Bearer accepts HOMEBOT_API_TOKEN and/or HS256 JWTs from POST /api/auth/login (short-lived access) plus POST /api/auth/refresh with refreshToken for browser sessions. Web sign-up: POST /api/auth/discord/start then /webui-verify in Discord, then complete-* . Mutations use query actorUserId=DISCORD_USER_ID where noted.",
                openApi = "/openapi/v1.json",
                backups = backup,
                restExamples = new
                {
                    buy = "POST /api/buy/items?actorUserId=…",
                    wishlist = "POST /api/wishlist/items?actorUserId=…",
                    moneyExpense = "POST /api/money/expenses",
                    moneyPayment = "POST /api/money/payments",
                    moneySplit = "POST /api/money/expenses/split",
                    moneyBalances = "GET /api/money/balances?userId=…",
                    search = "GET /api/search?q=…",
                    calendar = "POST /api/calendar/items",
                    undo = "POST /api/undo?actorUserId=…",
                    webhookBuy = "POST /api/hooks/buy/add?actorUserId=… (X-HomeBot-Webhook-Secret)",
                    householdReport = "GET /api/household/report?month=YYYY-MM",
                }
            });
        });

        HomeBotApiPhase3.MapOpenApiDocument(app);

        app.MapHomeBotDiscordOAuthApi(root);
        app.MapHomeBotAuthApi(root, apiToken);
        app.MapHomeBotApi(root);
        app.MapMediumFeaturesApi(root, apiToken);
        app.MapPolishApi(root);
        app.MapOpsApi(root, apiToken);
        app.MapMealPlanningApi(root);
        app.MapGoogleCalendarApi(root);
        app.MapPushApi(root);
    }

    /// <summary>
    /// Registers the CORS policy used by <see cref="Configure"/>.
    /// </summary>
    public static void AddApiCors(WebApplicationBuilder builder)
    {
        var allowedOrigins = ResolveCorsOrigins();

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("WebUiOrigins", policy =>
            {
                policy.WithOrigins(allowedOrigins)
                    .AllowAnyHeader()
                    .AllowAnyMethod();
            });
        });
    }
}
