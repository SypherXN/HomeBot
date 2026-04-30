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

    public ReminderService(
        DatabaseService db,
        DiscordSocketClient client,
        ChannelBindingService binding)
    {
        _db = db;
        _client = client;
        _binding = binding;
    }

    /// <summary>
    /// Starts the reminder polling loop.
    /// </summary>
    public async Task StartAsync()
    {
        while (true)
        {
            await CheckReminders();
            await Task.Delay(10000); // check every 10 seconds
        }
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

            var reminderTime = start.AddSeconds(-seconds);

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
                        $"📝 Name: {title}\n" +
                        $"📅 Event Time: {start}",
                        allowedMentions: AllowedMentions.All
                    );
                }

                // --- RECURRENCE LOGIC ---
                if (!string.IsNullOrWhiteSpace(recurrence))
                {
                    DateTime next = start;

                    if (recurrence == "daily")
                        next = start.AddDays(1);
                    else if (recurrence == "weekly")
                        next = start.AddDays(7);

                    var updateCmd = conn.CreateCommand();
                    updateCmd.CommandText = @"
                        UPDATE CalendarItems
                        SET StartDateTime = $next, ReminderSent = 0
                        WHERE Id = $id";

                    updateCmd.Parameters.AddWithValue("$next", next.ToString("yyyy-MM-dd HH:mm"));
                    updateCmd.Parameters.AddWithValue("$id", id);

                    updateCmd.ExecuteNonQuery();
                }
                else
                {
                    // normal one-time reminder
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