using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Domain logic for calendar persistence, list rendering, and undo behavior.
/// </summary>
public class CalendarService
{
    private readonly DatabaseService _db;
    private readonly UndoService _undo;
    private readonly ConfigService _config;
    private readonly IServiceProvider _services;

    public CalendarService(DatabaseService db, UndoService undo, ConfigService config, IServiceProvider services)
    {
        _db = db;
        _undo = undo;
        _config = config;
        _services = services;
    }

    private void MarkGooglePendingPush(int calendarItemId)
    {
        _services.GetService<GoogleCalendarSyncService>()?.MarkPendingPush(calendarItemId);
    }

    /// <summary>
    /// Inserts a new calendar event or task.
    /// </summary>
    public int AddItem(
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
        string timezone,
        bool syncToGoogle = true
    )
    {
        recurrence = ValidationHelper.NormalizeRecurrence(recurrence);
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

        var idCmd = conn.CreateCommand();
        idCmd.CommandText = "SELECT last_insert_rowid()";
        var id = Convert.ToInt32(idCmd.ExecuteScalar()!);
        if (syncToGoogle)
            MarkGooglePendingPush(id);
        return id;
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
            var recurrenceText = RecurrenceRule.Describe(recurrence);

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
        MarkGooglePendingPush(id);
    }

    /// <summary>
    /// Deletes a calendar item and stores restore data for undo.
    /// </summary>
    public void DeleteItem(int id, ulong userId, bool propagateGoogleDelete = true)
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

