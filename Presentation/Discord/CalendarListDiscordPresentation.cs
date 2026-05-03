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
            components.WithButton("⬅ Prev", $"calendar_today_page_{page - 1}", ButtonStyle.Secondary);
        if (result.HasNext)
            components.WithButton("Next ➡", $"calendar_today_page_{page + 1}", ButtonStyle.Secondary);

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
            components.WithButton("⬅ Prev", $"calendar_upcoming_page_{page - 1}", ButtonStyle.Secondary);
        if (result.HasNext)
            components.WithButton("Next ➡", $"calendar_upcoming_page_{page + 1}", ButtonStyle.Secondary);

        return Task.FromResult((embed, components.Build()));
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
