using Microsoft.Data.Sqlite;
using Discord;

/// <summary>
/// Domain logic for calendar persistence, list rendering, and undo behavior.
/// </summary>
public class CalendarService
{
    private readonly DatabaseService _db;
    private readonly UndoService _undo;
    private readonly ConfigService _config;

    public CalendarService(DatabaseService db, UndoService undo, ConfigService config)
    {
        _db = db;
        _undo = undo;
        _config = config;
    }

    /// <summary>
    /// Inserts a new calendar event or task.
    /// </summary>
    public void AddItem(
        string title,
        string type,
        string start,
        string end,
        bool allDay,
        string reminder,
        ulong? assignedTo,
        string description,
        string notes,
        string link,
        string recurrence,
        string timezone
    )
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();

        cmd.CommandText = @"
        INSERT INTO CalendarItems
        (Title, Type, StartDateTime, EndDateTime, AllDay, ReminderOffset, AssignedTo, Description, Notes, Link, Recurrence, Timezone, Status)
        VALUES ($title, $type, $start, $end, $allDay, $reminder, $assigned, $desc, $notes, $link, $recurrence, $timezone, 'active')";

        cmd.Parameters.AddWithValue("$title", title);
        cmd.Parameters.AddWithValue("$type", type);
        cmd.Parameters.AddWithValue("$start", start);
        cmd.Parameters.AddWithValue("$end", end);
        cmd.Parameters.AddWithValue("$allDay", allDay ? 1 : 0);
        cmd.Parameters.AddWithValue("$reminder", reminder);
        cmd.Parameters.AddWithValue("$link", link);
        cmd.Parameters.AddWithValue("$recurrence", recurrence);
        cmd.Parameters.AddWithValue("$timezone", timezone);

        if (assignedTo.HasValue)
            cmd.Parameters.AddWithValue("$assigned", (long)assignedTo.Value);
        else
            cmd.Parameters.AddWithValue("$assigned", DBNull.Value);

