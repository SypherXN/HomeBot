using Discord;
using Discord.Interactions;

/// <summary>
/// Slash commands for creating, viewing, and maintaining calendar items.
/// </summary>
public class CalendarCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly CalendarService _calendar;
    private readonly ConfigService _config;

    public CalendarCommands(CalendarService calendar, ConfigService config)
    {
        _calendar = calendar;
        _config = config;
    }

    /// <summary>
    /// Adds a calendar event or task after validating and normalizing user input.
    /// </summary>
    [SlashCommand("calendar-add", "Add calendar item")]
    public async Task Add(
        string title,
        string start = "",
        string end = "",
        bool allDay = false,
        string reminder = "",
        IUser? assignedTo = null,
        bool everyone = false,
        string description = "",
        string notes = "",
        string link = "",
        string recurrence = ""
    )
    {
        try
        {
            if (!ValidationHelper.ValidateDate(start, out var dateError))
            {
                await RespondAsync(dateError, ephemeral: true);
                return;
            }

            if (!ValidationHelper.ValidateReminder(reminder, out var reminderError))
            {
                await RespondAsync(reminderError, ephemeral: true);
                return;
            }

            if (!ValidationHelper.ValidateRecurrence(recurrence, out var recurError))
            {
                await RespondAsync(recurError, ephemeral: true);
                return;
            }

            string type = string.IsNullOrWhiteSpace(start) ? "task" : "event";

            DateTime? parsedStart = DateParser.Parse(start);

            var tzValue = _config.Get("timezone") ?? "Pacific Standard Time";

            TimeZoneInfo tz;
            try
            {
                tz = TimeZoneInfo.FindSystemTimeZoneById(tzValue);
            }
            catch
            {
                tz = TimeZoneInfo.FindSystemTimeZoneById("Pacific Standard Time");
            }

            string finalStart = start;

            if (parsedStart.HasValue)
            {
                var utc = TimeZoneInfo.ConvertTimeToUtc(parsedStart.Value, tz);
                finalStart = utc.ToString("yyyy-MM-dd HH:mm");
            }

            ulong? assignedId = null;

            if (everyone)
                assignedId = 0;
            else if (assignedTo != null)
                assignedId = assignedTo.Id;

            var reminderSpan = ReminderParser.Parse(reminder);

            string reminderValue = reminderSpan.HasValue
                ? reminderSpan.Value.TotalSeconds.ToString()
                : "";

            _calendar.AddItem(
                title,
                type,
                finalStart,
                end,
                allDay,
                reminderValue,
                assignedId,
                description,
                notes,
                link,
                recurrence,
                tzValue
            );

            await RespondAsync($"📅 Added: {title}");
        }
        catch (Exception)
        {
            await RespondAsync(
                "❌ Error adding calendar item.",
                ephemeral: true
            );
        }
    }

    /// <summary>
    /// Shows the paginated calendar list.
    /// </summary>
    [SlashCommand("calendar-list", "View calendar")]
    public async Task List()
    {
        try
        {
            var (embed, components) = await _calendar.BuildList();

            await RespondAsync(embed: embed, components: components);
        }
        catch (Exception)
        {
            await RespondAsync("❌ Error in calendar list", ephemeral: true);
        }
    }

    /// <summary>
    /// Marks a calendar item as complete.
    /// </summary>
    [SlashCommand("calendar-complete", "Complete calendar item")]
    public async Task Complete(int id)
    {
        _calendar.CompleteItem(id, Context.User.Id);
        await RespondAsync("✔ Calendar item completed");
    }

    /// <summary>
    /// Deletes a calendar item by id.
    /// </summary>
    [SlashCommand("calendar-delete", "Delete calendar item")]
    public async Task Delete(int id)
    {
        _calendar.DeleteItem(id, Context.User.Id);
        await RespondAsync("❌ Calendar item deleted");
    }

    /// <summary>
    /// Updates editable fields on an existing calendar item.
    /// </summary>
    [SlashCommand("calendar-edit", "Edit calendar item")]
    public async Task Edit(
        int id,
        string title = "",
        string start = "",
        string end = "",
        string description = "",
        string notes = "",
        string link = "")
    {
        _calendar.EditItem(id, title, start, end, description, notes, link);

        await RespondAsync("✏️ Calendar item updated");
    }

    /// <summary>
    /// Displays a full detail view for one calendar item.
    /// </summary>
    [SlashCommand("calendar-view", "View full calendar item")]
    public async Task View(int id)
    {
        var item = _calendar.GetItem(id);

        if (item == null)
        {
            await RespondAsync("❌ Item not found");
            return;
        }

        var embed = new EmbedBuilder()
            .WithTitle($"📅 {item.Title}")
            .WithColor(Color.Blue);

        // --- Date / Time ---
        if (!string.IsNullOrWhiteSpace(item.Start))
        {
            embed.AddField("When",
                item.AllDay ? $"{item.Start} (All-day)" : item.Start);
        }

        // --- Reminder ---
        if (!string.IsNullOrWhiteSpace(item.Reminder))
        {
            var reminderText = ReminderFormatter.Format(item.Reminder);
            embed.AddField("Reminder", reminderText);
        }

        // --- Description ---
        if (!string.IsNullOrWhiteSpace(item.Description))
            embed.AddField("Description", item.Description);

        // --- Notes ---
        if (!string.IsNullOrWhiteSpace(item.Notes))
            embed.AddField("Notes", item.Notes);

        var components = new ComponentBuilder();

        // --- Link ---
        if (!string.IsNullOrWhiteSpace(item.Link))
        {
            components.WithButton(
                "🔗 Open Link",
                style: ButtonStyle.Link,
                url: item.Link
            );
        }

        await RespondAsync(
            embed: embed.Build(),
            components: components.Build()
        );
    }

    /// <summary>
    /// Displays today's calendar items, optionally filtered to one user.
    /// </summary>
    [SlashCommand("calendar-today", "View today's items")]
    public async Task Today(IUser? user = null)
    {
        var result = await _calendar.BuildToday(user?.Id);
        await RespondAsync(embed: result.embed, components: result.components);
    }

    /// <summary>
    /// Displays upcoming calendar events, optionally filtered to one user.
    /// </summary>
    [SlashCommand("calendar-upcoming", "View upcoming events")]
    public async Task Upcoming(IUser? user = null)
    {
        var result = await _calendar.BuildUpcoming(user?.Id);
        await RespondAsync(embed: result.embed, components: result.components);
    }
}