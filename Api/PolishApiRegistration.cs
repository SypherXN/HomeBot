using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

/// <summary>Household audit log, notification preferences, expanded webhooks.</summary>
public static class PolishApiRegistration
{
    public static void MapPolishApi(this WebApplication app, IServiceProvider root)
    {
        app.MapGet("/api/audit/household", (HttpRequest request) =>
        {
            var limit = 100;
            if (int.TryParse(request.Query["limit"], out var lim))
                limit = lim;
            return Results.Ok(new { entries = root.GetRequiredService<HouseholdAuditService>().GetRecent(limit) });
        });

        app.MapGet("/api/notifications/preferences", (HttpRequest http) =>
        {
            if (!TryDiscordUserFromJwt(http, root, out var did) || !ulong.TryParse(did, out var uid))
                return ApiResults.BadRequest("JWT with discord user required.", "jwt_required");
            return Results.Ok(root.GetRequiredService<NotificationPreferencesService>().Get(uid));
        });

        var w = app.MapGroup("/api").RequireRateLimiting("mutation");

        w.MapPut("/notifications/preferences", (HttpRequest http, NotificationPreferencesModel? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("body required.", "missing_body");
            if (!TryDiscordUserFromJwt(http, root, out var did))
                return ApiResults.BadRequest("JWT required.", "jwt_required");
            body.DiscordUserId = did;
            root.GetRequiredService<NotificationPreferencesService>().Save(body);
            return Results.Ok(new { ok = true });
        });

        WebhooksApiRegistration.MapWebhooks(w, root);
    }

    internal static bool TryDiscordUserFromJwt(HttpRequest http, IServiceProvider root, out string discordUserId)
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

public static class WebhooksApiRegistration
{
    public static void MapWebhooks(RouteGroupBuilder w, IServiceProvider root)
    {
        w.MapPost("/hooks/buy/add", async (HttpRequest http, BuyItemCreateRequest? body) =>
            await HandleBuyAdd(http, body, root));

        w.MapPost("/hooks/calendar/add", async (HttpRequest http, CalendarItemCreateRequest? body) =>
        {
            if (!TryWebhookSecret(http, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.Title))
                return ApiResults.BadRequest("title required.", "missing_body");
            if (!MediumFeaturesApiRegistration.TryActorPublic(http.Query, out var actor, out var actorErr))
                return actorErr!;

            var config = root.GetRequiredService<ConfigService>();
            var tz = config.Get("timezone") ?? "UTC";
            root.GetRequiredService<CalendarService>().AddItem(
                body.Title!,
                "event",
                body.Start ?? DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm"),
                body.End ?? "",
                body.AllDay,
                body.Reminder ?? "",
                body.AssignedToUserId,
                body.Description ?? "",
                body.Notes ?? "",
                body.Link ?? "",
                body.Recurrence ?? "",
                body.Timezone ?? tz);

            var calId = GetLastCalendarItemId(root);
            if (calId > 0)
                root.GetRequiredService<GoogleCalendarSyncService>().MarkPendingPush(calId);

            await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
                "calendar",
                $"📅 **Calendar** (webhook): added **{DiscordNotifyText.SanitizeInline(body.Title)}**");
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/hooks/budget/expense", async (HttpRequest http, BudgetTransactionCreateRequest? body) =>
        {
            if (!TryWebhookSecret(http, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.AmountInput))
                return ApiResults.BadRequest("amountInput required.", "missing_body");
            if (!MediumFeaturesApiRegistration.TryActorPublic(http.Query, out var actor, out var actorErr))
                return actorErr!;
            if (body.SpentByUserId == 0)
                body.SpentByUserId = actor;

            var budget = root.GetRequiredService<BudgetService>();
            var id = budget.CreateTransaction(
                body.Type ?? "expense",
                body.AmountInput,
                body.CategoryId,
                body.SpentByUserId,
                body.TransactionDate ?? DateTime.UtcNow.ToString("yyyy-MM-dd"),
                body.Note,
                body.ReceiptUrl,
                body.Merchant,
                body.AccountId,
                body.IsPending,
                body.Currency ?? "USD",
                body.ExchangeRateToHome <= 0 ? 1 : body.ExchangeRateToHome,
                body.Splits,
                body.Tags,
                actor);

            await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
                "budget",
                $"💳 **Budget** (webhook): logged expense #{id}");
            return Results.Ok(new { ok = true, id });
        });
    }

    private static async Task<IResult> HandleBuyAdd(HttpRequest http, BuyItemCreateRequest? body, IServiceProvider root)
    {
        if (!TryWebhookSecret(http, out var err))
            return err!;
        if (body is null || string.IsNullOrWhiteSpace(body.Name))
            return ApiResults.BadRequest("name required.", "missing_body");
        if (!MediumFeaturesApiRegistration.TryActorPublic(http.Query, out var actor, out var actorErr))
            return actorErr!;

        root.GetRequiredService<BuyService>().AddItem(
            body.Name,
            body.Quantity ?? "",
            body.Store ?? "",
            body.AssignedTo,
            body.Tags ?? "",
            body.Notes ?? "",
            actor);

        await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
            "buy",
            $"🛒 **Buy list** (webhook): added **{DiscordNotifyText.SanitizeInline(body.Name)}**");
        return Results.Ok(new { ok = true });
    }

    private static bool TryWebhookSecret(HttpRequest http, out IResult? error)
    {
        error = null;
        var expected = Environment.GetEnvironmentVariable("HOMEBOT_WEBHOOK_SECRET")?.Trim();
        if (string.IsNullOrEmpty(expected))
        {
            error = ApiResults.BadRequest("Webhooks disabled.", "webhook_disabled");
            return false;
        }

        var provided = http.Headers["X-HomeBot-Webhook-Secret"].ToString();
        if (string.IsNullOrEmpty(provided))
        {
            var auth = http.Headers.Authorization.ToString();
            if (auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                provided = auth["Bearer ".Length..].Trim();
        }

        if (string.IsNullOrEmpty(provided) ||
            !System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
                System.Text.Encoding.UTF8.GetBytes(expected),
                System.Text.Encoding.UTF8.GetBytes(provided)))
        {
            error = ApiResults.Forbidden("Invalid webhook secret.");
            return false;
        }

        return true;
    }

    private static int GetLastCalendarItemId(IServiceProvider root)
    {
        var db = root.GetRequiredService<DatabaseService>();
        using var conn = db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Id FROM CalendarItems ORDER BY Id DESC LIMIT 1";
        var o = cmd.ExecuteScalar();
        return o == null ? 0 : Convert.ToInt32(o);
    }
}
