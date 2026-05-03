using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpLogging;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

/// <summary>
/// Phase 3: rate limits, body size, OpenAPI, production-safe errors, request logging.
/// </summary>
public static class HomeBotApiPhase3
{
    /// <summary>Default max JSON body size for API requests (bytes).</summary>
    public const long DefaultMaxRequestBodyBytes = 64 * 1024;

    /// <summary>Default mutation POST/PUT/PATCH/DELETE allowed per IP per minute.</summary>
    public const int DefaultMutationPermitLimitPerMinute = 200;

    /// <summary>Default POST <c>/api/auth/login</c> attempts per client IP per minute.</summary>
    public const int DefaultAuthLoginPerMinute = 30;

    /// <summary>Default POST <c>/api/auth/discord/oauth/consume</c> per client IP per minute.</summary>
    public const int DefaultOauthConsumePerMinute = 15;

    /// <summary>Default GET OAuth URL + callback hits per client IP per minute (combined policy).</summary>
    public const int DefaultOauthBrowserPerMinute = 48;

    /// <summary>Default combined POST bootstrap/register/discord start/complete-* per client IP per minute.</summary>
    public const int DefaultAuthAccountWritePerMinute = 24;

    /// <summary>Default GET <c>/api/auth/discord/status</c> polls per client IP per minute.</summary>
    public const int DefaultDiscordStatusPollPerMinute = 120;

    /// <summary>Default POST <c>/api/auth/refresh</c> and <c>/api/auth/logout</c> per client IP per minute.</summary>
    public const int DefaultAuthRefreshPerMinute = 36;