        if (propagateGoogleDelete)
            _services.GetService<GoogleCalendarSyncService>()?.OnLocalItemDeleted(id);

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
        string? timezone,
        bool? allDay = null,
        string? reminder = null,
        bool applyReminder = false,
        string? recurrence = null,
        bool applyRecurrence = false,
        ulong? assignedTo = null,
        bool applyAssignedTo = false,
        bool clearEnd = false,
        bool syncToGoogle = true)
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

        if (clearEnd)
        {
            updates.Add("EndDateTime = $end");
            cmd.Parameters.AddWithValue("$end", "");
        }
        else if (!string.IsNullOrWhiteSpace(end))
        {
            var norm = NormalizeCalendarInstantToUtcStorage(end.Trim(), eventTz);
            updates.Add("EndDateTime = $end");
            cmd.Parameters.AddWithValue("$end", norm);
        }

        if (allDay.HasValue)
        {
            updates.Add("AllDay = $allDay");
            cmd.Parameters.AddWithValue("$allDay", allDay.Value ? 1 : 0);
        }

        if (applyReminder)
        {
            updates.Add("ReminderOffset = $reminder");
            cmd.Parameters.AddWithValue("$reminder", reminder ?? "");
        }

        if (applyRecurrence)
        {
            updates.Add("Recurrence = $recurrence");
            cmd.Parameters.AddWithValue("$recurrence", ValidationHelper.NormalizeRecurrence(recurrence ?? ""));
        }

        if (applyAssignedTo)
        {
            updates.Add("AssignedTo = $assigned");
            if (assignedTo.HasValue)
                cmd.Parameters.AddWithValue("$assigned", (long)assignedTo.Value);
            else
                cmd.Parameters.AddWithValue("$assigned", DBNull.Value);
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
        if (syncToGoogle)
            MarkGooglePendingPush(id);
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
    /// Returns one calendar item for detail view rendering. When <paramref name="instanceStartUtcRaw"/> is set on a
    /// recurring series, merges that occurrence's exception overrides (same canonical key as range rows).
    /// </summary>
    public CalendarItemDetailModel? GetItem(int id, string? instanceStartUtcRaw = null)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Title, Description, Notes, Link, StartDateTime, EndDateTime, AllDay, ReminderOffset,
                   COALESCE(Timezone, '') AS ItemTz, COALESCE(Recurrence, '') AS Recur, AssignedTo, Type
            FROM CalendarItems
            WHERE Id = $id AND Status = 'active'";

        cmd.Parameters.AddWithValue("$id", id);

        string seriesStartRaw;
        string seriesEndRaw;
        CalendarItemDetailModel detail;
        using (var reader = cmd.ExecuteReader())
        {
            if (!reader.Read())
                return null;

            seriesStartRaw = reader.IsDBNull(4) ? "" : reader.GetString(4);
            seriesEndRaw = reader.IsDBNull(5) ? "" : reader.GetString(5);
            detail = new CalendarItemDetailModel
            {
                Title = reader.GetString(0),
                Type = reader.IsDBNull(11) ? "event" : reader.GetString(11),
                Description = reader.IsDBNull(1) ? "" : reader.GetString(1),
                Notes = reader.IsDBNull(2) ? "" : reader.GetString(2),
                Link = reader.IsDBNull(3) ? "" : reader.GetString(3),
                Start = seriesStartRaw,
                End = seriesEndRaw.Trim(),
                AllDay = reader.GetInt32(6) == 1,
                Reminder = reader.IsDBNull(7) ? "" : reader.GetString(7),
                Timezone = reader.IsDBNull(8) ? "" : reader.GetString(8),
                Recurrence = reader.IsDBNull(9) ? "" : reader.GetString(9),
                AssignedTo = reader.IsDBNull(10) ? null : (ulong)reader.GetInt64(10),
            };
        }

        if (string.IsNullOrWhiteSpace(instanceStartUtcRaw) || string.IsNullOrWhiteSpace(detail.Recurrence))
            return detail;

        var normalizedIso = NormalizeCalendarInstanceStartUtc(instanceStartUtcRaw);
        var ex = ReadRecurrenceExceptionUndo(conn, null, id, normalizedIso);
        if (ex != null && string.Equals(ex.ExceptionKind, "omit", StringComparison.OrdinalIgnoreCase))
            return null;

        if (!DateTimeOffset.TryParse(
                normalizedIso,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var canonDto))
        {
            return detail;
        }

        var canonUtc = canonDto.UtcDateTime;
        if (ex != null && !string.IsNullOrWhiteSpace(ex.OverrideInstanceStartUtc) &&
            DateTimeOffset.TryParse(
                ex.OverrideInstanceStartUtc,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var overS))
        {
            detail.Start = UtcInstantToStorageString(overS.UtcDateTime);
        }
        else
        {
            detail.Start = UtcInstantToStorageString(canonUtc);
        }

        if (ex != null && !string.IsNullOrWhiteSpace(ex.OverrideInstanceEndUtc) &&
            DateTimeOffset.TryParse(
                ex.OverrideInstanceEndUtc,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var overE))
        {
            detail.End = UtcInstantToStorageString(overE.UtcDateTime);
        }
        else if (TryParseUtcStorage(seriesStartRaw, out var serStartUtc) &&
                 TryParseUtcStorage(seriesEndRaw, out var serEndUtc) &&
                 serEndUtc > serStartUtc &&
                 TryParseUtcStorage(detail.Start, out var effStartUtc))
        {
            var span = serEndUtc - serStartUtc;
            detail.End = UtcInstantToStorageString(effStartUtc + span);
        }

        if (ex != null)
        {
            if (ex.OverrideTitle != null)
                detail.Title = ex.OverrideTitle;
            if (ex.OverrideDescription != null)
                detail.Description = ex.OverrideDescription;
            if (ex.OverrideNotes != null)
                detail.Notes = ex.OverrideNotes;
            if (ex.OverrideLink != null)
                detail.Link = ex.OverrideLink;
        }

        detail.InstanceStartUtc = normalizedIso;
        return detail;
    }

    private static bool TryParseUtcStorage(string raw, out DateTime utc)
    {
        utc = default;
        if (string.IsNullOrWhiteSpace(raw))
            return false;
        if (!DateTime.TryParse(
                raw.Trim(),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var dt))
            return false;
        utc = DateTime.SpecifyKind(dt, DateTimeKind.Utc);
        return true;
    }

    private static string UtcInstantToStorageString(DateTime utc)
    {
        utc = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
        return utc.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Returns today's calendar items with optional assignee filter.
    /// </summary>
    public PagedResult<CalendarListItemModel> GetToday(ulong? userFilter = null, int page = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var pageSize = GetPageSize(conn);

        var householdTz = GetTimezone();
        var todayLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, householdTz).Date;
        var range = GetRange(todayLocal, todayLocal.AddDays(1), userFilter, householdTz.Id);
        var events = range.Select(MapRangeOccurrenceToListItem).ToList();
        var tasks = LoadActiveTasksOnly(conn, userFilter);
        var allItems = events.Concat(tasks).OrderBy(x => x.SortDate).ToList();

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
    /// Returns upcoming calendar items with optional assignee filter.
    /// </summary>
    public PagedResult<CalendarListItemModel> GetUpcoming(ulong? userFilter = null, int page = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var pageSize = GetPageSize(conn);
        var nowUtc = DateTime.UtcNow;

        var householdTz = GetTimezone();
        var fromLocal = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, householdTz).Date;
        var toLocal = fromLocal.AddDays(RangeMaxDays);
        var range = GetRange(fromLocal, toLocal, userFilter, householdTz.Id);
        var events = range
            .Select(MapRangeOccurrenceToListItem)
            .Where(e => GetOccurrenceSortUtcFromListItem(e) >= nowUtc)
            .ToList();

        var tasks = LoadActiveTasksOnly(conn, userFilter);
        var sorted = events.Concat(tasks).OrderBy(x => x.SortDate).ToList();
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

    private static DateTime GetOccurrenceSortUtcFromListItem(CalendarListItemModel item)
    {
        if (string.IsNullOrWhiteSpace(item.InstanceStartUtc))
            return item.SortDate;
        var iso = item.InstanceStartUtc.Trim();
        if (!DateTimeOffset.TryParse(
                iso,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var dto))
            return item.SortDate;
        return dto.UtcDateTime;
    }

    private static CalendarListItemModel MapRangeOccurrenceToListItem(CalendarRangeItemModel r)
    {
        var startIso = string.IsNullOrWhiteSpace(r.DisplayInstanceStartUtc) ? r.InstanceStartUtc : r.DisplayInstanceStartUtc!;
        if (!DateTimeOffset.TryParse(
                startIso,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var dto))
        {
            return new CalendarListItemModel
            {
                Id = r.Id,
                Title = r.Title,
                Type = r.Type,
                DateText = startIso,
                AllDay = r.AllDay,
                AssignedTo = r.AssignedTo,
                AssignedToMemberLabel = r.AssignedToMemberLabel,
                ReminderText = r.ReminderText,
                RecurrenceText = r.RecurrenceText,
                HasLink = r.HasLink,
                SortDate = DateTime.UtcNow,
                InstanceStartUtc = r.InstanceStartUtc,
            };
        }

        var utc = dto.UtcDateTime;
        var rowTz = TimeZoneResolver.Resolve(
            string.IsNullOrWhiteSpace(r.TimeZoneId) ? null : r.TimeZoneId.Trim(),
            TimeZoneResolver.DefaultHouseholdTimeZoneId);
        DateTime local;
        try
        {
            local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), rowTz);
        }
        catch
        {
            local = utc;
        }

        return new CalendarListItemModel
        {
            Id = r.Id,
            Title = r.Title,
            Type = r.Type,
            DateText = local.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
            AllDay = r.AllDay,
            AssignedTo = r.AssignedTo,
            AssignedToMemberLabel = r.AssignedToMemberLabel,
            ReminderText = r.ReminderText,
            RecurrenceText = r.RecurrenceText,
            HasLink = r.HasLink,
            SortDate = local,
            InstanceStartUtc = r.InstanceStartUtc,
        };
    }

    private List<CalendarListItemModel> LoadActiveTasksOnly(SqliteConnection conn, ulong? userFilter)
    {
        var householdTz = GetTimezone();
        var list = new List<CalendarListItemModel>();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Title, Type, StartDateTime, AllDay, AssignedTo, Link, ReminderOffset, Recurrence,
                   COALESCE(Timezone, '') AS ItemTz
            FROM CalendarItems
            WHERE Status = 'active'
              AND Type = 'task'";

        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var assigned = reader.IsDBNull(5) ? null : (ulong?)reader.GetInt64(5);
            if (userFilter.HasValue && assigned.HasValue && assigned.Value != userFilter.Value && assigned.Value != 0)
                continue;

            var rowTzId = reader.IsDBNull(9) ? "" : reader.GetString(9);
            var rowTz = TimeZoneResolver.Resolve(string.IsNullOrWhiteSpace(rowTzId) ? null : rowTzId, householdTz.Id);
            var startRaw = reader.IsDBNull(3) ? "" : reader.GetString(3);
            var dateText = "";
            var sortDate = DateTime.MaxValue;
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
            var recurrenceText = RecurrenceRule.Describe(recurrence);
            var reminderRaw = reader.IsDBNull(7) ? "" : reader.GetString(7);

            list.Add(new CalendarListItemModel
            {
                Id = reader.GetInt32(0),
                Title = reader.GetString(1),
                Type = reader.GetString(2),
                DateText = dateText,
                AllDay = reader.GetInt32(4) == 1,
                AssignedTo = assigned,
                AssignedToMemberLabel = HouseholdIdentity.MemberLabel(assigned),
                HasLink = !reader.IsDBNull(6) && !string.IsNullOrWhiteSpace(reader.GetString(6)),
                ReminderText = ReminderFormatter.Format(reminderRaw),
                RecurrenceText = recurrenceText,
                SortDate = sortDate,
                InstanceStartUtc = null,
            });
        }

        return list;
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
    /// <param name="includeCompleted">When true, completed items are included (greyed on clients). Completed series do not emit occurrences after today.</param>
    public List<CalendarRangeItemModel> GetRange(DateTime fromLocal, DateTime toLocal, ulong? userFilter = null, string? windowTimeZoneId = null, bool includeCompleted = false)
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

        var recurrenceExceptions = LoadRecurrenceExceptionMap(conn);

        var cmd = conn.CreateCommand();
        cmd.CommandText = $@"
            SELECT Id, Title, Type, StartDateTime, EndDateTime, AllDay, AssignedTo, Link, ReminderOffset, Recurrence,
                   COALESCE(Timezone, '') AS ItemTz, COALESCE(Description, '') AS DescCol, COALESCE(Notes, '') AS NotesCol,
                   COALESCE(Status, 'active') AS StatusCol
            FROM CalendarItems
            WHERE {(includeCompleted ? "Status IN ('active','completed')" : "Status = 'active'")} AND StartDateTime IS NOT NULL AND StartDateTime != ''";

        using var reader = cmd.ExecuteReader();

        while (reader.Read())
        {
            var rowTzId = reader.IsDBNull(10) ? "" : reader.GetString(10);
            var seriesDescription = reader.IsDBNull(11) ? "" : reader.GetString(11);
            var seriesNotes = reader.IsDBNull(12) ? "" : reader.GetString(12);
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
                Description = seriesDescription,
                Notes = seriesNotes,
                Status = reader.GetString(13),
            };

            var winStartDate = TimeZoneInfo.ConvertTimeFromUtc(fromUtc, rowTz).Date;
            var winEndDateInclusive = TimeZoneInfo.ConvertTimeFromUtc(toUtcExclusive.AddTicks(-1), rowTz).Date;

            if (string.Equals(meta.Status, "completed", StringComparison.OrdinalIgnoreCase))
            {
                var todayRow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, rowTz).Date;
                if (winStartDate > todayRow)
                    continue;
                if (winEndDateInclusive > todayRow)
                    winEndDateInclusive = todayRow;
            }

            switch (meta.Recurrence)
            {
                case var s when !string.IsNullOrWhiteSpace(s):
                    ExpandRecurrence(
                        output,
                        meta,
                        startLocalRow,
                        duration,
                        rowTz,
                        winStartDate,
                        winEndDateInclusive,
                        fromUtc,
                        toUtcExclusive,
                        recurrenceExceptions);
                    break;
                default:
                    EmitInstance(
                        output,
                        meta,
                        startLocalRow,
                        duration,
                        rowTz,
                        false,
                        fromUtc,
                        toUtcExclusive,
                        recurrenceExceptions);
                    break;
            }
        }

        output.Sort((a, b) =>
            string.CompareOrdinal(
                a.DisplayInstanceStartUtc ?? a.InstanceStartUtc,
                b.DisplayInstanceStartUtc ?? b.InstanceStartUtc));

        // Due-dated tasks (StartDateTime = due date at midnight in the item zone) render as all-day chips.
        AppendDueDatedTasks(output, conn, fromUtc, toUtcExclusive, householdTz, userFilter, recurrenceExceptions);
        return output;
    }

    private void AppendDueDatedTasks(
        List<CalendarRangeItemModel> output,
        Microsoft.Data.Sqlite.SqliteConnection conn,
        DateTime fromUtc,
        DateTime toUtcExclusive,
        TimeZoneInfo householdTz,
        ulong? userFilter,
        Dictionary<(int CalendarItemId, string InstanceStartUtc), RecurrenceExceptionRow> recurrenceExceptions)
    {
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Title, Type, StartDateTime, AllDay, AssignedTo, Link, ReminderOffset, Recurrence,
                   COALESCE(Timezone, '') AS ItemTz, COALESCE(Description, '') AS DescCol, COALESCE(Notes, '') AS NotesCol
            FROM CalendarItems
            WHERE Status = 'active' AND Type = 'task' AND StartDateTime IS NOT NULL AND StartDateTime != ''";
        using var reader = cmd.ExecuteReader();
        var due = new List<RangeRowMeta>();
        var starts = new List<DateTime>();
        while (reader.Read())
        {
            var assigned = reader.IsDBNull(5) ? null : (ulong?)reader.GetInt64(5);
            if (userFilter.HasValue && assigned.HasValue && assigned.Value != 0 && assigned.Value != userFilter.Value)
                continue;
            var startRaw = reader.GetString(3);
            if (!DateTime.TryParse(startRaw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var startUtc))
                continue;
            startUtc = DateTime.SpecifyKind(startUtc, DateTimeKind.Utc);
            var rowTzId = reader.IsDBNull(9) ? "" : reader.GetString(9);
            var rowTz = TimeZoneResolver.Resolve(string.IsNullOrWhiteSpace(rowTzId) ? null : rowTzId, householdTz.Id);
            due.Add(new RangeRowMeta
            {
                Id = reader.GetInt32(0),
                Title = reader.GetString(1),
                Type = reader.GetString(2),
                AllDay = true,
                Assigned = assigned,
                Link = reader.IsDBNull(6) ? "" : reader.GetString(6),
                ReminderRaw = reader.IsDBNull(7) ? "" : reader.GetString(7),
                Recurrence = reader.IsDBNull(8) ? "" : reader.GetString(8),
                TimezoneId = rowTz.Id,
                Description = reader.IsDBNull(10) ? "" : reader.GetString(10),
                Notes = reader.IsDBNull(11) ? "" : reader.GetString(11),
                Status = "active",
                IsDueTask = true,
            });
            starts.Add(startUtc);
        }

        for (var i = 0; i < due.Count; i++)
        {
            var meta = due[i];
            var rowTz = TimeZoneResolver.Resolve(meta.TimezoneId, householdTz.Id);
            DateTime startLocalRow;
            try { startLocalRow = TimeZoneInfo.ConvertTimeFromUtc(starts[i], rowTz); }
            catch { continue; }

            // Non-recurring: single all-day occurrence on the due date.
            if (string.IsNullOrWhiteSpace(meta.Recurrence))
            {
                EmitInstance(output, meta, startLocalRow.Date, null, rowTz, false, fromUtc, toUtcExclusive, recurrenceExceptions);
            }
            else
            {
                var winStartDate = TimeZoneInfo.ConvertTimeFromUtc(fromUtc, rowTz).Date;
                var winEndDateInclusive = TimeZoneInfo.ConvertTimeFromUtc(toUtcExclusive.AddTicks(-1), rowTz).Date;
                ExpandRecurrence(output, meta, startLocalRow, null, rowTz, winStartDate, winEndDateInclusive, fromUtc, toUtcExclusive, recurrenceExceptions);
            }
        }
    }

    private static DateTime NextMonthlyOccurrenceDate(DateTime fromDate, int anchorDay)
    {
        var next = fromDate.AddMonths(1);
        var day = Math.Min(anchorDay, DateTime.DaysInMonth(next.Year, next.Month));
        return new DateTime(next.Year, next.Month, day);
    }

    private static DateTime NextYearlyOccurrenceDate(DateTime fromDate, int anchorMonth, int anchorDay)
    {
        var nextYear = fromDate.Year + 1;
        var day = Math.Min(anchorDay, DateTime.DaysInMonth(nextYear, anchorMonth));
        return new DateTime(nextYear, anchorMonth, day);
    }

    /// <summary>
    /// Expands one recurring row into occurrences within the window. Handles daily/weekly/biweekly/
    /// monthly/yearly, optional weekday lists (weekly:MO,WE,…), and optional ;UNTIL=YYYYMMDD / ;COUNT=N bounds.
    /// </summary>
    private static void ExpandRecurrence(
        List<CalendarRangeItemModel> output,
        RangeRowMeta meta,
        DateTime startLocalRow,
        TimeSpan? duration,
        TimeZoneInfo rowTz,
        DateTime winStartDate,
        DateTime winEndDateInclusive,
        DateTime fromUtc,
        DateTime toUtcExclusive,
        Dictionary<(int CalendarItemId, string InstanceStartUtc), RecurrenceExceptionRow> recurrenceExceptions)
    {
        if (!RecurrenceRule.TryParse(meta.Recurrence, out var rule))
        {
            // Unparseable — fall back to a single emission so the item still shows.
            EmitInstance(output, meta, startLocalRow, duration, rowTz, false, fromUtc, toUtcExclusive, recurrenceExceptions);
            return;
        }

        var occurrenceIndex = 0;
        void Emit(DateTime day)
        {
            if (rule.Until.HasValue && day > rule.Until.Value)
                return;
            if (rule.Count.HasValue && occurrenceIndex >= rule.Count.Value)
                return;
            occurrenceIndex++;
            EmitInstance(
                output,
                meta,
                day.Add(startLocalRow.TimeOfDay),
                duration,
                rowTz,
                true,
                fromUtc,
                toUtcExclusive,
                recurrenceExceptions);
        }

        switch (rule.Frequency)
        {
            case "daily":
            {
                var first = startLocalRow.Date > winStartDate ? startLocalRow.Date : winStartDate;
                for (var d = first; d <= winEndDateInclusive; d = d.AddDays(1))
                    Emit(d);
                break;
            }
            case "weekly" when rule.Weekdays.Length == 0:
            {
                var step = 7 * Math.Max(1, rule.Interval);
                for (var d = winStartDate; d <= winEndDateInclusive; d = d.AddDays(1))
                {
                    if (d < startLocalRow.Date) continue;
                    if ((d - startLocalRow.Date).Days % step != 0) continue;
                    Emit(d);
                }
                break;
            }
            case "weekly":
            {
                // Multi-day weekly (and biweekly multi-day): emit on matching weekdays,
                // stepping by the interval from the series start week.
                var step = 7 * Math.Max(1, rule.Interval);
                var anchorWeekStart = StartOfWeek(startLocalRow.Date);
                for (var d = winStartDate; d <= winEndDateInclusive; d = d.AddDays(1))
                {
                    if (d < startLocalRow.Date) continue;
                    var weeksSinceAnchor = (StartOfWeek(d) - anchorWeekStart).Days / 7;
                    if (weeksSinceAnchor < 0 || (weeksSinceAnchor % rule.Interval) != 0) continue;
                    if (!rule.Weekdays.Contains(d.DayOfWeek)) continue;
                    Emit(d);
                }
                break;
            }
            case "monthly":
            {
                var anchorDay = startLocalRow.Day;
                var cursor = startLocalRow.Date;
                while (cursor < winStartDate)
                    cursor = NextMonthlyOccurrenceDate(cursor, anchorDay);
                while (cursor <= winEndDateInclusive)
                {
                    Emit(cursor);
                    cursor = NextMonthlyOccurrenceDate(cursor, anchorDay);
                }
                break;
            }
            case "yearly":
            {
                var anchorMonth = startLocalRow.Month;
                var anchorDay = startLocalRow.Day;
                var cursor = startLocalRow.Date;
                while (cursor < winStartDate)
                    cursor = NextYearlyOccurrenceDate(cursor, anchorMonth, anchorDay);
                while (cursor <= winEndDateInclusive)
                {
                    Emit(cursor);
                    cursor = NextYearlyOccurrenceDate(cursor, anchorMonth, anchorDay);
                }
                break;
            }
        }
    }

    private static DateTime StartOfWeek(DateTime d)
    {
        var diff = ((int)d.DayOfWeek + 6) % 7; // Monday-first
        return d.Date.AddDays(-diff);
    }

    /// <summary>
    /// Normalizes a client-provided occurrence start to the same UTC ISO string used in range expansion.
    /// </summary>
    public static string NormalizeCalendarInstanceStartUtc(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            throw new ArgumentException("instanceStartUtc is required.", nameof(raw));
        if (!DateTimeOffset.TryParse(
                raw.Trim(),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var dto))
            throw new ArgumentException("instanceStartUtc must be a valid UTC or offset datetime.", nameof(raw));
        return dto.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Converts a stored calendar start (UTC storage or ISO) to the canonical recurrence key used in range and exceptions.
    /// </summary>
    public static string NormalizeDbStartToInstanceKeyUtc(string startRaw)
    {
        if (string.IsNullOrWhiteSpace(startRaw))
            throw new ArgumentException("Start is required.", nameof(startRaw));
        if (!DateTime.TryParse(
                startRaw.Trim(),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var utc))
            throw new ArgumentException("Invalid datetime.", nameof(startRaw));
        utc = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
        return utc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Hides a single occurrence of a recurring calendar item from range expansion (Web UI / API).
    /// Does not delete the series. Undo removes or restores the exception row.
    /// </summary>
    public int OmitRecurrenceInstance(int calendarItemId, string instanceStartUtcRaw, ulong actorUserId)
    {
        EnsureRecurringParent(calendarItemId);
        var iso = NormalizeCalendarInstanceStartUtc(instanceStartUtcRaw);

        using var conn = _db.GetConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        var before = ReadRecurrenceExceptionUndo(conn, tx, calendarItemId, iso);
        if (before != null && string.Equals(before.ExceptionKind, "omit", StringComparison.OrdinalIgnoreCase))
        {
            tx.Commit();
            return before.Id;
        }

        var upsert = conn.CreateCommand();
        upsert.Transaction = tx;
        upsert.CommandText = @"
            INSERT INTO CalendarRecurrenceExceptions
            (CalendarItemId, InstanceStartUtc, ExceptionKind, OverrideTitle, OverrideDescription, OverrideNotes, OverrideLink,
             OverrideInstanceStartUtc, OverrideInstanceEndUtc, InstanceCompleted)
            VALUES ($cid, $iso, 'omit', NULL, NULL, NULL, NULL, NULL, NULL, 0)
            ON CONFLICT(CalendarItemId, InstanceStartUtc) DO UPDATE SET
                ExceptionKind = 'omit',
                OverrideTitle = NULL,
                OverrideDescription = NULL,
                OverrideNotes = NULL,
                OverrideLink = NULL,
                OverrideInstanceStartUtc = NULL,
                OverrideInstanceEndUtc = NULL,
                InstanceCompleted = 0";
        upsert.Parameters.AddWithValue("$cid", calendarItemId);
        upsert.Parameters.AddWithValue("$iso", iso);
        upsert.ExecuteNonQuery();

        var idCmd = conn.CreateCommand();
        idCmd.Transaction = tx;
        idCmd.CommandText = "SELECT Id FROM CalendarRecurrenceExceptions WHERE CalendarItemId = $cid AND InstanceStartUtc = $iso";
        idCmd.Parameters.AddWithValue("$cid", calendarItemId);
        idCmd.Parameters.AddWithValue("$iso", iso);
        var exIdObj = idCmd.ExecuteScalar();
        if (exIdObj is null || exIdObj is DBNull)
        {
            tx.Rollback();
            throw new InvalidOperationException("Could not resolve recurrence exception row.");
        }

        var exceptionId = Convert.ToInt32(exIdObj);
        tx.Commit();
        LogRecurrenceExceptionMutation(actorUserId, before, exceptionId);
        MarkGooglePendingPush(calendarItemId);
        return exceptionId;
    }

    /// <summary>
    /// Marks one occurrence of a recurring item complete (still visible on the calendar with completed styling).
    /// </summary>
    public int CompleteRecurrenceInstance(int calendarItemId, string instanceStartUtcRaw, ulong actorUserId)
    {
        EnsureRecurringParent(calendarItemId);
        var iso = NormalizeCalendarInstanceStartUtc(instanceStartUtcRaw);

        using var conn = _db.GetConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        var before = ReadRecurrenceExceptionUndo(conn, tx, calendarItemId, iso);

        if (before != null && string.Equals(before.ExceptionKind, "omit", StringComparison.OrdinalIgnoreCase))
        {
            tx.Rollback();
            throw new InvalidOperationException("That occurrence is hidden. Undo hide or pick a different day.");
        }

        if (before != null &&
            string.Equals(before.ExceptionKind, "complete", StringComparison.OrdinalIgnoreCase))
        {
            tx.Commit();
            return before.Id;
        }

        if (before != null && string.Equals(before.ExceptionKind, "modify", StringComparison.OrdinalIgnoreCase))
        {
            var upd = conn.CreateCommand();
            upd.Transaction = tx;
            upd.CommandText = @"
                UPDATE CalendarRecurrenceExceptions
                SET InstanceCompleted = 1
                WHERE Id = $id";
            upd.Parameters.AddWithValue("$id", before.Id);
            upd.ExecuteNonQuery();
            tx.Commit();
            _undo.LogAction(actorUserId, "update", "calendar_rec_ex", before.Id, JsonSerializer.Serialize(before));
            MarkGooglePendingPush(calendarItemId);
            return before.Id;
        }

        var ins = conn.CreateCommand();
        ins.Transaction = tx;
        ins.CommandText = @"
            INSERT INTO CalendarRecurrenceExceptions
            (CalendarItemId, InstanceStartUtc, ExceptionKind, OverrideTitle, OverrideDescription, OverrideNotes, OverrideLink,
             OverrideInstanceStartUtc, OverrideInstanceEndUtc, InstanceCompleted)
            VALUES ($cid, $iso, 'complete', NULL, NULL, NULL, NULL, NULL, NULL, 0)";
        ins.Parameters.AddWithValue("$cid", calendarItemId);
        ins.Parameters.AddWithValue("$iso", iso);
        ins.ExecuteNonQuery();

        var newId = ReadLastInsertRowId(conn, tx);
        tx.Commit();
        _undo.LogAction(actorUserId, "create", "calendar_rec_ex", newId, "{}");
        MarkGooglePendingPush(calendarItemId);
        return newId;
    }

    /// <summary>
    /// Applies per-instance field overrides for one recurrence occurrence.
    /// </summary>
    public int PatchRecurrenceInstance(int calendarItemId, CalendarInstancePatchRequest patch, ulong actorUserId)
    {
        EnsureRecurringParent(calendarItemId);
        var iso = NormalizeCalendarInstanceStartUtc(patch.InstanceStartUtc);

        using var conn = _db.GetConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        var before = ReadRecurrenceExceptionUndo(conn, tx, calendarItemId, iso);

        if (before != null && string.Equals(before.ExceptionKind, "omit", StringComparison.OrdinalIgnoreCase))
        {
            tx.Rollback();
            throw new InvalidOperationException("That occurrence is hidden. Undo hide before editing.");
        }

        string? title = before?.OverrideTitle;
        string? desc = before?.OverrideDescription;
        string? notes = before?.OverrideNotes;
        string? link = before?.OverrideLink;
        string? oStart = before?.OverrideInstanceStartUtc;
        string? oEnd = before?.OverrideInstanceEndUtc;
        var instCompleted = before?.InstanceCompleted ?? 0;
        var kind = "modify";

        if (before != null && string.Equals(before.ExceptionKind, "complete", StringComparison.OrdinalIgnoreCase))
        {
            title = null;
            desc = null;
            notes = null;
            link = null;
            oStart = null;
            oEnd = null;
            instCompleted = 1;
        }
        else if (before != null && string.Equals(before.ExceptionKind, "modify", StringComparison.OrdinalIgnoreCase))
        {
            instCompleted = before.InstanceCompleted;
        }

        if (patch.Title != null)
            title = patch.Title;
        if (patch.Description != null)
            desc = patch.Description;
        if (patch.Notes != null)
            notes = patch.Notes;
        if (patch.Link != null)
            link = patch.Link;
        if (patch.OverrideInstanceStartUtc != null)
            oStart = string.IsNullOrWhiteSpace(patch.OverrideInstanceStartUtc)
                ? null
                : NormalizeCalendarInstanceStartUtc(patch.OverrideInstanceStartUtc);
        if (patch.OverrideInstanceEndUtc != null)
            oEnd = string.IsNullOrWhiteSpace(patch.OverrideInstanceEndUtc)
                ? null
                : NormalizeCalendarInstanceStartUtc(patch.OverrideInstanceEndUtc);

        if (before == null)
        {
            var hasAny =
                !string.IsNullOrEmpty(title) ||
                !string.IsNullOrEmpty(desc) ||
                !string.IsNullOrEmpty(notes) ||
                !string.IsNullOrEmpty(link) ||
                !string.IsNullOrEmpty(oStart) ||
                !string.IsNullOrEmpty(oEnd) ||
                instCompleted != 0;
            if (!hasAny)
            {
                tx.Rollback();
                throw new ArgumentException("Provide at least one field to override for this occurrence.");
            }

            var ins = conn.CreateCommand();
            ins.Transaction = tx;
            ins.CommandText = @"
                INSERT INTO CalendarRecurrenceExceptions
                (CalendarItemId, InstanceStartUtc, ExceptionKind, OverrideTitle, OverrideDescription, OverrideNotes, OverrideLink,
                 OverrideInstanceStartUtc, OverrideInstanceEndUtc, InstanceCompleted)
                VALUES ($cid, $iso, 'modify', $title, $desc, $notes, $link, $os, $oe, $ic)";
            ins.Parameters.AddWithValue("$cid", calendarItemId);
            ins.Parameters.AddWithValue("$iso", iso);
            ins.Parameters.AddWithValue("$title", string.IsNullOrEmpty(title) ? DBNull.Value : title);
            ins.Parameters.AddWithValue("$desc", string.IsNullOrEmpty(desc) ? DBNull.Value : desc);
            ins.Parameters.AddWithValue("$notes", string.IsNullOrEmpty(notes) ? DBNull.Value : notes);
            ins.Parameters.AddWithValue("$link", string.IsNullOrEmpty(link) ? DBNull.Value : link);
            ins.Parameters.AddWithValue("$os", string.IsNullOrEmpty(oStart) ? DBNull.Value : oStart);
            ins.Parameters.AddWithValue("$oe", string.IsNullOrEmpty(oEnd) ? DBNull.Value : oEnd);
            ins.Parameters.AddWithValue("$ic", instCompleted);
            ins.ExecuteNonQuery();
            var newId = ReadLastInsertRowId(conn, tx);
            tx.Commit();
            _undo.LogAction(actorUserId, "create", "calendar_rec_ex", newId, "{}");
            MarkGooglePendingPush(calendarItemId);
            return newId;
        }

        var updRow = conn.CreateCommand();
        updRow.Transaction = tx;
        updRow.CommandText = @"
            UPDATE CalendarRecurrenceExceptions
            SET ExceptionKind = $kind,
                OverrideTitle = $title,
                OverrideDescription = $desc,
                OverrideNotes = $notes,
                OverrideLink = $link,
                OverrideInstanceStartUtc = $os,
                OverrideInstanceEndUtc = $oe,
                InstanceCompleted = $ic
            WHERE Id = $id";
        updRow.Parameters.AddWithValue("$id", before.Id);
        updRow.Parameters.AddWithValue("$kind", kind);
        updRow.Parameters.AddWithValue("$title", string.IsNullOrEmpty(title) ? DBNull.Value : title);
        updRow.Parameters.AddWithValue("$desc", string.IsNullOrEmpty(desc) ? DBNull.Value : desc);
        updRow.Parameters.AddWithValue("$notes", string.IsNullOrEmpty(notes) ? DBNull.Value : notes);
        updRow.Parameters.AddWithValue("$link", string.IsNullOrEmpty(link) ? DBNull.Value : link);
        updRow.Parameters.AddWithValue("$os", string.IsNullOrEmpty(oStart) ? DBNull.Value : oStart);
        updRow.Parameters.AddWithValue("$oe", string.IsNullOrEmpty(oEnd) ? DBNull.Value : oEnd);
        updRow.Parameters.AddWithValue("$ic", instCompleted);
        updRow.ExecuteNonQuery();

        tx.Commit();
        _undo.LogAction(actorUserId, "update", "calendar_rec_ex", before.Id, JsonSerializer.Serialize(before));
        MarkGooglePendingPush(calendarItemId);
        return before.Id;
    }

    /// <summary>
    /// Removes the recurrence exception row for one canonical instance (clears omit, complete-this-day, or modify overrides).
    /// </summary>
    /// <returns><c>false</c> when no exception row exists for that slot.</returns>
    public bool ClearRecurrenceInstance(int calendarItemId, string instanceStartUtcRaw, ulong actorUserId)
    {
        EnsureRecurringParent(calendarItemId);
        var iso = NormalizeCalendarInstanceStartUtc(instanceStartUtcRaw);

        using var conn = _db.GetConnection();
        conn.Open();

        var before = ReadRecurrenceExceptionUndo(conn, null, calendarItemId, iso);
        if (before == null)
            return false;

        var del = conn.CreateCommand();
        del.CommandText = "DELETE FROM CalendarRecurrenceExceptions WHERE Id = $id";
        del.Parameters.AddWithValue("$id", before.Id);
        del.ExecuteNonQuery();

        _undo.LogAction(actorUserId, "delete", "calendar_rec_ex", before.Id, JsonSerializer.Serialize(before));
        return true;
    }

    /// <summary>
    /// Reads recurrence exception state for reminder handling (omit / complete / modified time).
    /// </summary>
    public static bool TryLoadRecurrenceExceptionForReminder(
        SqliteConnection conn,
        int calendarItemId,
        string instanceKeyUtcZ,
        out string? overrideTitle,
        out string? overrideStartUtcZ,
        out bool suppressReminder)
    {
        overrideTitle = null;
        overrideStartUtcZ = null;
        suppressReminder = false;

        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT ExceptionKind, InstanceCompleted, OverrideTitle, OverrideInstanceStartUtc
            FROM CalendarRecurrenceExceptions
            WHERE CalendarItemId = $cid AND InstanceStartUtc = $iso";
        cmd.Parameters.AddWithValue("$cid", calendarItemId);
        cmd.Parameters.AddWithValue("$iso", instanceKeyUtcZ);
        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
            return false;

        var kind = reader.GetString(0);
        var instDone = reader.GetInt32(1);
        if (!reader.IsDBNull(2))
            overrideTitle = reader.GetString(2);
        if (!reader.IsDBNull(3))
            overrideStartUtcZ = reader.GetString(3);

        if (string.Equals(kind, "omit", StringComparison.OrdinalIgnoreCase))
        {
            suppressReminder = true;
            return true;
        }

        if (string.Equals(kind, "complete", StringComparison.OrdinalIgnoreCase))
        {
            suppressReminder = true;
            return true;
        }

        if (string.Equals(kind, "modify", StringComparison.OrdinalIgnoreCase) && instDone != 0)
        {
            suppressReminder = true;
            return true;
        }

        return true;
    }

    private static int ReadLastInsertRowId(SqliteConnection conn, SqliteTransaction? tx)
    {
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "SELECT last_insert_rowid()";
        return Convert.ToInt32(cmd.ExecuteScalar() ?? 0);
    }

    private void EnsureRecurringParent(int calendarItemId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var get = conn.CreateCommand();
        get.CommandText = "SELECT Recurrence FROM CalendarItems WHERE Id = $id AND Status = 'active'";
        get.Parameters.AddWithValue("$id", calendarItemId);
        var recurrence = get.ExecuteScalar()?.ToString() ?? "";
        if (string.IsNullOrWhiteSpace(recurrence))
            throw new InvalidOperationException("Only recurring calendar items support per-instance actions.");
    }

    private void LogRecurrenceExceptionMutation(ulong actorUserId, RecurrenceExceptionUndoModel? before, int exceptionId)
    {
        if (before == null)
            _undo.LogAction(actorUserId, "create", "calendar_rec_ex", exceptionId, "{}");
        else
            _undo.LogAction(actorUserId, "update", "calendar_rec_ex", exceptionId, JsonSerializer.Serialize(before));
    }

    private static RecurrenceExceptionUndoModel? ReadRecurrenceExceptionUndo(
        SqliteConnection conn,
        SqliteTransaction? tx,
        int calendarItemId,
        string instanceStartUtc)
    {
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            SELECT Id, CalendarItemId, InstanceStartUtc, ExceptionKind,
                   OverrideTitle, OverrideDescription, OverrideNotes, OverrideLink,
                   OverrideInstanceStartUtc, OverrideInstanceEndUtc, InstanceCompleted
            FROM CalendarRecurrenceExceptions
            WHERE CalendarItemId = $cid AND InstanceStartUtc = $iso";
        cmd.Parameters.AddWithValue("$cid", calendarItemId);
        cmd.Parameters.AddWithValue("$iso", instanceStartUtc);
        using var reader = cmd.ExecuteReader();
        return reader.Read() ? ReadRecurrenceExceptionUndoFromReader(reader) : null;
    }

    private static RecurrenceExceptionUndoModel? ReadRecurrenceExceptionUndoById(
        SqliteConnection conn,
        SqliteTransaction? tx,
        int id)
    {
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            SELECT Id, CalendarItemId, InstanceStartUtc, ExceptionKind,
                   OverrideTitle, OverrideDescription, OverrideNotes, OverrideLink,
                   OverrideInstanceStartUtc, OverrideInstanceEndUtc, InstanceCompleted
            FROM CalendarRecurrenceExceptions
            WHERE Id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        using var reader = cmd.ExecuteReader();
        return reader.Read() ? ReadRecurrenceExceptionUndoFromReader(reader) : null;
    }

    private static RecurrenceExceptionUndoModel ReadRecurrenceExceptionUndoFromReader(SqliteDataReader reader)
    {
        return new RecurrenceExceptionUndoModel
        {
            Id = reader.GetInt32(0),
            CalendarItemId = reader.GetInt32(1),
            InstanceStartUtc = reader.GetString(2),
            ExceptionKind = reader.GetString(3),
            OverrideTitle = reader.IsDBNull(4) ? null : reader.GetString(4),
            OverrideDescription = reader.IsDBNull(5) ? null : reader.GetString(5),
            OverrideNotes = reader.IsDBNull(6) ? null : reader.GetString(6),
            OverrideLink = reader.IsDBNull(7) ? null : reader.GetString(7),
            OverrideInstanceStartUtc = reader.IsDBNull(8) ? null : reader.GetString(8),
            OverrideInstanceEndUtc = reader.IsDBNull(9) ? null : reader.GetString(9),
            InstanceCompleted = reader.GetInt32(10),
        };
    }

    private static Dictionary<(int CalendarItemId, string InstanceStartUtc), RecurrenceExceptionRow> LoadRecurrenceExceptionMap(
        SqliteConnection conn)
    {
        var map = new Dictionary<(int, string), RecurrenceExceptionRow>();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT CalendarItemId, InstanceStartUtc, ExceptionKind,
                   OverrideTitle, OverrideDescription, OverrideNotes, OverrideLink,
                   OverrideInstanceStartUtc, OverrideInstanceEndUtc, InstanceCompleted
            FROM CalendarRecurrenceExceptions";
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var row = new RecurrenceExceptionRow
            {
                Kind = reader.GetString(2),
                OverrideTitle = reader.IsDBNull(3) ? null : reader.GetString(3),
                OverrideDescription = reader.IsDBNull(4) ? null : reader.GetString(4),
                OverrideNotes = reader.IsDBNull(5) ? null : reader.GetString(5),
                OverrideLink = reader.IsDBNull(6) ? null : reader.GetString(6),
                OverrideInstanceStartUtc = reader.IsDBNull(7) ? null : reader.GetString(7),
                OverrideInstanceEndUtc = reader.IsDBNull(8) ? null : reader.GetString(8),
                InstanceCompleted = reader.GetInt32(9),
            };
            map[(reader.GetInt32(0), reader.GetString(1))] = row;
        }

        return map;
    }

    private sealed class RecurrenceExceptionRow
    {
        public string Kind = "";
        public string? OverrideTitle;
        public string? OverrideDescription;
        public string? OverrideNotes;
        public string? OverrideLink;
        public string? OverrideInstanceStartUtc;
        public string? OverrideInstanceEndUtc;
        public int InstanceCompleted;
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
        public string Description;
        public string Notes;
        public string Status;
        public bool IsDueTask;
    }

    private static void EmitInstance(
        List<CalendarRangeItemModel> output,
        RangeRowMeta meta,
        DateTime instanceLocal,
        TimeSpan? duration,
        TimeZoneInfo tz,
        bool isRecurring,
        DateTime fromUtc,
        DateTime toUtcExclusive,
        Dictionary<(int CalendarItemId, string InstanceStartUtc), RecurrenceExceptionRow> recurrenceExceptions)
    {
        DateTime instanceUtc;
        try
        {
            instanceUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(instanceLocal, DateTimeKind.Unspecified), tz);
        }
        catch
        {
            return;
        }

        DateTime instanceEndUtc = instanceUtc;
        if (duration.HasValue)
        {
            try
            {
                var endLocal = instanceLocal + duration.Value;
                instanceEndUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(endLocal, DateTimeKind.Unspecified), tz);
            }
            catch
            {
                instanceEndUtc = instanceUtc;
            }
        }
        else if (meta.AllDay)
        {
            try
            {
                instanceEndUtc = TimeZoneInfo.ConvertTimeToUtc(
                    DateTime.SpecifyKind(instanceLocal.Date.AddDays(1), DateTimeKind.Unspecified),
                    tz);
            }
            catch
            {
                instanceEndUtc = instanceUtc.AddDays(1);
            }
        }

        var startIso = instanceUtc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
        recurrenceExceptions.TryGetValue((meta.Id, startIso), out var ex);
        if (ex != null && string.Equals(ex.Kind, "omit", StringComparison.OrdinalIgnoreCase))
            return;

        var effectiveStartUtc = instanceUtc;
        var effectiveEndUtc = instanceEndUtc;
        if (ex != null && !string.IsNullOrWhiteSpace(ex.OverrideInstanceStartUtc) &&
            DateTimeOffset.TryParse(
                ex.OverrideInstanceStartUtc,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var dtoS))
        {
            effectiveStartUtc = DateTime.SpecifyKind(dtoS.UtcDateTime, DateTimeKind.Utc);
        }

        if (ex != null && !string.IsNullOrWhiteSpace(ex.OverrideInstanceEndUtc) &&
            DateTimeOffset.TryParse(
                ex.OverrideInstanceEndUtc,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var dtoE))
        {
            effectiveEndUtc = DateTime.SpecifyKind(dtoE.UtcDateTime, DateTimeKind.Utc);
        }
        else if (ex != null && !string.IsNullOrWhiteSpace(ex.OverrideInstanceStartUtc))
        {
            var span = instanceEndUtc - instanceUtc;
            if (span > TimeSpan.Zero)
                effectiveEndUtc = effectiveStartUtc + span;
        }

        if (effectiveStartUtc >= toUtcExclusive || effectiveEndUtc <= fromUtc)
            return;

        var title = meta.Title;
        if (ex != null && !string.IsNullOrWhiteSpace(ex.OverrideTitle))
            title = ex.OverrideTitle!;

        var desc = ex != null && ex.OverrideDescription != null ? ex.OverrideDescription : meta.Description;
        var notesEff = ex != null && ex.OverrideNotes != null ? ex.OverrideNotes : meta.Notes;

        var linkEff = meta.Link;
        if (ex != null && !string.IsNullOrWhiteSpace(ex.OverrideLink))
            linkEff = ex.OverrideLink!;

        var isCompleted = ex != null && (
            string.Equals(ex.Kind, "complete", StringComparison.OrdinalIgnoreCase) ||
            (string.Equals(ex.Kind, "modify", StringComparison.OrdinalIgnoreCase) && ex.InstanceCompleted != 0));

        var hasOverride = ex != null && string.Equals(ex.Kind, "modify", StringComparison.OrdinalIgnoreCase);
        string? displayStart = null;
        string? displayEnd = null;
        if (effectiveStartUtc != instanceUtc)
            displayStart = effectiveStartUtc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
        if (effectiveEndUtc != instanceEndUtc)
            displayEnd = effectiveEndUtc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);

        string? endIso = null;
        if (duration.HasValue || meta.AllDay)
            endIso = effectiveEndUtc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);

        var recurrenceText = RecurrenceRule.Describe(meta.Recurrence);

            output.Add(new CalendarRangeItemModel
            {
                Id = meta.Id,
                Title = title,
                Description = desc,
                Notes = notesEff,
                Type = meta.Type,
                AllDay = meta.AllDay,
                AssignedTo = meta.Assigned,
                AssignedToMemberLabel = HouseholdIdentity.MemberLabel(meta.Assigned),
                HasLink = !string.IsNullOrWhiteSpace(linkEff),
                ReminderText = ReminderFormatter.Format(meta.ReminderRaw),
                RecurrenceText = recurrenceText,
                Recurrence = meta.Recurrence,
                InstanceStartUtc = startIso,
                DisplayInstanceStartUtc = displayStart,
                InstanceEndUtc = endIso,
                DisplayInstanceEndUtc = displayEnd,
                IsRecurringInstance = isRecurring,
                IsInstanceCompleted = isCompleted,
                IsCompleted = string.Equals(meta.Status, "completed", StringComparison.OrdinalIgnoreCase),
                HasInstanceOverride = hasOverride,
                TimeZoneId = meta.TimezoneId,
                IsDueTask = meta.IsDueTask,
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

}