        cmd.Parameters.AddWithValue("$desc", description);
        cmd.Parameters.AddWithValue("$notes", notes);

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Builds the primary paginated calendar list UI.
    /// </summary>
    public async Task<(Embed embed, MessageComponent components)> BuildList(int page = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        int pageSize = 5;

        var configCmd = conn.CreateCommand();
        configCmd.CommandText = "SELECT Value FROM Settings WHERE Key = 'page_size'";
        var result = configCmd.ExecuteScalar();

        if (result != null && int.TryParse(result.ToString(), out int parsed))
            pageSize = parsed;

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
        SELECT 
            Id,
            Title,
            Type,
            StartDateTime,
            AllDay,
            AssignedTo,
            Link,
            ReminderOffset,
            Recurrence
        FROM CalendarItems
        WHERE Status = 'active'
        ORDER BY 
            CASE 
                WHEN StartDateTime IS NULL OR StartDateTime = '' THEN 1 
                ELSE 0 
            END,
            StartDateTime ASC";

        using var reader = cmd.ExecuteReader();

        var rows = new List<string>();
        var ids = new List<int>();

        while (reader.Read())
        {
            int id = reader.GetInt32(0);
            string title = reader.GetString(1);
            string type = reader.GetString(2);

            string date = "";

            if (!reader.IsDBNull(3))
            {
                DateTime? utc = null;

                if (!reader.IsDBNull(3))
                {
                    var raw = reader.GetString(3);

                    if (!string.IsNullOrWhiteSpace(raw) && DateTime.TryParse(raw, out var parsedDate))
                    {
                        utc = parsedDate;
                    }
                }

                var timezone = _config.Get("timezone") ?? "Pacific Standard Time";

                TimeZoneInfo tz;

                try
                {
                    tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
                }
                catch
                {
                    tz = TimeZoneInfo.FindSystemTimeZoneById("Pacific Standard Time");
                }

                if (utc.HasValue)
                {
                    var local = TimeZoneInfo.ConvertTimeFromUtc(utc.Value, tz);
                    date = local.ToString("yyyy-MM-dd HH:mm");
                }
                else
                {
                    date = ""; // task or invalid date
                }
            }
            bool allDay = reader.GetInt32(4) == 1;

            ulong? assigned = reader.IsDBNull(5) ? null : (ulong?)reader.GetInt64(5);

            string assignedText;

            if (!assigned.HasValue)
            {
                assignedText = "anyone";
            }
            else if (assigned.Value == 0)
            {
                assignedText = "@everyone";
            }
            else
            {
                assignedText = $"<@{assigned.Value}>";
            }

            string reminderRaw = reader.IsDBNull(7) ? "" : reader.GetString(7);
            string reminderText = ReminderFormatter.Format(reminderRaw);

            string link = reader.IsDBNull(6) ? "" : reader.GetString(6);

            string recurrence = reader.IsDBNull(8) ? "" : reader.GetString(8);

            string recurrenceText = "";

            if (!string.IsNullOrWhiteSpace(recurrence))
            {
                recurrenceText = recurrence switch
                {
                    "daily" => "🔁 daily",
                    "weekly" => "🔁 weekly",
                    _ => $"🔁 {recurrence}"
                };
            }

            string icon = type == "task" ? "📝" : "📅";

            var line = $"{icon} **#{id} {title}**";

            if (type != "task")
            {
                if (!string.IsNullOrWhiteSpace(date))
                    line += $" | {date}";

                if (allDay)
                    line += " | All-day";
            }

            line += $" | 👤 {assignedText}";

            if (!string.IsNullOrWhiteSpace(recurrenceText))
                line += $" | {recurrenceText}";

            if (!string.IsNullOrWhiteSpace(reminderText))
                line += $" | ⏰ {reminderText}";

            if (!string.IsNullOrWhiteSpace(link))
                line += " | 🔗";

            rows.Add(line);
            ids.Add(id);
        }

        var allRows = rows.Select((line, index) => (id: ids[index], line)).ToList();

        var paged = allRows
            .Skip(page * pageSize)
            .Take(pageSize)
            .ToList();

        var pagedRows = paged.Select(x => x.line).ToList();
        var pagedIds = paged.Select(x => x.id).ToList();

        bool hasNext = allRows.Count > (page + 1) * pageSize;
        bool hasPrev = page > 0;

        var embed = ListUIBuilder.BuildEmbed("📅 Calendar", pagedRows);
        var components = new ComponentBuilder();

        // action buttons
        foreach (var id in pagedIds)
        {
            components.WithButton($"✔ {id}", $"calendar_complete_{id}", ButtonStyle.Success);
            components.WithButton($"❌ {id}", $"calendar_delete_{id}", ButtonStyle.Danger);
        }

        // pagination buttons
        if (hasPrev)
        {
            components.WithButton("⬅ Prev", $"calendar_page_{page - 1}", ButtonStyle.Secondary);
        }

        if (hasNext)
        {
            components.WithButton("Next ➡", $"calendar_page_{page + 1}", ButtonStyle.Secondary);
        }

        return (embed, components.Build());
    }

    /// <summary>
    /// Marks a calendar item complete and stores undo metadata.
    /// </summary>
    public void CompleteItem(int id, ulong userId)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        int pageSize = 5;

        var configCmd = conn.CreateCommand();
        configCmd.CommandText = "SELECT Value FROM Settings WHERE Key = 'page_size'";
        var result = configCmd.ExecuteScalar();

        if (result != null && int.TryParse(result.ToString(), out int parsed))
            pageSize = parsed;

        var getCmd = conn.CreateCommand();
        getCmd.CommandText = @"
            SELECT Status
            FROM CalendarItems
            WHERE Id = $id";

        getCmd.Parameters.AddWithValue("$id", id);

        var previousStatus = getCmd.ExecuteScalar()?.ToString() ?? "active";

        string json = System.Text.Json.JsonSerializer.Serialize(new
        {
            Status = previousStatus
        });

        _undo.LogAction(userId, "complete", "calendar", id, json);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE CalendarItems
            SET Status = 'completed'
            WHERE Id = $id";

        cmd.Parameters.AddWithValue("$id", id);

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Deletes a calendar item and stores restore data for undo.
    /// </summary>
    public void DeleteItem(int id, ulong userId)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        string json;

        // --- READ FIRST ---
        var getCmd = conn.CreateCommand();
        getCmd.CommandText = @"
            SELECT Title, Type, StartDateTime, EndDateTime, AllDay, AssignedTo, Description, Notes
            FROM CalendarItems
            WHERE Id = $id";

        getCmd.Parameters.AddWithValue("$id", id);