    /// <summary>
    /// Reads <c>HOMEBOT_API_MAX_BODY_BYTES</c> or <paramref name="defaultBytes"/>.
    /// </summary>
    public static long ResolveMaxRequestBodyBytes(long defaultBytes = DefaultMaxRequestBodyBytes)
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_API_MAX_BODY_BYTES");
        if (long.TryParse(raw, out var n) && n > 0)
            return n;
        return defaultBytes;
    }

    /// <summary>
    /// Reads <c>HOMEBOT_API_MUTATION_PERMIT_LIMIT</c> or <paramref name="defaultPermits"/>.
    /// </summary>
    public static int ResolveMutationPermitLimit(int defaultPermits = DefaultMutationPermitLimitPerMinute)
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_API_MUTATION_PERMIT_LIMIT");
        if (int.TryParse(raw, out var n) && n > 0)
            return n;
        return defaultPermits;
    }

    /// <summary>Reads <c>HOMEBOT_API_AUTH_LOGIN_PER_MINUTE</c> or default.</summary>
    public static int ResolveAuthLoginPerMinute(int defaultPerMinute = DefaultAuthLoginPerMinute)
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_API_AUTH_LOGIN_PER_MINUTE");
        if (int.TryParse(raw, out var n) && n > 0)
            return n;
        return defaultPerMinute;
    }

    /// <summary>Reads <c>HOMEBOT_API_OAUTH_CONSUME_PER_MINUTE</c> or default.</summary>
    public static int ResolveOauthConsumePerMinute(int defaultPerMinute = DefaultOauthConsumePerMinute)
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_API_OAUTH_CONSUME_PER_MINUTE");
        if (int.TryParse(raw, out var n) && n > 0)
            return n;
        return defaultPerMinute;
    }

    /// <summary>Reads <c>HOMEBOT_API_OAUTH_BROWSER_PER_MINUTE</c> or default.</summary>
    public static int ResolveOauthBrowserPerMinute(int defaultPerMinute = DefaultOauthBrowserPerMinute)
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_API_OAUTH_BROWSER_PER_MINUTE");
        if (int.TryParse(raw, out var n) && n > 0)
            return n;
        return defaultPerMinute;
    }

    /// <summary>Reads <c>HOMEBOT_API_AUTH_ACCOUNT_WRITE_PER_MINUTE</c> or default.</summary>
    public static int ResolveAuthAccountWritePerMinute(int defaultPerMinute = DefaultAuthAccountWritePerMinute)
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_API_AUTH_ACCOUNT_WRITE_PER_MINUTE");
        if (int.TryParse(raw, out var n) && n > 0)
            return n;
        return defaultPerMinute;
    }

    /// <summary>Reads <c>HOMEBOT_API_DISCORD_STATUS_POLL_PER_MINUTE</c> or default.</summary>
    public static int ResolveDiscordStatusPollPerMinute(int defaultPerMinute = DefaultDiscordStatusPollPerMinute)
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_API_DISCORD_STATUS_POLL_PER_MINUTE");
        if (int.TryParse(raw, out var n) && n > 0)
            return n;
        return defaultPerMinute;
    }

    /// <summary>Reads <c>HOMEBOT_API_AUTH_REFRESH_PER_MINUTE</c> or default.</summary>
    public static int ResolveAuthRefreshPerMinute(int defaultPerMinute = DefaultAuthRefreshPerMinute)
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_API_AUTH_REFRESH_PER_MINUTE");
        if (int.TryParse(raw, out var n) && n > 0)
            return n;
        return defaultPerMinute;
    }

    /// <summary>
    /// Registers rate limiting, Kestrel body limit, OpenAPI, and HTTP logging.
    /// Pass explicit limits in tests; omit to use environment (see <see cref="ResolveMaxRequestBodyBytes"/> / <see cref="ResolveMutationPermitLimit"/> and auth resolver methods).
    /// </summary>
    public static void AddPhase3Services(
        this WebApplicationBuilder builder,
        long? maxRequestBodyBytes = null,
        int? mutationPermitsPerMinute = null,
        int? authLoginPerMinute = null,
        int? oauthConsumePerMinute = null,
        int? oauthBrowserPerMinute = null,
        int? authAccountWritePerMinute = null,
        int? discordStatusPollPerMinute = null,
        int? authRefreshPerMinute = null)
    {
        var maxBody = maxRequestBodyBytes ?? ResolveMaxRequestBodyBytes();
        builder.Services.Configure<KestrelServerOptions>(o =>
        {
            o.Limits.MaxRequestBodySize = maxBody;
        });

        var mutationPermits = mutationPermitsPerMinute ?? ResolveMutationPermitLimit();
        var loginPermits = authLoginPerMinute ?? ResolveAuthLoginPerMinute();
        var consumePermits = oauthConsumePerMinute ?? ResolveOauthConsumePerMinute();
        var browserPermits = oauthBrowserPerMinute ?? ResolveOauthBrowserPerMinute();
        var accountWritePermits = authAccountWritePerMinute ?? ResolveAuthAccountWritePerMinute();
        var statusPollPermits = discordStatusPollPerMinute ?? ResolveDiscordStatusPollPerMinute();
        var refreshPermits = authRefreshPerMinute ?? ResolveAuthRefreshPerMinute();

        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (context, token) =>
            {
                context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                    context.HttpContext.Response.Headers.RetryAfter = ((int)retryAfter.TotalSeconds).ToString();

                await context.HttpContext.Response.WriteAsJsonAsync(
                    new ApiErrorBody("Too many requests. Try again later.", "rate_limited"),
                    cancellationToken: token);
            };

            options.AddPolicy("mutation", httpContext =>
            {
                var partitionKey = httpContext.Connection.RemoteIpAddress?.ToString()
                    ?? httpContext.Connection.Id;

                return RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey,
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = mutationPermits,
                        Window = TimeSpan.FromMinutes(1),
                        QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                        QueueLimit = 0
                    });
            });

            AddIpFixedWindowPolicy(options, "auth_login", loginPermits);
            AddIpFixedWindowPolicy(options, "auth_oauth_consume", consumePermits);
            AddIpFixedWindowPolicy(options, "auth_oauth_browser", browserPermits);
            AddIpFixedWindowPolicy(options, "auth_account_write", accountWritePermits);
            AddIpFixedWindowPolicy(options, "auth_discord_status_poll", statusPollPermits);
            AddIpFixedWindowPolicy(options, "auth_refresh", refreshPermits);
        });

        builder.Services.AddOpenApi();

        builder.Services.AddHttpLogging(o =>
        {
            o.LoggingFields = HttpLoggingFields.RequestMethod
                | HttpLoggingFields.RequestPath
                | HttpLoggingFields.ResponseStatusCode
                | HttpLoggingFields.Duration;
            o.RequestBodyLogLimit = 0;
            o.ResponseBodyLogLimit = 0;
        });
    }

    private static void AddIpFixedWindowPolicy(RateLimiterOptions options, string name, int permitsPerMinute)
    {
        options.AddPolicy(
            name,
            httpContext =>
            {
                var partitionKey = httpContext.Connection.RemoteIpAddress?.ToString()
                    ?? httpContext.Connection.Id;

                return RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey,
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = permitsPerMinute,
                        Window = TimeSpan.FromMinutes(1),
                        QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                        QueueLimit = 0,
                    });
            });
    }

    /// <summary>
    /// Development: developer exception page. Production: JSON <see cref="ApiErrorBody"/> and server-side logging (no stack in response).
    /// </summary>
    public static void UseApiExceptionHandling(this WebApplication app)
    {
        if (app.Environment.IsDevelopment())
            app.UseDeveloperExceptionPage();
        else
        {
            app.UseExceptionHandler(errorApp =>
            {
                errorApp.Run(async context =>
                {
                    var feature = context.Features.Get<IExceptionHandlerFeature>();
                    var logger = context.RequestServices.GetRequiredService<ILoggerFactory>()
                        .CreateLogger("HomeBot.Api");
                    if (feature?.Error is { } ex)
                        logger.LogError(ex, "Unhandled exception for {Method} {Path}", context.Request.Method, context.Request.Path);

                    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                    await context.Response.WriteAsJsonAsync(
                        new ApiErrorBody("An unexpected error occurred.", "internal_error"));
                });
            });
        }
    }

    /// <summary>
    /// Structured request logging without bodies or Authorization (see <see cref="HttpLoggingOptions"/>).
    /// </summary>
    public static void UseApiHttpLogging(this WebApplication app) => app.UseHttpLogging();

    /// <summary>
    /// When <see cref="KestrelServerOptions.Limits.MaxRequestBodySize"/> is set and the client sends <c>Content-Length</c>,
    /// rejects oversize requests with 413 before the body is read (consistent under TestServer and Kestrel).
    /// </summary>
    public static void UseApiMaxPayloadContentLengthGuard(this WebApplication app)
    {
        app.Use(async (context, next) =>
        {
            if (!context.Request.Path.StartsWithSegments("/api"))
            {
                await next();
                return;
            }

            var max = context.RequestServices
                .GetRequiredService<IOptions<KestrelServerOptions>>()
                .Value.Limits.MaxRequestBodySize;

            if (max is > 0 &&
                context.Request.ContentLength is { } len &&
                len > max)
            {
                context.Response.StatusCode = StatusCodes.Status413RequestEntityTooLarge;
                await context.Response.WriteAsJsonAsync(
                    new ApiErrorBody("Request body too large.", "payload_too_large"));
                return;
            }

            await next();
        });
    }

    /// <summary>
    /// OpenAPI document (schema only; no secrets). Path: <c>/openapi/v1.json</c>.
    /// </summary>
    public static void MapOpenApiDocument(this WebApplication app) =>
        app.MapOpenApi("/openapi/v1.json");
}
