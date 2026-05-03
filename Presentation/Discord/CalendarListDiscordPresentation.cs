using System.Globalization;
using Discord;

/// <summary>
/// Discord embeds and buttons for calendar lists (full list, today, upcoming). Domain reads stay on <see cref="CalendarService"/>.
/// </summary>
public static class CalendarListDiscordPresentation
{
    public static Task<(Embed embed, MessageComponent components)> BuildList(CalendarService calendar, int page = 0)
    {
        var result = calendar.GetList(page);
        var rows = result.Items.Select(FormatCalendarListRow).ToList();
        var ids = result.Items.Select(x => x.Id).ToList();
        var embed = ListUIBuilder.BuildEmbed("📅 Calendar", rows);
        var components = new ComponentBuilder();
        foreach (var id in ids)
        {
            components.WithButton($"✔ {id}", $"calendar_complete_{id}", ButtonStyle.Success);
            components.WithButton($"❌ {id}", $"calendar_delete_{id}", ButtonStyle.Danger);
        }
        if (result.HasPrev)
        {
            components.WithButton("⬅ Prev", $"calendar_page_{page - 1}", ButtonStyle.Secondary);
        }
        if (result.HasNext)
        {
            components.WithButton("Next ➡", $"calendar_page_{page + 1}", ButtonStyle.Secondary);
        }
        return Task.FromResult((embed, components.Build()));
    }

    public static Task<(Embed embed, MessageComponent components)> BuildToday(
        CalendarService calendar,
        ulong? userFilter = null,
        int page = 0)
    {
        var result = calendar.GetToday(userFilter, page);
        var rows = result.Items.Select(FormatSimpleCalendarRow).ToList();
        var embed = ListUIBuilder.BuildEmbed("📅 Today", rows);

        var components = new ComponentBuilder();
        if (result.HasPrev)
            components.WithButton("⬅ Prev", $"calendar_today_page_{page - 1}", ButtonStyle.Secondary, row: 0);
        if (result.HasNext)
            components.WithButton("Next ➡", $"calendar_today_page_{page + 1}", ButtonStyle.Secondary, row: 0);

        if (!userFilter.HasValue)
            AppendOccurrenceResetButtons(components, "t", page, result.Items, row: 1);

        return Task.FromResult((embed, components.Build()));
    }

    public static Task<(Embed embed, MessageComponent components)> BuildUpcoming(
        CalendarService calendar,
        ulong? userFilter = null,
        int page = 0)
    {
        var result = calendar.GetUpcoming(userFilter, page);
        var rows = result.Items.Select(FormatUpcomingCalendarRow).ToList();
        var embed = ListUIBuilder.BuildEmbed("📅 Upcoming", rows);

        var components = new ComponentBuilder();
        if (result.HasPrev)
            components.WithButton("⬅ Prev", $"calendar_upcoming_page_{page - 1}", ButtonStyle.Secondary, row: 0);
        if (result.HasNext)
            components.WithButton("Next ➡", $"calendar_upcoming_page_{page + 1}", ButtonStyle.Secondary, row: 0);

        if (!userFilter.HasValue)
            AppendOccurrenceResetButtons(components, "u", page, result.Items, row: 1);

        return Task.FromResult((embed, components.Build()));
    }

    /// <summary>
    /// Per-row reset for recurrence occurrences (same as <c>DELETE /api/calendar/items/{id}/instance?instanceStartUtc=…</c>).
    /// Hidden when a user filter is applied so we do not lose filter context in the button handler.
    /// </summary>
    private static void AppendOccurrenceResetButtons(
        ComponentBuilder components,
        string viewKind,
        int page,
        IReadOnlyList<CalendarListItemModel> items,
        int row)
    {
        const int max = 4;
        var added = 0;
        foreach (var item in items)
        {
            if (string.IsNullOrWhiteSpace(item.InstanceStartUtc))
                continue;

            long unix;
            try
            {
                unix = ToUnixSecondsForInstanceKey(item.InstanceStartUtc!);
            }
            catch
            {
                continue;
            }

            var customId = $"calrst-{viewKind}-{page}-{item.Id}-{unix}";
            if (customId.Length > 100)
                continue;

            components.WithButton($"↩{item.Id}", customId, ButtonStyle.Secondary, row: row);
            if (++added >= max)
                break;
        }
    }

    private static long ToUnixSecondsForInstanceKey(string instanceStartUtc)
    {
        var iso = CalendarService.NormalizeCalendarInstanceStartUtc(instanceStartUtc);
        if (!DateTimeOffset.TryParse(
                iso,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var dto))
        {
            throw new InvalidOperationException("Invalid instance key.");
        }

        return dto.ToUnixTimeSeconds();
    }

    private static string GetAssignedDisplay(ulong? assigned)
    {
        if (!assigned.HasValue) return "anyone";
        if (assigned.Value == 0) return "@everyone";
        return $"<@{assigned.Value}>";
    }

    private static string FormatCalendarListRow(CalendarListItemModel item)
    {
        string icon = item.Type == "task" ? "📝" : "📅";
        var line = $"{icon} **#{item.Id} {item.Title}**";
        if (item.Type != "task")
        {
            if (!string.IsNullOrWhiteSpace(item.DateText))
                line += $" | {item.DateText}";
            if (item.AllDay)
                line += " | All-day";
        }
        line += $" | 👤 {GetAssignedDisplay(item.AssignedTo)}";
        if (!string.IsNullOrWhiteSpace(item.RecurrenceText))
            line += $" | {item.RecurrenceText}";
        if (!string.IsNullOrWhiteSpace(item.ReminderText))
            line += $" | ⏰ {item.ReminderText}";
        if (item.HasLink)
            line += " | 🔗";
        return line;
    }

    private static string FormatSimpleCalendarRow(CalendarListItemModel item)
    {
        string icon = item.Type == "task" ? "📝" : "📅";
        return $"{icon} **#{item.Id} {item.Title}** | 👤 {GetAssignedDisplay(item.AssignedTo)}";
    }

    private static string FormatUpcomingCalendarRow(CalendarListItemModel item)
    {
        string icon = item.Type == "task" ? "📝" : "📅";
        return $"{icon} **#{item.Id} {item.Title}** | {item.DateText} | 👤 {GetAssignedDisplay(item.AssignedTo)}";
    }
}
