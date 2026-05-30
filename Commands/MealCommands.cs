using Discord;
using Discord.Interactions;

/// <summary>Discord slash commands for meal planning.</summary>
public class MealCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly MealPlanningService _meals;

    public MealCommands(MealPlanningService meals)
    {
        _meals = meals;
    }

    [SlashCommand("meal-plan", "Show the meal plan for a date range")]
    public async Task Plan(
        [Summary("from", "Start date YYYY-MM-DD")] string? from = null,
        [Summary("to", "End date YYYY-MM-DD")] string? to = null)
    {
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var start = string.IsNullOrWhiteSpace(from) ? today : from.Trim();
        var end = string.IsNullOrWhiteSpace(to) ? start : to.Trim();
        var text = _meals.BuildPlanText(start, end);
        await RespondAsync(text, ephemeral: true);
    }

    [SlashCommand("meal-dinner", "What's for dinner today?")]
    public async Task Dinner()
    {
        await RespondAsync(_meals.BuildTonightText(), ephemeral: true);
    }

    [SlashCommand("meal-add-recipe", "Add a meal recipe")]
    public async Task AddRecipe(
        [Summary("name", "Recipe name")] string name,
        [Summary("ingredients", "One per line: qty name (e.g. 2 cups rice)")] string ingredients)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            await RespondAsync("❌ Name is required.", ephemeral: true);
            return;
        }

        var parsed = ingredients
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(line =>
            {
                var parts = line.Split(' ', 2, StringSplitOptions.TrimEntries);
                return parts.Length == 2
                    ? new MealIngredientModel { Quantity = parts[0], Name = parts[1] }
                    : new MealIngredientModel { Name = line, Quantity = "1" };
            })
            .ToList();

        var id = _meals.CreateRecipe(new MealRecipeCreateModel
        {
            Name = name.Trim(),
            Ingredients = parsed,
        });
        await RespondAsync($"✅ Recipe **{name.Trim()}** saved (id {id}).");
    }
}
