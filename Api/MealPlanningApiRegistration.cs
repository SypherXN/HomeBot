using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

public static class MealPlanningApiRegistration
{
    public static void MapMealPlanningApi(this WebApplication app, IServiceProvider root)
    {
        app.MapGet("/api/meals/recipes", () =>
            Results.Ok(new { recipes = root.GetRequiredService<MealPlanningService>().ListRecipes() }));

        app.MapGet("/api/meals/plan", (HttpRequest request) =>
        {
            var from = request.Query["from"].ToString();
            var to = request.Query["to"].ToString();
            if (string.IsNullOrWhiteSpace(from) || string.IsNullOrWhiteSpace(to))
                return ApiResults.BadRequest("from and to (YYYY-MM-DD) are required.", "missing_range");
            return Results.Ok(new { entries = root.GetRequiredService<MealPlanningService>().GetPlan(from, to) });
        });

        var w = app.MapGroup("/api/meals").RequireRateLimiting("mutation");

        w.MapPost("/recipes", (MealRecipeCreateModel? body) =>
        {
            if (body is null || string.IsNullOrWhiteSpace(body.Name))
                return ApiResults.BadRequest("name is required.", "missing_body");
            var id = root.GetRequiredService<MealPlanningService>().CreateRecipe(body);
            return Results.Created($"/api/meals/recipes/{id}", new { ok = true, id });
        });

        w.MapDelete("/recipes/{id:int}", (int id) =>
        {
            if (!root.GetRequiredService<MealPlanningService>().DeleteRecipe(id))
                return ApiResults.NotFound("Recipe not found.");
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/plan", (HttpRequest http, MealPlanEntryCreateModel? body) =>
        {
            if (body is null || string.IsNullOrWhiteSpace(body.PlanDate))
                return ApiResults.BadRequest("planDate is required.", "missing_body");
            ulong actor = 0;
            if (body.AddToCalendar &&
                !MediumFeaturesApiRegistration.TryActorPublic(http.Query, out actor, out var actorErr))
                return actorErr!;
            var id = root.GetRequiredService<MealPlanningService>().AddPlanEntry(body, actor);
            return Results.Created($"/api/meals/plan/{id}", new { ok = true, id });
        });

        w.MapDelete("/plan/{id:int}", (int id) =>
        {
            if (!root.GetRequiredService<MealPlanningService>().DeletePlanEntry(id))
                return ApiResults.NotFound("Plan entry not found.");
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/plan/{id:int}/add-to-buy", (HttpRequest http, int id) =>
        {
            if (!MediumFeaturesApiRegistration.TryActorPublic(http.Query, out var actor, out var err))
                return err!;
            var n = root.GetRequiredService<MealPlanningService>().AddPlanIngredientsToBuyList(id, actor);
            return Results.Ok(new { ok = true, added = n });
        });

        w.MapPost("/plan/{id:int}/calendar", (HttpRequest http, int id) =>
        {
            if (!MediumFeaturesApiRegistration.TryActorPublic(http.Query, out var actor, out var err))
                return err!;
            var calId = root.GetRequiredService<MealPlanningService>().AddPlanEntryToCalendar(id, actor);
            if (!calId.HasValue)
                return ApiResults.NotFound("Plan entry not found.");
            return Results.Ok(new { ok = true, calendarItemId = calId.Value });
        });
    }
}
