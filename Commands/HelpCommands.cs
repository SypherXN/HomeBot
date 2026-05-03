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
    @"⚙️ General

    • Most feature commands only work in the channel bound with **/setup-set** (calendar, buy, wishlist, money).
    • **/setup-set** and **/config-*** work anywhere in the server.
    • **/undo** reverts your last logged action (buy, wishlist, money, calendar, recurrence exceptions, etc.).
    • **/webui-verify** — paste the code from the browser to finish Web account setup (Discord-verified flow).

    Examples:
    - /undo
    - /config-set page_size 5
    - /webui-verify code:ABCD12EF";
                break;

            // ================= WEB =================
            case "web":
                embed.Description =
    @"🌐 Web UI & HTTP API

    • The household can use a **browser app** (Vite/React) against the same **HTTP API** the bot may host (`/api/...`): buy, wishlist, money, calendar (range, today, upcoming, item detail, per-instance actions), undo, auth.
    • Sign-in: password JWT and/or Discord OAuth (when configured); **actorUserId** on mutations records who acted.
    • Data is the **same SQLite** as Discord — not a separate product database.

    Discord help still applies to slash commands; use **/help** topics for those.";
                break;

            // ================= CONFIG =================
            case "config":
                embed.Description =
    @"⚙️ Config

    /config-set <key> <value>
    /config-view

    Common keys:
    - **page_size** — list pagination (buy, wishlist, calendar lists)
    - **timezone** — household default for calendar when a row has no zone (IANA recommended)

    Timezone (interactive):
    - /timezone-set  (type to filter; prefers portable IANA ids)
    - /timezone-list

    Example:
    - /config-set timezone America/Los_Angeles";
                break;

            // ================= SETUP =================
            case "setup":
                embed.Description =
    @"🔧 Channel setup

    /setup-set <feature> <channel>
    /setup-view

    Features:
    - **calendar** — all /calendar-* slash commands
    - **buy** — /buy-*
    - **wishlist** — /wishlist-*
    - **money** — /money-*
    - **audit** (optional) — log channel for **web** sign-ins (password + Discord OAuth)

    Example:
    - /setup-set calendar #calendar
    - /setup-set audit #mod-log";
                break;

            // ================= CALENDAR =================
            case "calendar":
                embed.Description =
    @"📅 Calendar (slash)

    Lists & views:
    - /calendar-list — paged list with buttons
    - /calendar-view — one item by id
    - /calendar-today — today’s window (expands **daily/weekly** like the API range; includes tasks)
    - /calendar-upcoming — next ~92 days + tasks

    Series & rows:
    - /calendar-add — event (with start) or task (no start)
    - /calendar-edit /calendar-complete /calendar-delete

    One recurring **occurrence** only (canonical UTC slot, e.g. **2026-04-16T09:00:00Z** — same key as Web range **instanceStartUtc**):
    - /calendar-instance-omit — hide this day
    - /calendar-instance-complete — complete this day only
    - /calendar-instance-reset — clear overrides for that day (same as Web **Reset this day**)
    - /calendar-instance-edit — title/description/notes/link + optional **override_start_utc** / **override_end_utc**

    Household timezone: /timezone-set or /config-set timezone <IANA>

    Natural-language dates (examples): tomorrow 6pm, in 2 hours, next monday, 5/1/2026 6pm

    Extras on add: reminder **10m** / **2h** / **1d**; recurrence **daily** / **weekly**";
                break;

            // ================= MONEY =================
            case "money":
                embed.Description =
    @"💰 Money (slash)

    /money-add — split expense (who paid / who owes)
    /money-pay — record a payment
    /money-summary — balances
    /money-list — history (paged)
    /money-edit
    /money-delete

    Supports math in amounts (e.g. 20+5) and percentage-style splits where applicable.";
                break;

            // ================= WISHLIST =================
            case "wishlist":
                embed.Description =
    @"🎁 Wishlist (slash)

    /wishlist-add
    /wishlist-list
    /wishlist-view — full row
    /wishlist-edit
    /wishlist-complete /wishlist-delete
    /wishlist-clear-completed

    Supports assignees, links, priority, tags (when catalog is configured).";
                break;

            // ================= BUY =================
            case "buy":
                embed.Description =
    @"🛒 Buy list (slash)

    /buy-add
    /buy-list — filters & pagination
    /buy-complete
    /buy-delete /buy-edit
    /buy-clear-completed

    Shared shopping-style list with assignees and tags.";
                break;

            // ================= DEFAULT =================
            default:
                embed.Description =
    @"📘 Topics — set the **topic** option on **/help** (e.g. **general**, **web**, …):

    **general** — undo, setup scope, webui-verify
    **web** — browser app + API (same household data)
    **setup** — bind features to channels, audit log
    **config** — settings & timezone
    **calendar** — lists, today/upcoming, recurrence per-day
    **money** — splits, pay, summary, list, edit, delete
    **wishlist** — add, list, view, edit, complete, delete, clear
    **buy** — add, list, complete, delete, edit, clear

    Other slash commands:
    - **/dashboard** — quick today + money pointer
    - **/help** — this menu";
                break;
        }

        await RespondAsync(embed: embed.Build(), ephemeral: true);
    }
}
