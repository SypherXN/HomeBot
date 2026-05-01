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

    /// <summary>
    /// Registers rate limiting, Kestrel body limit, OpenAPI, and HTTP logging.
    /// Pass explicit <paramref name="maxRequestBodyBytes"/> / <paramref name="mutationPermitsPerMinute"/> in tests; omit to use environment (see <see cref="ResolveMaxRequestBodyBytes"/> / <see cref="ResolveMutationPermitLimit"/>).
    /// </summary>
    public static void AddPhase3Services(
        this WebApplicationBuilder builder,
        long? maxRequestBodyBytes = null,
        int? mutationPermitsPerMinute = null)
    {
        var maxBody = maxRequestBodyBytes ?? ResolveMaxRequestBodyBytes();
        builder.Services.Configure<KestrelServerOptions>(o =>
        {
            o.Limits.MaxRequestBodySize = maxBody;
        });

        var mutationPermits = mutationPermitsPerMinute ?? ResolveMutationPermitLimit();
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