        using (var reader = getCmd.ExecuteReader())
        {
            if (!reader.Read())
                return;

            var data = new
            {
                Title = reader.GetString(0),
                Type = reader.GetString(1),
                Start = reader.IsDBNull(2) ? "" : reader.GetString(2),
                End = reader.IsDBNull(3) ? "" : reader.GetString(3),
                AllDay = reader.GetInt32(4),
                Assigned = reader.IsDBNull(5) ? (ulong?)null : (ulong?)reader.GetInt64(5),
                Description = reader.IsDBNull(6) ? "" : reader.GetString(6),
                Notes = reader.IsDBNull(7) ? "" : reader.GetString(7)
            };

            json = System.Text.Json.JsonSerializer.Serialize(data);
        } // ✅ reader CLOSED here

        _undo.LogAction(userId, "delete", "calendar", id, json);

        var deleteCmd = conn.CreateCommand();
        deleteCmd.CommandText = "DELETE FROM CalendarItems WHERE Id = $id";
        deleteCmd.Parameters.AddWithValue("$id", id);

        deleteCmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Applies partial updates to editable calendar fields.
    /// </summary>
    public void EditItem(
        int id,
        string title,
        string start,
        string end,
        string description,
        string notes,
        string link)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var updates = new List<string>();
        var cmd = conn.CreateCommand();

        if (!string.IsNullOrWhiteSpace(title))
        {
            updates.Add("Title = $title");
            cmd.Parameters.AddWithValue("$title", title);
        }

        if (!string.IsNullOrWhiteSpace(start))
        {
            updates.Add("StartDateTime = $start");
            cmd.Parameters.AddWithValue("$start", start);
        }

        if (!string.IsNullOrWhiteSpace(end))
        {
            updates.Add("EndDateTime = $end");
            cmd.Parameters.AddWithValue("$end", end);
        }

        if (!string.IsNullOrWhiteSpace(description))
        {
            updates.Add("Description = $desc");
            cmd.Parameters.AddWithValue("$desc", description);
        }

        if (!string.IsNullOrWhiteSpace(notes))
        {
            updates.Add("Notes = $notes");
            cmd.Parameters.AddWithValue("$notes", notes);
        }

        if (!string.IsNullOrWhiteSpace(link))
        {
            updates.Add("Link = $link");
            cmd.Parameters.AddWithValue("$link", link);
        }

        if (updates.Count == 0)
            return;

        cmd.CommandText = $@"
            UPDATE CalendarItems
            SET {string.Join(", ", updates)}
            WHERE Id = $id";

        cmd.Parameters.AddWithValue("$id", id);

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Returns one calendar item for detail view rendering.
    /// </summary>
    public dynamic? GetItem(int id)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Title, Description, Notes, Link, StartDateTime, AllDay, ReminderOffset
            FROM CalendarItems
            WHERE Id = $id";

        cmd.Parameters.AddWithValue("$id", id);

        using var reader = cmd.ExecuteReader();

        if (!reader.Read())
            return null;

