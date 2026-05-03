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

            var tzRaw = _config.Get("timezone");
            var tz = TimeZoneResolver.Resolve(
                string.IsNullOrWhiteSpace(tzRaw) ? null : tzRaw,
                TimeZoneResolver.DefaultHouseholdTimeZoneId);

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
                TimeZoneResolver.ToStorageId(tz)
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
            var (embed, components) = await CalendarListDiscordPresentation.BuildList(_calendar);

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
        _calendar.EditItem(id, title, start, end, description, notes, link, null);

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
        var result = await CalendarListDiscordPresentation.BuildToday(_calendar, user?.Id);
        await RespondAsync(embed: result.embed, components: result.components);
    }

    /// <summary>
    /// Displays upcoming calendar events, optionally filtered to one user.
    /// </summary>
    [SlashCommand("calendar-upcoming", "View upcoming events")]
    public async Task Upcoming(IUser? user = null)
    {
        var result = await CalendarListDiscordPresentation.BuildUpcoming(_calendar, user?.Id);
        await RespondAsync(embed: result.embed, components: result.components);
    }

    /// <summary>
    /// Hides one occurrence of a recurring calendar item (same UTC key as the web range row).
    /// </summary>
    [SlashCommand("calendar-instance-omit", "Hide one recurring occurrence")]
    public async Task InstanceOmit(int id, string instance_start_utc)
    {
        try
        {
            _calendar.OmitRecurrenceInstance(id, instance_start_utc, Context.User.Id);
            await RespondAsync("🚫 That occurrence is hidden from the calendar. Undo reverses it.");
        }
        catch (Exception ex)
        {
            await RespondAsync($"❌ {ex.Message}", ephemeral: true);
        }
    }

    /// <summary>
    /// Marks one occurrence of a recurring item complete (series stays active).
    /// </summary>
    [SlashCommand("calendar-instance-complete", "Complete one recurring occurrence")]
    public async Task InstanceComplete(int id, string instance_start_utc)
    {
        try
        {
            _calendar.CompleteRecurrenceInstance(id, instance_start_utc, Context.User.Id);
            await RespondAsync("✔ That day is marked complete on the calendar. Undo reverses it.");
        }
        catch (Exception ex)
        {
            await RespondAsync($"❌ {ex.Message}", ephemeral: true);
        }
    }

    /// <summary>
    /// Edits title/description/notes/link and optional UTC start/end overrides for one recurrence occurrence.
    /// </summary>
    [SlashCommand("calendar-instance-edit", "Edit one recurring occurrence")]
    public async Task InstanceEdit(
        int id,
        string instance_start_utc,
        string title = "",
        string description = "",
        string notes = "",
        string link = "",
        string override_start_utc = "",
        string override_end_utc = "")
    {
        try
        {
            var patch = new CalendarInstancePatchRequest
            {
                InstanceStartUtc = instance_start_utc,
                Title = string.IsNullOrWhiteSpace(title) ? null : title,
                Description = string.IsNullOrWhiteSpace(description) ? null : description,
                Notes = string.IsNullOrWhiteSpace(notes) ? null : notes,
                Link = string.IsNullOrWhiteSpace(link) ? null : link,
                OverrideInstanceStartUtc = string.IsNullOrWhiteSpace(override_start_utc) ? null : override_start_utc,
                OverrideInstanceEndUtc = string.IsNullOrWhiteSpace(override_end_utc) ? null : override_end_utc,
            };
            _calendar.PatchRecurrenceInstance(id, patch, Context.User.Id);
            await RespondAsync("✏️ That occurrence was updated. Undo reverses it.");
        }
        catch (Exception ex)
        {
            await RespondAsync($"❌ {ex.Message}", ephemeral: true);
        }
    }
}