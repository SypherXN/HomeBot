using Discord;
using Discord.Interactions;

/// <summary>
/// Slash command for showing topic-based help content.
/// </summary>
public class HelpCommands : InteractionModuleBase<SocketInteractionContext>
{
    /// <summary>
    /// Displays help text for a requested topic or the default help index.
    /// </summary>
    [SlashCommand("help", "Show help")]
    public async Task Help(string topic = "")
    {
        var embed = new EmbedBuilder()
            .WithTitle("📘 HomeBot Help")
            .WithColor(Color.Blue);

        topic = topic?.ToLower() ?? "";

        switch (topic)
        {
            // ================= GENERAL =================
            case "general":
                embed.Description =
    @"⚙️ General System

    • Commands only work in their assigned channels
    • Use /setup-set to configure channels (including optional audit for web sign-ins)
    • Use /undo to revert last action
    • Use /config-set to change settings
    • Use /webui-verify with the code from the browser to finish Web sign-up

    Examples:
    - /undo
    - /config-set page_size 5
    - /webui-verify code:ABCD12EF";
                break;

            // ================= CONFIG =================
            case "config":
                embed.Description =
    @"⚙️ Config System

    /config-set <key> <value>
    /config-view

    Common keys:
    - page_size → list size
    - timezone → household calendar zone (IANA recommended)

    Timezone (easiest):
    - /timezone-set  (type to filter; stores a portable IANA id when possible)
    - /timezone-list (examples)

    Example:
    - /config-set timezone America/Los_Angeles";
                break;

            // ================= SETUP =================
            case "setup":
                embed.Description =
    @"🔧 Setup System

    /setup-set <feature> <channel>

    Features:
    - calendar
    - buy
    - wishlist
    - money
    - audit (optional — web sign-in log: password + Discord OAuth)

    Example:
    - /setup-set calendar #calendar
    - /setup-set audit #server-log";
                break;

            // ================= CALENDAR =================
            case "calendar":
                embed.Description =
    @"📅 Calendar Commands

    /calendar-add
    /calendar-list
    /calendar-today
    /calendar-upcoming
    /calendar-view
    /calendar-complete /calendar-delete /calendar-edit

    Recurring — one day only (UTC key like 2026-04-16T09:00:00Z):
    /calendar-instance-omit
    /calendar-instance-complete
    /calendar-instance-edit

    Household timezone: /timezone-set or /config-set timezone <IANA>

    Date formats:
    - tomorrow 6pm
    - in 2 hours
    - next monday
    - 5/1/2026 6pm

    Extras:
    - reminder: 10m / 2h / 1d
    - recurrence: daily / weekly";
                break;

            // ================= MONEY =================
            case "money":
                embed.Description =
    @"💰 Money Commands

    /money-add
    /money-pay
    /money-summary
    /money-list

    Supports:
    - math (20+5)
    - percentage splits";
                break;

            // ================= WISHLIST =================
            case "wishlist":
                embed.Description =
    @"🎁 Wishlist Commands

    /wishlist-add
    /wishlist-list
    /wishlist-edit
    /wishlist-delete

    Supports:
    - tagging users
    - links
    - priority sorting";
                break;

            // ================= BUY =================
            case "buy":
                embed.Description =
    @"🛒 Buy Commands

    /buy-add
    /buy-list
    /buy-complete

    Simple shared list system";
                break;

            // ================= DEFAULT =================
            default:
                embed.Description =
    @"📘 Help Topics:

    /help general
    /help config
    /help setup
    /help calendar
    /help money
    /help wishlist
    /help buy

    Tip:
    Use /dashboard for quick overview";
                break;
        }

        await RespondAsync(embed: embed.Build(), ephemeral: true);
    }
}