        return new
        {
            Title = reader.GetString(0),
            Description = reader.IsDBNull(1) ? "" : reader.GetString(1),
            Notes = reader.IsDBNull(2) ? "" : reader.GetString(2),
            Link = reader.IsDBNull(3) ? "" : reader.GetString(3),
            Start = reader.IsDBNull(4) ? "" : reader.GetString(4),
            AllDay = reader.GetInt32(5) == 1,
            Reminder = reader.IsDBNull(6) ? "" : reader.GetString(6)
        };
    }

    /// <summary>
    /// Builds the paginated list of today's items.
    /// </summary>
    public async Task<(Embed embed, MessageComponent components)> BuildToday(ulong? userFilter = null, int page = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        int pageSize = 5;

        var configCmd = conn.CreateCommand();
        configCmd.CommandText = "SELECT Value FROM Settings WHERE Key = 'page_size'";
        var result = configCmd.ExecuteScalar();

        if (result != null && int.TryParse(result.ToString(), out int parsed))
            pageSize = parsed;

        var todayStart = DateTime.Today;
        var todayEnd = todayStart.AddDays(1);

        var cmd = conn.CreateCommand();

        cmd.CommandText = @"
            SELECT Id, Title, Type, StartDateTime, AllDay, AssignedTo
            FROM CalendarItems
            WHERE Status = 'active'
        ";

        using var reader = cmd.ExecuteReader();

        var allRows = new List<string>();

        while (reader.Read())
        {
            int id = reader.GetInt32(0);
            string title = reader.GetString(1);
            string type = reader.GetString(2);

            string dateStr = reader.IsDBNull(3) ? "" : reader.GetString(3);
            bool allDay = reader.GetInt32(4) == 1;

            ulong? assigned = reader.IsDBNull(5) ? null : (ulong?)reader.GetInt64(5);

            // --- FILTER ---
            if (userFilter.HasValue)
            {
                if (assigned.HasValue)
                {
                    if (assigned.Value != userFilter.Value && assigned.Value != 0)
                        continue;
                }
            }

            // --- TIME FILTER ---
            if (type != "task")
            {
                if (string.IsNullOrWhiteSpace(dateStr))
                    continue;

                if (!DateTime.TryParse(dateStr, out var dt))
                    continue;

                if (dt < todayStart || dt >= todayEnd)
                    continue;
            }

            string assignedText = assigned switch
            {
                null => "anyone",
                0 => "@everyone",
                _ => $"<@{assigned.Value}>"
            };

            string icon = type == "task" ? "📝" : "📅";

            var line = $"{icon} **#{id} {title}** | 👤 {assignedText}";

            allRows.Add(line);
        }

        var paged = allRows
            .Skip(page * pageSize)
            .Take(pageSize)
            .ToList();

        bool hasNext = allRows.Count > (page + 1) * pageSize;
        bool hasPrev = page > 0;

        var embed = ListUIBuilder.BuildEmbed("📅 Today", paged);

        var components = new ComponentBuilder();

        if (hasPrev)
            components.WithButton("⬅ Prev", $"calendar_today_page_{page - 1}", ButtonStyle.Secondary);

        if (hasNext)
            components.WithButton("Next ➡", $"calendar_today_page_{page + 1}", ButtonStyle.Secondary);

        return (embed, components.Build());
    }

    /// <summary>
    /// Builds the paginated list of upcoming items.
    /// </summary>
    public async Task<(Embed embed, MessageComponent components)> BuildUpcoming(ulong? userFilter = null, int page = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        int pageSize = 5;

        var configCmd = conn.CreateCommand();
        configCmd.CommandText = "SELECT Value FROM Settings WHERE Key = 'page_size'";
        var result = configCmd.ExecuteScalar();

        if (result != null && int.TryParse(result.ToString(), out int parsed))
            pageSize = parsed;

        var now = DateTime.Now;

        var cmd = conn.CreateCommand();

        cmd.CommandText = @"
            SELECT Id, Title, Type, StartDateTime, AllDay, AssignedTo
            FROM CalendarItems
            WHERE Status = 'active'
        ";

        using var reader = cmd.ExecuteReader();

        var rows = new List<(DateTime dt, string line)>();

        while (reader.Read())
        {
            int id = reader.GetInt32(0);
            string title = reader.GetString(1);
            string type = reader.GetString(2);

            string dateStr = reader.IsDBNull(3) ? "" : reader.GetString(3);
            bool allDay = reader.GetInt32(4) == 1;

            ulong? assigned = reader.IsDBNull(5) ? null : (ulong?)reader.GetInt64(5);

            // --- FILTER ---
            if (userFilter.HasValue)
            {
                if (assigned.HasValue)
                {
                    if (assigned.Value != userFilter.Value && assigned.Value != 0)
                        continue;
                }
            }

            DateTime dt = DateTime.MaxValue;

            if (type != "task")
            {
                if (!DateTime.TryParse(dateStr, out dt))
                    continue;

                if (dt < now)
                    continue;
            }

            string assignedText = assigned switch
            {
                null => "anyone",
                0 => "@everyone",
                _ => $"<@{assigned.Value}>"
            };

            string icon = type == "task" ? "📝" : "📅";

            var line = $"{icon} **#{id} {title}** | {dt} | 👤 {assignedText}";

            rows.Add((dt, line));
        }

        var sorted = rows.OrderBy(x => x.dt).Select(x => x.line).ToList();

        var paged = sorted
            .Skip(page * pageSize)
            .Take(pageSize)
            .ToList();

        bool hasNext = sorted.Count > (page + 1) * pageSize;
        bool hasPrev = page > 0;

        var embed = ListUIBuilder.BuildEmbed("📅 Upcoming", paged);

        var components = new ComponentBuilder();

        if (hasPrev)
            components.WithButton("⬅ Prev", $"calendar_upcoming_page_{page - 1}", ButtonStyle.Secondary);

        if (hasNext)
            components.WithButton("Next ➡", $"calendar_upcoming_page_{page + 1}", ButtonStyle.Secondary);

        return (embed, components.Build());
    }
}