using System.Globalization;
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
    /// <param name="page">Zero-based page index.</param>
    /// <param name="typeFilter">Optional <c>"task"</c> or <c>"event"</c> filter (other values ignored).</param>
    public PagedResult<CalendarListItemModel> GetList(int page = 0, string? typeFilter = null)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        int pageSize = GetPageSize(conn);
        var householdTz = GetTimezone();

        var cmd = conn.CreateCommand();
        var whereType = typeFilter is "task" or "event" ? " AND Type = $type" : "";
        cmd.CommandText = $@"
        SELECT 
            Id,
            Title,
            Type,
            StartDateTime,
            AllDay,
            AssignedTo,
            Link,
            ReminderOffset,
            Recurrence,
            COALESCE(Timezone, '') AS ItemTz
        FROM CalendarItems
        WHERE Status = 'active'{whereType}
        ORDER BY 
            CASE 
                WHEN StartDateTime IS NULL OR StartDateTime = '' THEN 1 
                ELSE 0 
            END,
            StartDateTime ASC";

        if (whereType.Length > 0)
            cmd.Parameters.AddWithValue("$type", typeFilter!);

        using var reader = cmd.ExecuteReader();
        var allItems = new List<CalendarListItemModel>();

        while (reader.Read())
        {
            var startRaw = reader.IsDBNull(3) ? "" : reader.GetString(3);
            var dateText = "";
            var sortDate = DateTime.MaxValue;

            var rowTzId = reader.IsDBNull(9) ? "" : reader.GetString(9);
            var rowTz = TimeZoneResolver.Resolve(string.IsNullOrWhiteSpace(rowTzId) ? null : rowTzId, householdTz.Id);

            if (!string.IsNullOrWhiteSpace(startRaw) &&
                DateTime.TryParse(startRaw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsedUtc))
            {
                parsedUtc = DateTime.SpecifyKind(parsedUtc, DateTimeKind.Utc);
                try
                {
                    var local = TimeZoneInfo.ConvertTimeFromUtc(parsedUtc, rowTz);
                    dateText = local.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
                    sortDate = local;
                }
                catch
                {
                    dateText = startRaw;
                }
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

            var assignedTo = reader.IsDBNull(5) ? null : (ulong?)reader.GetInt64(5);

            allItems.Add(new CalendarListItemModel
            {
                Id = reader.GetInt32(0),
                Title = reader.GetString(1),
                Type = reader.GetString(2),
                DateText = dateText,
                AllDay = reader.GetInt32(4) == 1,
                AssignedTo = assignedTo,
                AssignedToMemberLabel = HouseholdIdentity.MemberLabel(assignedTo),
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
    /// <param name="timezone">When set, updates the row's event time zone id (IANA or Windows).</param>
    public void EditItem(
        int id,
        string title,
        string start,
        string end,
        string description,
        string notes,
        string link,
        string? timezone)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var householdTz = GetTimezone();
        var get = conn.CreateCommand();
        get.CommandText = "SELECT COALESCE(Timezone, ''), IFNULL(StartDateTime, ''), IFNULL(EndDateTime, '') FROM CalendarItems WHERE Id = $id";
        get.Parameters.AddWithValue("$id", id);
        var rowTzId = "";
        using (var r = get.ExecuteReader())
        {
            if (!r.Read())
                return;
            rowTzId = r.IsDBNull(0) ? "" : r.GetString(0);
        }

        var mergedTzId = !string.IsNullOrWhiteSpace(timezone) ? timezone.Trim() : rowTzId;
        var eventTz = TimeZoneResolver.Resolve(string.IsNullOrWhiteSpace(mergedTzId) ? null : mergedTzId, householdTz.Id);

        var updates = new List<string>();
        var cmd = conn.CreateCommand();

        if (!string.IsNullOrWhiteSpace(title))
        {
            updates.Add("Title = $title");
            cmd.Parameters.AddWithValue("$title", title);
        }

        if (!string.IsNullOrWhiteSpace(start))
        {
            var norm = NormalizeCalendarInstantToUtcStorage(start.Trim(), eventTz);
            updates.Add("StartDateTime = $start");
            cmd.Parameters.AddWithValue("$start", norm);
        }

        if (!string.IsNullOrWhiteSpace(end))
        {
            var norm = NormalizeCalendarInstantToUtcStorage(end.Trim(), eventTz);
            updates.Add("EndDateTime = $end");
            cmd.Parameters.AddWithValue("$end", norm);
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

        if (!string.IsNullOrWhiteSpace(timezone))
        {
            updates.Add("Timezone = $tz");
            cmd.Parameters.AddWithValue("$tz", timezone.Trim());
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
    /// Converts API/user input to the UTC wall string stored in <c>StartDateTime</c>/<c>EndDateTime</c>.
    /// </summary>
    public static string NormalizeCalendarInstantToUtcStorage(string raw, TimeZoneInfo eventTz)
    {
        if (TimeZoneResolver.TryParseWallDateTimeToUtcStorage(raw, eventTz, out var utc, out _))
            return utc;
        if (DateTime.TryParseExact(
                raw,
                "yyyy-MM-dd HH:mm",
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var asUtc))
            return DateTime.SpecifyKind(asUtc, DateTimeKind.Utc).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        var parsed = DateParser.Parse(raw);
        if (parsed.HasValue)
        {
            var wall = DateTime.SpecifyKind(parsed.Value, DateTimeKind.Unspecified);
            return TimeZoneInfo.ConvertTimeToUtc(wall, eventTz).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        }

        return raw;
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
            SELECT Title, Description, Notes, Link, StartDateTime, AllDay, ReminderOffset, COALESCE(Timezone, '') AS ItemTz
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
            Reminder = reader.IsDBNull(6) ? "" : reader.GetString(6),
            Timezone = reader.IsDBNull(7) ? "" : reader.GetString(7)
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
                AssignedTo = assigned,
                AssignedToMemberLabel = HouseholdIdentity.MemberLabel(assigned)
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
                AssignedToMemberLabel = HouseholdIdentity.MemberLabel(assigned),
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

    /// <summary>
    /// Maximum window size accepted by <see cref="GetRange"/> to keep response sizes bounded.
    /// </summary>
    public const int RangeMaxDays = 92;

    /// <summary>
    /// Returns events overlapping the calendar-day window <c>[fromLocal, toLocal)</c>, expanding
    /// daily/weekly recurring rows into one entry per occurrence. Tasks (rows with empty
    /// <c>StartDateTime</c>) are excluded; fetch them via <see cref="GetList"/> with a
    /// <c>typeFilter</c> instead.
    /// </summary>
    /// <param name="fromLocal">Inclusive start date (calendar components only).</param>
    /// <param name="toLocal">Exclusive end date (calendar components only).</param>
    /// <param name="userFilter">Optional Discord user id; rows assigned to this user or to everyone (0) match.</param>
    /// <param name="windowTimeZoneId">IANA or Windows id used to turn <paramref name="fromLocal"/>/<paramref name="toLocal"/> into a UTC half-open window; null uses household Settings.</param>
    public List<CalendarRangeItemModel> GetRange(DateTime fromLocal, DateTime toLocal, ulong? userFilter = null, string? windowTimeZoneId = null)
    {
        var output = new List<CalendarRangeItemModel>();
        if (toLocal <= fromLocal)
            return output;
        if ((toLocal - fromLocal).TotalDays > RangeMaxDays)
            return output;

        var householdTz = GetTimezone();
        var windowTz = TimeZoneResolver.Resolve(string.IsNullOrWhiteSpace(windowTimeZoneId) ? null : windowTimeZoneId, householdTz.Id);
        var fromUtc = TimeZoneResolver.LocalDateToUtc(fromLocal, windowTz);
        var toUtcExclusive = TimeZoneResolver.LocalDateToUtc(toLocal, windowTz);

        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Title, Type, StartDateTime, EndDateTime, AllDay, AssignedTo, Link, ReminderOffset, Recurrence, COALESCE(Timezone, '') AS ItemTz
            FROM CalendarItems
            WHERE Status = 'active' AND StartDateTime IS NOT NULL AND StartDateTime != ''";

        using var reader = cmd.ExecuteReader();

        while (reader.Read())
        {
            var rowTzId = reader.IsDBNull(10) ? "" : reader.GetString(10);
            var rowTz = TimeZoneResolver.Resolve(string.IsNullOrWhiteSpace(rowTzId) ? null : rowTzId, householdTz.Id);

            var startRaw = reader.GetString(3);
            if (!DateTime.TryParse(startRaw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var startUtc))
                continue;
            startUtc = DateTime.SpecifyKind(startUtc, DateTimeKind.Utc);

            DateTime startLocalRow;
            try
            {
                startLocalRow = TimeZoneInfo.ConvertTimeFromUtc(startUtc, rowTz);
            }
            catch
            {
                continue;
            }

            TimeSpan? duration = null;
            var endRaw = reader.IsDBNull(4) ? "" : reader.GetString(4);
            if (!string.IsNullOrWhiteSpace(endRaw) &&
                DateTime.TryParse(endRaw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var endUtc))
            {
                endUtc = DateTime.SpecifyKind(endUtc, DateTimeKind.Utc);
                try
                {
                    var endLocalRow = TimeZoneInfo.ConvertTimeFromUtc(endUtc, rowTz);
                    if (endLocalRow > startLocalRow)
                        duration = endLocalRow - startLocalRow;
                }
                catch
                {
                    // ignore unparseable end; treat as no end
                }
            }

            var assigned = reader.IsDBNull(6) ? null : (ulong?)reader.GetInt64(6);

            if (userFilter.HasValue && assigned.HasValue && assigned.Value != 0 && assigned.Value != userFilter.Value)
                continue;

            var meta = new RangeRowMeta
            {
                Id = reader.GetInt32(0),
                Title = reader.GetString(1),
                Type = reader.GetString(2),
                AllDay = reader.GetInt32(5) == 1,
                Assigned = assigned,
                Link = reader.IsDBNull(7) ? "" : reader.GetString(7),
                ReminderRaw = reader.IsDBNull(8) ? "" : reader.GetString(8),
                Recurrence = reader.IsDBNull(9) ? "" : reader.GetString(9),
                TimezoneId = rowTz.Id,
            };

            var winStartDate = TimeZoneInfo.ConvertTimeFromUtc(fromUtc, rowTz).Date;
            var winEndDateInclusive = TimeZoneInfo.ConvertTimeFromUtc(toUtcExclusive.AddTicks(-1), rowTz).Date;

            switch (meta.Recurrence)
            {
                case "daily":
                    {
                        var firstDay = startLocalRow.Date > winStartDate ? startLocalRow.Date : winStartDate;
                        for (var d = firstDay; d <= winEndDateInclusive; d = d.AddDays(1))
                            EmitInstance(output, meta, d.Add(startLocalRow.TimeOfDay), duration, rowTz, true, fromUtc, toUtcExclusive);
                        break;
                    }
                case "weekly":
                    {
                        for (var d = winStartDate; d <= winEndDateInclusive; d = d.AddDays(1))
                        {
                            if (d < startLocalRow.Date)
                                continue;
                            if ((d - startLocalRow.Date).TotalDays % 7 != 0)
                                continue;
                            EmitInstance(output, meta, d.Add(startLocalRow.TimeOfDay), duration, rowTz, true, fromUtc, toUtcExclusive);
                        }

                        break;
                    }
                default:
                    EmitInstance(output, meta, startLocalRow, duration, rowTz, false, fromUtc, toUtcExclusive);
                    break;
            }
        }

        output.Sort((a, b) => string.CompareOrdinal(a.InstanceStartUtc, b.InstanceStartUtc));
        return output;
    }

    private struct RangeRowMeta
    {
        public int Id;
        public string Title;
        public string Type;
        public bool AllDay;
        public ulong? Assigned;
        public string Link;
        public string ReminderRaw;
        public string Recurrence;
        public string TimezoneId;
    }

    private static void EmitInstance(
        List<CalendarRangeItemModel> output,
        RangeRowMeta meta,
        DateTime instanceLocal,
        TimeSpan? duration,
        TimeZoneInfo tz,
        bool isRecurring,
        DateTime fromUtc,
        DateTime toUtcExclusive)
    {
        DateTime instanceUtc;
        try
        {
            instanceUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(instanceLocal, DateTimeKind.Unspecified), tz);
        }
        catch
        {
            // Local time is invalid (DST spring-forward gap) — skip this occurrence.
            return;
        }

        string? endIso = null;
        DateTime instanceEndUtc = instanceUtc;
        if (duration.HasValue)
        {
            try
            {
                var endLocal = instanceLocal + duration.Value;
                instanceEndUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(endLocal, DateTimeKind.Unspecified), tz);
                endIso = instanceEndUtc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
            }
            catch
            {
                endIso = null;
            }
        }
        else if (meta.AllDay)
        {
            try
            {
                instanceEndUtc = TimeZoneInfo.ConvertTimeToUtc(
                    DateTime.SpecifyKind(instanceLocal.Date.AddDays(1), DateTimeKind.Unspecified),
                    tz);
                endIso = instanceEndUtc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
            }
            catch
            {
                instanceEndUtc = instanceUtc.AddDays(1);
                endIso = instanceEndUtc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
            }
        }

        if (instanceUtc >= toUtcExclusive || instanceEndUtc <= fromUtc)
            return;

        var recurrenceText = meta.Recurrence switch
        {
            "daily" => "🔁 daily",
            "weekly" => "🔁 weekly",
            "" => "",
            _ => $"🔁 {meta.Recurrence}",
        };

        output.Add(new CalendarRangeItemModel
        {
            Id = meta.Id,
            Title = meta.Title,
            Type = meta.Type,
            AllDay = meta.AllDay,
            AssignedTo = meta.Assigned,
            AssignedToMemberLabel = HouseholdIdentity.MemberLabel(meta.Assigned),
            HasLink = !string.IsNullOrWhiteSpace(meta.Link),
            ReminderText = ReminderFormatter.Format(meta.ReminderRaw),
            RecurrenceText = recurrenceText,
            Recurrence = meta.Recurrence,
            InstanceStartUtc = instanceUtc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
            InstanceEndUtc = endIso,
            IsRecurringInstance = isRecurring,
            TimeZoneId = meta.TimezoneId,
        });
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
        var timezone = _config.Get("timezone");
        return TimeZoneResolver.Resolve(
            string.IsNullOrWhiteSpace(timezone) ? null : timezone,
            TimeZoneResolver.DefaultHouseholdTimeZoneId);
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