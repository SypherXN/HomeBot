using Discord;
using Discord.Interactions;

/// <summary>
/// Slash commands for displaying a high-level home dashboard view.
/// </summary>
public class DashboardCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly CalendarService _calendar;
    private readonly BuyService _buy;
    private readonly WishlistService _wishlist;
    private readonly BudgetService _budget;

    public DashboardCommands(
        CalendarService calendar,
        BuyService buy,
        WishlistService wishlist,
        BudgetService budget)
    {
        _calendar = calendar;
        _buy = buy;
        _wishlist = wishlist;
        _budget = budget;
    }

    /// <summary>
    /// Builds and sends the dashboard embed with household snapshot fields.
    /// </summary>
    [SlashCommand("dashboard", "View overview")]
    public async Task Dashboard()
    {
        var embed = new EmbedBuilder()
            .WithTitle("🏠 Home Dashboard")
            .WithColor(Color.Gold);

        var (todayEmbed, _) = await CalendarListDiscordPresentation.BuildToday(_calendar);
        embed.AddField("📅 Today", todayEmbed.Description ?? "No items", inline: false);

        var upcoming = _calendar.GetUpcoming(null, 0);
        var upcomingLines = upcoming.Items
            .Where(i => i.Type != "task")
            .Take(4)
            .Select(i => string.IsNullOrWhiteSpace(i.DateText)
                ? $"• {i.Title}"
                : $"• {i.Title} ({i.DateText})")
            .ToList();
        embed.AddField(
            "📆 Upcoming",
            upcomingLines.Count > 0 ? string.Join("\n", upcomingLines) : "Nothing upcoming",
            inline: false);

        var buyList = _buy.GetBuyList(null, "", "", "", 0);
        embed.AddField(
            "🛒 Buy list",
            buyList.TotalCount > 0
                ? $"{buyList.TotalCount} active item(s) — /buy-list"
                : "List is clear — /buy-add",
            inline: true);

        var wishList = _wishlist.GetWishlist(null, "", "", 0);
        embed.AddField(
            "💝 Wishlist",
            wishList.TotalCount > 0
                ? $"{wishList.TotalCount} active wish(es) — /wishlist-list"
                : "No active wishes — /wishlist-add",
            inline: true);

        var month = DateTime.UtcNow.ToString("yyyy-MM");
        var budget = _budget.GetMonthSummary(month, null, null, "household");
        var topCat = _budget.GetSummaryByCategory(month, null, "household").FirstOrDefault();
        var goals = _budget.GetGoals();
        var budgetSb = new System.Text.StringBuilder();
        budgetSb.AppendLine($"**{month}** — in ${budget.TotalIncome:N2} · out ${budget.TotalExpenses:N2} · net ${budget.Net:N2}");
        if (topCat != null)
            budgetSb.AppendLine($"Top: {topCat.Label} (${topCat.Total:N2})");
        if (goals.Count > 0)
            budgetSb.AppendLine($"Goals: {goals.Count} active — /budget-summary");
        embed.AddField("📊 Budget", budgetSb.ToString().Trim(), inline: false);

        embed.AddField("💰 Money (IOU)", "Use /money-summary for balances between two people.", inline: false);

        embed.Footer = new EmbedFooterBuilder
        {
            Text = "Web UI dashboard has more detail · /help"
        };

        await RespondAsync(embed: embed.Build());
    }
}
