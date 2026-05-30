using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Medium-tier HTTP routes: search, money balances, webhooks, household report, buy recurring, budget rules.
/// </summary>
public static class MediumFeaturesApiRegistration
{
    public static void MapMediumFeaturesApi(this WebApplication app, IServiceProvider root, string staticApiToken)
    {
        MapReads(app, root);
        MapWrites(app, root, staticApiToken);
        WebAdminApi.MapWebAdminApi(app, root, staticApiToken);
    }

    private static void MapReads(WebApplication app, IServiceProvider root)
    {
        app.MapGet("/api/search", (HttpRequest request) =>
        {
            var q = request.Query["q"].ToString();
            var limit = 5;
            if (int.TryParse(request.Query["limit"], out var lim))
                limit = lim;
            var search = root.GetRequiredService<SearchService>();
            return Results.Ok(search.Search(q, limit));
        });

        app.MapGet("/api/money/balances", (HttpRequest request) =>
        {
            if (!ulong.TryParse(request.Query["userId"], out var userId) || userId == 0)
                return ApiResults.BadRequest("Query parameter userId is required.", "missing_user_id");

            var money = root.GetRequiredService<MoneyService>();
            return Results.Ok(money.GetBalancesForUser(userId));
        });

        app.MapGet("/api/buy/recurring", () =>
        {
            var svc = root.GetRequiredService<BuyRecurringService>();
            return Results.Ok(new { items = svc.List(activeOnly: true) });
        });

        app.MapGet("/api/budget/categorize-rules", () =>
        {
            var budget = root.GetRequiredService<BudgetService>();
            return Results.Ok(new { rules = budget.GetCategorizeRules(activeOnly: false) });
        });

        app.MapGet("/api/household/report", (HttpRequest request) =>
        {
            var month = request.Query["month"].ToString();
            var report = root.GetRequiredService<HouseholdReportService>();
            return Results.Ok(report.Build(string.IsNullOrWhiteSpace(month) ? null : month));
        });
    }

    private static void MapWrites(WebApplication app, IServiceProvider root, string staticApiToken)
    {
        var w = app.MapGroup("/api").RequireRateLimiting("mutation");

        w.MapPost("/buy/recurring", (HttpRequest http, BuyRecurringItemCreateModel? body) =>
        {
            if (body is null || string.IsNullOrWhiteSpace(body.Name))
                return ApiResults.BadRequest("Request body with name is required.", "missing_body");
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var nameErr = Validation.ValidateName(body.Name);
            if (nameErr != null)
                return ApiResults.Validation(nameErr);

            var svc = root.GetRequiredService<BuyRecurringService>();
            var id = svc.Create(body, actor);
            return Results.Created($"/api/buy/recurring/{id}", new { ok = true, id });
        });

        w.MapPut("/buy/recurring/{id:int}", (int id, BuyRecurringItemUpdateModel? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("Request body is required.", "missing_body");
            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            if (!root.GetRequiredService<BuyRecurringService>().Update(id, body))
                return ApiResults.NotFound("Recurring buy item not found.");
            return Results.Ok(new { ok = true });
        });

        w.MapDelete("/buy/recurring/{id:int}", (int id) =>
        {
            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);
            if (!root.GetRequiredService<BuyRecurringService>().Deactivate(id))
                return ApiResults.NotFound("Recurring buy item not found.");
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/budget/categorize-rules", (BudgetCategorizeRuleCreateRequest? body) =>
        {
            if (body is null || string.IsNullOrWhiteSpace(body.MatchContains))
                return ApiResults.BadRequest("matchContains is required.", "missing_body");
            if (body.CategoryId <= 0)
                return ApiResults.BadRequest("categoryId is required.", "validation_error");

            try
            {
                var id = root.GetRequiredService<BudgetService>().CreateCategorizeRule(
                    body.MatchField ?? "merchant",
                    body.MatchContains,
                    body.CategoryId,
                    body.Priority);
                return Results.Created($"/api/budget/categorize-rules/{id}", new { ok = true, id });
            }
            catch (ArgumentException ex)
            {
                return ApiResults.Validation(ex.Message);
            }
        });

        w.MapDelete("/budget/categorize-rules/{id:int}", (int id) =>
        {
            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);
            if (!root.GetRequiredService<BudgetService>().DeleteCategorizeRule(id))
                return ApiResults.NotFound("Rule not found.");
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/household/report/discord", async (HttpRequest http) =>
        {
            if (!WebAdminAuth.TryRequireAdmin(http, root, staticApiToken, out var adminErr))
                return adminErr!;

            var month = http.Query["month"].ToString();
            var report = root.GetRequiredService<HouseholdReportService>().Build(
                string.IsNullOrWhiteSpace(month) ? null : month);
            await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
                "budget",
                report.Markdown.Length > 1800 ? report.Markdown[..1800] + "…" : report.Markdown);
            return Results.Ok(new { ok = true, month = report.Month });
        });
    }

    /// <summary>Legacy entry — webhooks are registered via <see cref="PolishApiRegistration"/>.</summary>
    public static void MapWebhookApi(this WebApplication app, IServiceProvider root)
    {
    }

    public static bool TryActorPublic(IQueryCollection query, out ulong actor, out IResult? error) =>
        TryActor(query, out actor, out error);

    private static bool TryActor(IQueryCollection query, out ulong actor, out IResult? error)
    {
        actor = 0;
        error = null;
        if (!ulong.TryParse(query["actorUserId"], out actor) || actor == 0)
        {
            error = ApiResults.BadRequest(
                "Non-zero query parameter 'actorUserId' (Discord user id) is required.",
                "actor_required");
            return false;
        }

        return true;
    }
}
