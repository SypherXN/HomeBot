using Discord;
using Microsoft.Data.Sqlite;
using Discord.WebSocket;

/// <summary>
/// Background worker that checks calendar reminders and posts notifications.
/// </summary>
public class ReminderService
{
    private readonly DatabaseService _db;
    private readonly DiscordSocketClient _client;
    private readonly ChannelBindingService _binding;
    private readonly NotificationPreferencesService _prefs;
    private readonly WebPushService _push;

    public ReminderService(
        DatabaseService db,
        DiscordSocketClient client,
        ChannelBindingService binding,
        NotificationPreferencesService prefs,
        WebPushService push)
    {
        _db = db;
        _client = client;
        _binding = binding;
        _prefs = prefs;
        _push = push;
    }

    /// <summary>
    /// Starts the reminder polling loop.
    /// </summary>
    public async Task StartAsync()
    {
        var pollSeconds = ReadReminderPollSeconds();
        while (true)
        {
            await CheckReminders();
            await Task.Delay(TimeSpan.FromSeconds(pollSeconds));
        }
    }

    /// <summary>Default 30s; override with HOMEBOT_REMINDER_POLL_SECONDS (10–300).</summary>
    private static int ReadReminderPollSeconds()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_REMINDER_POLL_SECONDS");
        if (!int.TryParse(raw, out var seconds))
            return 30;
        return Math.Clamp(seconds, 10, 300);
    }

    private static bool ShouldSendCalendarReminderDm() =>
        string.Equals(
            Environment.GetEnvironmentVariable("HOMEBOT_CALENDAR_REMINDER_DM")?.Trim(),
            "true",
            StringComparison.OrdinalIgnoreCase);

    private static void AdvanceRecurringStart(SqliteConnection conn, int id, DateTime currentStart, string recurrence)
    {
        DateTime next = currentStart;
        if (recurrence == "daily")
            next = currentStart.AddDays(1);
        else if (recurrence == "weekly")
            next = currentStart.AddDays(7);

        var updateCmd = conn.CreateCommand();
        updateCmd.CommandText = @"
            UPDATE CalendarItems
            SET StartDateTime = $next, ReminderSent = 0
            WHERE Id = $id";
        updateCmd.Parameters.AddWithValue("$next", next.ToString("yyyy-MM-dd HH:mm"));
        updateCmd.Parameters.AddWithValue("$id", id);
        updateCmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Checks active reminders and sends due notifications.
    /// </summary>
    private async Task CheckReminders()
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();

        cmd.CommandText = @"
            SELECT Id, Title, StartDateTime, ReminderOffset, ReminderSent, AssignedTo, Recurrence
            FROM CalendarItems
            WHERE Status = 'active' 
            AND ReminderOffset IS NOT NULL 
            AND ReminderOffset != ''";

        using var reader = cmd.ExecuteReader();

        var now = DateTime.Now;

        while (reader.Read())
        {
            int id = reader.GetInt32(0);
            string title = reader.GetString(1);
            string startStr = reader.GetString(2);
            string offsetStr = reader.GetString(3);
            int reminderSent = reader.GetInt32(4);

            ulong? assigned = reader.IsDBNull(5) ? null : (ulong?)reader.GetInt64(5);
            string recurrence = reader.IsDBNull(6) ? "" : reader.GetString(6);

            string mention;

            if (!assigned.HasValue)
            {
                mention = "";
            }
            else if (assigned.Value == 0)
            {
                mention = "@everyone";
            }
            else
            {
                mention = $"<@{assigned.Value}>";
            }

            if (!DateTime.TryParse(startStr, out var start))
                continue;

            if (!double.TryParse(offsetStr, out var seconds))
                continue;

            var titleForMessage = title;
            var eventTimeForReminder = start;
            var suppressSend = false;

            if (!string.IsNullOrWhiteSpace(recurrence))
            {
                try
                {
                    var instanceKey = CalendarService.NormalizeDbStartToInstanceKeyUtc(startStr);
                    if (CalendarService.TryLoadRecurrenceExceptionForReminder(
                            conn,
                            id,
                            instanceKey,
                            out var overrideTitle,
                            out var overrideStartZ,
                            out suppressSend))
                    {
                        if (suppressSend)
                        {
                            AdvanceRecurringStart(conn, id, start, recurrence);
                            continue;
                        }

                        if (!string.IsNullOrEmpty(overrideTitle))
                            titleForMessage = overrideTitle;
                        if (!string.IsNullOrWhiteSpace(overrideStartZ) &&
                            DateTimeOffset.TryParse(
                                overrideStartZ,
                                System.Globalization.CultureInfo.InvariantCulture,
                                System.Globalization.DateTimeStyles.AssumeUniversal |
                                System.Globalization.DateTimeStyles.AdjustToUniversal,
                                out var dto))
                        {
                            eventTimeForReminder = dto.UtcDateTime;
                        }
                    }
                }
                catch
                {
                    // Bad start string — skip this row.
                    continue;
                }
            }

            var reminderTime = eventTimeForReminder.AddSeconds(-seconds);

            if (reminderSent == 0 && now >= reminderTime)
            {
                var channelId = _binding.GetChannel("calendar");

                if (!channelId.HasValue)
                    continue;

                var channel = _client.GetChannel(channelId.Value) as IMessageChannel;

                if (channel != null)
                {
                    await channel.SendMessageAsync(
                        $"⏰ Reminder: {mention}\n" +
                        $"🆔 ID: #{id}\n" +
                        $"📝 Name: {titleForMessage}\n" +
                        $"📅 Event Time: {eventTimeForReminder}",
                        allowedMentions: AllowedMentions.All
                    );
                }

                if (ShouldSendCalendarReminderDm() &&
                    assigned.HasValue &&
                    assigned.Value != 0 &&
                    _prefs.ShouldReceive(assigned.Value, "calendar_dm") &&
                    _client.GetUser(assigned.Value) is IUser dmUser)
                {
                    try
                    {
                        await dmUser.SendMessageAsync(
                            $"⏰ **Calendar reminder**\n" +
                            $"📝 {titleForMessage}\n" +
                            $"📅 {eventTimeForReminder:yyyy-MM-dd HH:mm}");
                    }
                    catch
                    {
                        // DMs may be disabled — channel reminder still sent.
                    }
                }

                if (assigned.HasValue &&
                    assigned.Value != 0 &&
                    _prefs.ShouldReceive(assigned.Value, "calendar_dm"))
                {
                    await _push.TryNotifyUserAsync(
                        assigned.Value,
                        "Calendar reminder",
                        $"{titleForMessage} · {eventTimeForReminder:yyyy-MM-dd HH:mm}",
                        $"/calendar?highlight={id}");
                }

                if (!string.IsNullOrWhiteSpace(recurrence))
                {
                    AdvanceRecurringStart(conn, id, start, recurrence);
                }
                else
                {
                    var updateCmd = conn.CreateCommand();
                    updateCmd.CommandText = @"
                        UPDATE CalendarItems
                        SET ReminderSent = 1
                        WHERE Id = $id";

                    updateCmd.Parameters.AddWithValue("$id", id);
                    updateCmd.ExecuteNonQuery();
                }
            }
        }
    }
}
