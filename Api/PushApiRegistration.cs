using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

public static class PushApiRegistration
{
    public static void MapPushApi(this WebApplication app, IServiceProvider root)
    {
        app.MapGet("/api/push/vapid-public-key", () =>
            Results.Ok(root.GetRequiredService<WebPushService>().GetPublicConfig()));

        var w = app.MapGroup("/api/push").RequireRateLimiting("mutation");

        w.MapPost("/subscribe", (HttpRequest http, PushSubscriptionRequest? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("body required.", "missing_body");
            if (!PolishApiRegistration.TryDiscordUserFromJwt(http, root, out var did) ||
                !ulong.TryParse(did, out var uid))
                return ApiResults.BadRequest("JWT with discord user required.", "jwt_required");
            if (!root.GetRequiredService<WebPushService>().IsConfigured())
                return ApiResults.BadRequest("Web Push not configured on server.", "push_not_configured");
            try
            {
                root.GetRequiredService<WebPushService>().SaveSubscription(uid, body);
                return Results.Ok(new { ok = true });
            }
            catch (ArgumentException ex)
            {
                return ApiResults.BadRequest(ex.Message, "invalid_subscription");
            }
        });

        w.MapPost("/unsubscribe", (HttpRequest http, PushUnsubscribeRequest? body) =>
        {
            if (body is null || string.IsNullOrWhiteSpace(body.Endpoint))
                return ApiResults.BadRequest("endpoint required.", "missing_body");
            if (!PolishApiRegistration.TryDiscordUserFromJwt(http, root, out var did) ||
                !ulong.TryParse(did, out var uid))
                return ApiResults.BadRequest("JWT required.", "jwt_required");
            root.GetRequiredService<WebPushService>().RemoveSubscription(uid, body.Endpoint);
            return Results.Ok(new { ok = true });
        });
    }
}

public sealed class PushUnsubscribeRequest
{
    public string Endpoint { get; set; } = "";
}
