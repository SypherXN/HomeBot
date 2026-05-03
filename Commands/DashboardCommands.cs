using Discord;
using Discord.Interactions;

/// <summary>
/// Slash commands for displaying a high-level home dashboard view.
/// </summary>
public class DashboardCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly CalendarService _calendar;
    private readonly MoneyService _money;

    public DashboardCommands(CalendarService calendar, MoneyService money)
    {
        _calendar = calendar;
        _money = money;
    }

    /// <summary>
    /// Builds and sends the dashboard embed with quick calendar and money entry points.
    /// </summary>
    [SlashCommand("dashboard", "View overview")]
    public async Task Dashboard()
    {
        var embed = new EmbedBuilder()
            .WithTitle("🏠 Home Dashboard")
            .WithColor(Color.Gold);

        // --- Calendar Today ---
        var (todayEmbed, _) = await CalendarListDiscordPresentation.BuildToday(_calendar);
        embed.AddField("📅 Today", todayEmbed.Description ?? "No items");

        // --- Money Summary (self vs others optional later)
        embed.AddField("💰 Money", "Use /money-summary");

        embed.Footer = new EmbedFooterBuilder
        {
            Text = "Use /help for commands"
        };

        await RespondAsync(embed: embed.Build());
    }
}