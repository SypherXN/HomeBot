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
        var result = GetList(page);
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
        return (embed, components.Build());
    }

    /// <summary>
    /// Returns paginated calendar data for API and UI adapters.
    /// </summary>
    public PagedResult<CalendarListItemModel> GetList(int page = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        int pageSize = GetPageSize(conn);
        var tz = GetTimezone();

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
        var allItems = new List<CalendarListItemModel>();

        while (reader.Read())
        {
            var startRaw = reader.IsDBNull(3) ? "" : reader.GetString(3);
            var dateText = "";
            var sortDate = DateTime.MaxValue;

            if (!string.IsNullOrWhiteSpace(startRaw) && DateTime.TryParse(startRaw, out var parsedUtc))
            {
                var local = TimeZoneInfo.ConvertTimeFromUtc(parsedUtc, tz);
                dateText = local.ToString("yyyy-MM-dd HH:mm");
                sortDate = local;
            }

            var recurrence = reader.IsDBNull(8) ? "" : reader.GetString(8);
            var recurrenceText = recurrence switch
            {
                "daily" => "🔁 daily",
                "weekly" => "🔁 weekly",
                "" => "",
                _ => $"🔁 {recurrence}"
            };

            var reminderRaw = reader.IsDBNull(7) ? "" : reader.GetString(7);

            allItems.Add(new CalendarListItemModel
            {
                Id = reader.GetInt32(0),
                Title = reader.GetString(1),
                Type = reader.GetString(2),
                DateText = dateText,
                AllDay = reader.GetInt32(4) == 1,
                AssignedTo = reader.IsDBNull(5) ? null : (ulong?)reader.GetInt64(5),
                HasLink = !reader.IsDBNull(6) && !string.IsNullOrWhiteSpace(reader.GetString(6)),
                ReminderText = ReminderFormatter.Format(reminderRaw),
                RecurrenceText = recurrenceText,
                SortDate = sortDate
            });
        }

        var paged = allItems.Skip(page * pageSize).Take(pageSize).ToList();
        return new PagedResult<CalendarListItemModel>
        {
            Items = paged,
            Page = page,
            PageSize = pageSize,
            TotalCount = allItems.Count,
            HasNext = allItems.Count > (page + 1) * pageSize,
            HasPrev = page > 0
        };
    }

    /// <summary>
    /// Marks a calendar item complete and stores undo metadata.
    /// </summary>
    public void CompleteItem(int id, ulong userId)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var getCmd = conn.CreateCommand();
        getCmd.CommandText = @"
            SELECT Status
            FROM CalendarItems
            WHERE Id = $id";

        getCmd.Parameters.AddWithValue("$id", id);

        var previousStatus = getCmd.ExecuteScalar()?.ToString() ?? "active";

        var json = System.Text.Json.JsonSerializer.Serialize(new CalendarCompleteUndoModel
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
            SELECT Title, Type, StartDateTime, EndDateTime, AllDay, AssignedTo, Description, Notes, Link, ReminderOffset, Recurrence, Timezone, Status
            FROM CalendarItems
            WHERE Id = $id";

        getCmd.Parameters.AddWithValue("$id", id);

        using (var reader = getCmd.ExecuteReader())
        {
            if (!reader.Read())
                return;

            var data = new CalendarDeleteUndoModel
            {
                Title = reader.GetString(0),
                Type = reader.GetString(1),
                Start = reader.IsDBNull(2) ? "" : reader.GetString(2),
                End = reader.IsDBNull(3) ? "" : reader.GetString(3),
                AllDay = reader.GetInt32(4),
                Assigned = reader.IsDBNull(5) ? (ulong?)null : (ulong?)reader.GetInt64(5),
                Description = reader.IsDBNull(6) ? "" : reader.GetString(6),
                Notes = reader.IsDBNull(7) ? "" : reader.GetString(7),
                Link = reader.IsDBNull(8) ? "" : reader.GetString(8),
                ReminderOffset = reader.IsDBNull(9) ? "" : reader.GetString(9),
                Recurrence = reader.IsDBNull(10) ? "" : reader.GetString(10),
                Timezone = reader.IsDBNull(11) ? "" : reader.GetString(11),
                Status = reader.IsDBNull(12) ? "active" : reader.GetString(12)
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
    public CalendarItemDetailModel? GetItem(int id)
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

        return new CalendarItemDetailModel
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
        var result = GetToday(userFilter, page);
        var rows = result.Items.Select(FormatSimpleCalendarRow).ToList();
        var embed = ListUIBuilder.BuildEmbed("📅 Today", rows);

        var components = new ComponentBuilder();
        if (result.HasPrev)
            components.WithButton("⬅ Prev", $"calendar_today_page_{page - 1}", ButtonStyle.Secondary);
        if (result.HasNext)
            components.WithButton("Next ➡", $"calendar_today_page_{page + 1}", ButtonStyle.Secondary);

        return (embed, components.Build());
    }

    /// <summary>
    /// Returns today's calendar items with optional assignee filter.
    /// </summary>
    public PagedResult<CalendarListItemModel> GetToday(ulong? userFilter = null, int page = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        int pageSize = GetPageSize(conn);
        var todayStart = DateTime.Today;
        var todayEnd = todayStart.AddDays(1);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Title, Type, StartDateTime, AllDay, AssignedTo
            FROM CalendarItems
            WHERE Status = 'active'
        ";

        using var reader = cmd.ExecuteReader();
        var allItems = new List<CalendarListItemModel>();
        while (reader.Read())
        {
            var type = reader.GetString(2);
            var dateStr = reader.IsDBNull(3) ? "" : reader.GetString(3);
            var assigned = reader.IsDBNull(5) ? null : (ulong?)reader.GetInt64(5);

            if (userFilter.HasValue && assigned.HasValue && assigned.Value != userFilter.Value && assigned.Value != 0)
                continue;

            if (type != "task")
            {
                if (string.IsNullOrWhiteSpace(dateStr) || !DateTime.TryParse(dateStr, out var dt))
                    continue;
                if (dt < todayStart || dt >= todayEnd)
                    continue;
            }

            allItems.Add(new CalendarListItemModel
            {
                Id = reader.GetInt32(0),
                Title = reader.GetString(1),
                Type = type,
                AssignedTo = assigned
            });
        }

        var paged = allItems.Skip(page * pageSize).Take(pageSize).ToList();
        return new PagedResult<CalendarListItemModel>
        {
            Items = paged,
            Page = page,
            PageSize = pageSize,
            TotalCount = allItems.Count,
            HasNext = allItems.Count > (page + 1) * pageSize,
            HasPrev = page > 0
        };
    }

    /// <summary>
    /// Builds the paginated list of upcoming items.
    /// </summary>
    public async Task<(Embed embed, MessageComponent components)> BuildUpcoming(ulong? userFilter = null, int page = 0)
    {
        var result = GetUpcoming(userFilter, page);
        var rows = result.Items.Select(FormatUpcomingCalendarRow).ToList();
        var embed = ListUIBuilder.BuildEmbed("📅 Upcoming", rows);

        var components = new ComponentBuilder();
        if (result.HasPrev)
            components.WithButton("⬅ Prev", $"calendar_upcoming_page_{page - 1}", ButtonStyle.Secondary);
        if (result.HasNext)
            components.WithButton("Next ➡", $"calendar_upcoming_page_{page + 1}", ButtonStyle.Secondary);

        return (embed, components.Build());
    }

    /// <summary>
    /// Returns upcoming calendar items with optional assignee filter.
    /// </summary>
    public PagedResult<CalendarListItemModel> GetUpcoming(ulong? userFilter = null, int page = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        int pageSize = GetPageSize(conn);
        var now = DateTime.Now;

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Title, Type, StartDateTime, AssignedTo
            FROM CalendarItems
            WHERE Status = 'active'
        ";

        using var reader = cmd.ExecuteReader();
        var allItems = new List<CalendarListItemModel>();
        while (reader.Read())
        {
            var type = reader.GetString(2);
            var dateStr = reader.IsDBNull(3) ? "" : reader.GetString(3);
            var assigned = reader.IsDBNull(4) ? null : (ulong?)reader.GetInt64(4);

            if (userFilter.HasValue && assigned.HasValue && assigned.Value != userFilter.Value && assigned.Value != 0)
                continue;

            var dt = DateTime.MaxValue;
            if (type != "task")
            {
                if (!DateTime.TryParse(dateStr, out dt))
                    continue;
                if (dt < now)
                    continue;
            }

            allItems.Add(new CalendarListItemModel
            {
                Id = reader.GetInt32(0),
                Title = reader.GetString(1),
                Type = type,
                AssignedTo = assigned,
                DateText = dt.ToString(),
                SortDate = dt
            });
        }

        var sorted = allItems.OrderBy(x => x.SortDate).ToList();
        var paged = sorted.Skip(page * pageSize).Take(pageSize).ToList();
        return new PagedResult<CalendarListItemModel>
        {
            Items = paged,
            Page = page,
            PageSize = pageSize,
            TotalCount = sorted.Count,
            HasNext = sorted.Count > (page + 1) * pageSize,
            HasPrev = page > 0
        };
    }

    private int GetPageSize(SqliteConnection conn)
    {
        int pageSize = 5;
        var configCmd = conn.CreateCommand();
        configCmd.CommandText = "SELECT Value FROM Settings WHERE Key = 'page_size'";
        var result = configCmd.ExecuteScalar();
        if (result != null && int.TryParse(result.ToString(), out int parsed))
            pageSize = parsed;
        return pageSize;
    }

    private TimeZoneInfo GetTimezone()
    {
        var timezone = _config.Get("timezone") ?? "Pacific Standard Time";
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(timezone);
        }
        catch
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Pacific Standard Time");
        }
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