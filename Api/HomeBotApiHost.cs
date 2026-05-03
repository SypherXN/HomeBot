using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

/// <summary>
/// Shared HTTP pipeline for the HomeBot API (used by <see cref="Program"/> and integration tests).
/// </summary>
public static class HomeBotApiHost
{
    public static string[] ResolveCorsOrigins()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_ALLOWED_ORIGINS");

        if (string.IsNullOrWhiteSpace(raw))
        {
            return new[] { "http://localhost:5173" };
        }

        return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
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
            if (!context.Request.Path.StartsWithSegments("/api"))
            {
                await next();
                return;
            }

            if (context.Request.Path.StartsWithSegments("/api/health") ||
                context.Request.Path.StartsWithSegments("/api/meta") ||
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
                context.Request.Path.StartsWithSegments("/api/auth/discord/complete-register");

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

        app.MapGet("/api/meta", () => Results.Ok(new
        {
            name = "HomeBot API",
            version = "phase3",
            features = new[] { "buy", "wishlist", "money", "calendar", "undo" },
            docs = "Authorization: Bearer accepts HOMEBOT_API_TOKEN and/or HS256 JWTs from POST /api/auth/login. Web sign-up: POST /api/auth/discord/start then /webui-verify in Discord, then complete-* . Mutations use query actorUserId=DISCORD_USER_ID where noted.",
            openApi = "/openapi/v1.json",
            restExamples = new
            {
                buy = "POST /api/buy/items?actorUserId=…",
                wishlist = "POST /api/wishlist/items?actorUserId=…",
                moneyExpense = "POST /api/money/expenses",
                moneyPayment = "POST /api/money/payments",
                moneySplit = "POST /api/money/expenses/split",
                calendar = "POST /api/calendar/items",
                undo = "POST /api/undo?actorUserId=…"
            }
        }));

        HomeBotApiPhase3.MapOpenApiDocument(app);

        app.MapHomeBotAuthApi(root, apiToken);
        app.MapHomeBotApi(root);
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
