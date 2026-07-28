using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;

/// <summary>Two-way Google Calendar sync (events only).</summary>
public sealed class GoogleCalendarSyncService
{
    private const string Provider = "google";
    private readonly DatabaseService _db;
    private readonly CalendarService _calendar;
    private readonly GoogleCalendarOAuthService _oauth;
    private readonly ConfigService _config;

    public GoogleCalendarSyncService(
        DatabaseService db,
        CalendarService calendar,
        GoogleCalendarOAuthService oauth,
        ConfigService config)
    {
        _db = db;
        _calendar = calendar;
        _oauth = oauth;
        _config = config;
    }

    public object GetStatus()
    {
        var conns = _oauth.ListActiveConnections();
        return new
        {
            configured = _oauth.IsConfigured(),
            connections = conns.Select(c => new
            {
                c.DiscordUserId,
                c.CalendarId,
                c.LastSyncAt,
                c.LastSyncError,
                hasSyncToken = !string.IsNullOrEmpty(c.SyncToken),
            }),
        };
    }

    public async Task StartWorkerAsync(CancellationToken ct = default)
    {
        if (!_oauth.IsConfigured())
        {
            Console.WriteLine("ℹ️ Google Calendar sync disabled (Google OAuth env not set).");
            return;
        }

        var minutes = ReadPollMinutes();
        while (!ct.IsCancellationRequested)
        {
            try
            {
                foreach (var conn in _oauth.ListActiveConnections())
                    await SyncConnectionAsync(conn);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠️ Google Calendar sync worker error: {ex.Message}");
            }

            try
            {
                await Task.Delay(TimeSpan.FromMinutes(minutes), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    public async Task SyncConnectionAsync(GoogleCalendarConnectionModel conn)
    {
        var refresh = _oauth.GetRefreshToken(conn.Id);
        if (string.IsNullOrEmpty(refresh))
            return;

        try
        {
            var access = await ExchangeRefreshTokenAsync(refresh);
            await PullFromGoogleAsync(conn, access);
            await PushToGoogleAsync(conn, access);
            _oauth.UpdateSyncState(conn.Id, conn.SyncToken, null);
        }
        catch (Exception ex)
        {
            _oauth.UpdateSyncState(conn.Id, conn.SyncToken, ex.Message);
        }
    }

    public void MarkPendingPush(int calendarItemId)
    {
        if (!_oauth.IsConfigured())
            return;

        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE CalendarExternalLinks SET PendingPush = 1
            WHERE CalendarItemId = $id AND Provider = $p";
        cmd.Parameters.AddWithValue("$id", calendarItemId);
        cmd.Parameters.AddWithValue("$p", Provider);
        if (cmd.ExecuteNonQuery() > 0) return;

        cmd.CommandText = @"
            INSERT INTO CalendarExternalLinks (CalendarItemId, Provider, ExternalId, PendingPush)
            VALUES ($id, $p, '', 1)
            ON CONFLICT(CalendarItemId, Provider) DO UPDATE SET PendingPush = 1";
        cmd.ExecuteNonQuery();
    }

    /// <summary>Drop external links before local delete so FK constraints stay valid; queue Google deletes.</summary>
    public void OnLocalItemDeleted(int calendarItemId)
    {
        if (!_oauth.IsConfigured())
            return;

        using var conn = _db.GetConnection();
        conn.Open();
        using var read = conn.CreateCommand();
        read.CommandText = @"
            SELECT ExternalId FROM CalendarExternalLinks
            WHERE CalendarItemId = $id AND Provider = $p AND ExternalId != ''";
        read.Parameters.AddWithValue("$id", calendarItemId);
        read.Parameters.AddWithValue("$p", Provider);
        var externalId = read.ExecuteScalar() as string;

        if (!string.IsNullOrEmpty(externalId))
        {
            foreach (var connection in _oauth.ListActiveConnections())
                QueuePendingDelete(connection.Id, connection.CalendarId, externalId);
        }

        using var del = conn.CreateCommand();
        del.CommandText = "DELETE FROM CalendarExternalLinks WHERE CalendarItemId = $id AND Provider = $p";
        del.Parameters.AddWithValue("$id", calendarItemId);
        del.Parameters.AddWithValue("$p", Provider);
        del.ExecuteNonQuery();
    }

    private void QueuePendingDelete(int connectionId, string calendarId, string externalId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO GoogleCalendarPendingDeletes (ConnectionId, CalendarId, ExternalId)
            VALUES ($c, $cal, $e)";
        cmd.Parameters.AddWithValue("$c", connectionId);
        cmd.Parameters.AddWithValue("$cal", calendarId);
        cmd.Parameters.AddWithValue("$e", externalId);
        cmd.ExecuteNonQuery();
    }

    private async Task PullFromGoogleAsync(GoogleCalendarConnectionModel conn, string accessToken)
    {
        using var http = CreateClient(accessToken);
        var url = $"https://www.googleapis.com/calendar/v3/calendars/{Uri.EscapeDataString(conn.CalendarId)}/events";
        var q = new List<string> { "singleEvents=true", "maxResults=250" };
        if (!string.IsNullOrEmpty(conn.SyncToken))
            q.Add($"syncToken={Uri.EscapeDataString(conn.SyncToken)}");
        else
        {
            var min = DateTime.UtcNow.AddDays(-30).ToString("o", CultureInfo.InvariantCulture);
            q.Add($"timeMin={Uri.EscapeDataString(min)}");
        }

        url += "?" + string.Join("&", q);
        using var res = await http.GetAsync(url);
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException(body);

        using var doc = JsonDocument.Parse(body);
        if (doc.RootElement.TryGetProperty("nextSyncToken", out var nst))
            conn.SyncToken = nst.GetString();

        if (!doc.RootElement.TryGetProperty("items", out var items))
            return;

        foreach (var ev in items.EnumerateArray())
        {
            var id = ev.GetProperty("id").GetString() ?? "";
            if (string.IsNullOrEmpty(id)) continue;

            var status = ev.TryGetProperty("status", out var st) ? st.GetString() : "confirmed";
            if (status == "cancelled")
            {
                DeleteLocalByExternalId(id);
                continue;
            }

            var title = ev.TryGetProperty("summary", out var sum) ? sum.GetString() ?? "Event" : "Event";
            var desc = ev.TryGetProperty("description", out var des) ? des.GetString() ?? "" : "";
            var start = ParseGoogleDateTime(ev.GetProperty("start"));
            var end = ParseGoogleDateTime(ev.GetProperty("end"));
            var etag = ev.TryGetProperty("etag", out var et) ? et.GetString() : null;
            var googleUpdated = ev.TryGetProperty("updated", out var upd) ? upd.GetString() : null;

            UpsertLocalFromGoogle(id, title, desc, start, end, etag, googleUpdated);
        }
    }

    private async Task PushToGoogleAsync(GoogleCalendarConnectionModel conn, string accessToken)
    {
        using var http = CreateClient(accessToken);
        await ProcessPendingDeletesAsync(http, conn);

        foreach (var row in LoadPendingPushRows())
        {
            if (row.ExternalId.Length == 0)
            {
                var created = await CreateGoogleEventAsync(http, conn.CalendarId, row);
                LinkExternal(row.CalendarItemId, created.Id, created.Etag);
            }
            else
            {
                await UpdateGoogleEventAsync(http, conn.CalendarId, row);
            }
        }

        foreach (var row in LoadUnlinkedLocalEvents())
        {
            var created = await CreateGoogleEventAsync(http, conn.CalendarId, row);
            LinkExternal(row.CalendarItemId, created.Id, created.Etag);
        }
    }

    private async Task ProcessPendingDeletesAsync(HttpClient http, GoogleCalendarConnectionModel conn)
    {
        foreach (var pending in LoadPendingDeletes(conn.Id))
        {
            var calId = string.IsNullOrEmpty(pending.CalendarId) ? conn.CalendarId : pending.CalendarId;
            var url =
                $"https://www.googleapis.com/calendar/v3/calendars/{Uri.EscapeDataString(calId)}/events/{Uri.EscapeDataString(pending.ExternalId)}";
            using var res = await http.DeleteAsync(url);
            if (res.IsSuccessStatusCode || res.StatusCode == System.Net.HttpStatusCode.NotFound || res.StatusCode == System.Net.HttpStatusCode.Gone)
                RemovePendingDelete(pending.Id);
        }
    }

    private async Task<(string Id, string? Etag)> CreateGoogleEventAsync(HttpClient http, string calendarId, LocalEventRow row)
    {
        var payload = BuildGoogleEventJson(row);
        var url = $"https://www.googleapis.com/calendar/v3/calendars/{Uri.EscapeDataString(calendarId)}/events";
        using var res = await http.PostAsync(url, new StringContent(payload, Encoding.UTF8, "application/json"));
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException(body);
        using var doc = JsonDocument.Parse(body);
        return (doc.RootElement.GetProperty("id").GetString()!, doc.RootElement.TryGetProperty("etag", out var e) ? e.GetString() : null);
    }

    private async Task<string?> UpdateGoogleEventAsync(HttpClient http, string calendarId, LocalEventRow row)
    {
        var payload = BuildGoogleEventJson(row);
        var url = $"https://www.googleapis.com/calendar/v3/calendars/{Uri.EscapeDataString(calendarId)}/events/{Uri.EscapeDataString(row.ExternalId)}";
        using var req = new HttpRequestMessage(HttpMethod.Put, url)
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json"),
        };
        using var res = await http.SendAsync(req);
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException(body);
        using var doc = JsonDocument.Parse(body);
        ClearPending(row.CalendarItemId, doc.RootElement.TryGetProperty("etag", out var e) ? e.GetString() : null);
        return doc.RootElement.TryGetProperty("etag", out var et) ? et.GetString() : null;
    }

    private static string BuildGoogleEventJson(LocalEventRow row)
    {
        var summary = row.Type == "task" ? $"[Task] {row.Title}" : row.Title;
        var obj = new Dictionary<string, object>
        {
            ["summary"] = summary,
            ["description"] = row.Description ?? "",
        };

        var allDay = row.AllDay || row.Type == "task";
        if (allDay)
        {
            obj["start"] = new Dictionary<string, string> { ["date"] = row.StartUtc[..10] };
            obj["end"] = new Dictionary<string, string> { ["date"] = (row.EndUtc ?? row.StartUtc)[..10] };
        }
        else
        {
            obj["start"] = new Dictionary<string, string> { ["dateTime"] = ToRfc3339(row.StartUtc), ["timeZone"] = "UTC" };
            obj["end"] = new Dictionary<string, string>
            {
                ["dateTime"] = ToRfc3339(row.EndUtc ?? row.StartUtc),
                ["timeZone"] = "UTC",
            };
        }

        var rrule = ToGoogleRecurrence(row.Recurrence);
        if (!string.IsNullOrEmpty(rrule))
            obj["recurrence"] = new[] { rrule };

        return JsonSerializer.Serialize(obj);
    }

    private static string? ToGoogleRecurrence(string recurrence)
    {
        if (!RecurrenceRule.TryParse(recurrence, out var r))
            return null;
        var sb = new System.Text.StringBuilder("RRULE:FREQ=");
        sb.Append(r.Frequency.ToUpperInvariant());
        if (r.Interval > 1)
            sb.Append(CultureInfo.InvariantCulture, $";INTERVAL={r.Interval}");
        if (r.Weekdays.Length > 0)
            sb.Append(";BYDAY=").Append(string.Join(",", r.Weekdays.Select(RecurrenceRule.DayToCode)));
        if (r.Until.HasValue)
            sb.Append(CultureInfo.InvariantCulture, $";UNTIL={r.Until.Value:yyyyMMdd}");
        if (r.Count.HasValue)
            sb.Append(CultureInfo.InvariantCulture, $";COUNT={r.Count.Value}");
        return sb.ToString();
    }

    private void UpsertLocalFromGoogle(string externalId, string title, string desc, string start, string end, string? etag, string? googleUpdated)
    {
        var localId = FindLocalIdByExternalId(externalId);
        if (localId.HasValue)
        {
            if (!ShouldApplyGoogleUpdate(localId.Value, googleUpdated))
                return;

            _calendar.EditItem(localId.Value, title, start, end, desc, "", "", null, false, null, false, null, false, null, false, syncToGoogle: false);
            UpdateLinkEtag(localId.Value, etag, googleUpdated);
            return;
        }

        var tz = _config.Get("timezone") ?? "UTC";
        _calendar.AddItem(title, "event", start, end, false, "", null, desc, "", "", "", tz, syncToGoogle: false);
        var newId = GetLastCalendarId();
        LinkExternal(newId, externalId, etag, googleUpdated);
    }

    private bool ShouldApplyGoogleUpdate(int localId, string? googleUpdated)
    {
        var mode = ReadConflictMode();
        if (string.Equals(mode, "google", StringComparison.OrdinalIgnoreCase))
            return true;
        if (!HasPendingPush(localId))
            return true;
        if (string.Equals(mode, "local", StringComparison.OrdinalIgnoreCase))
            return false;

        if (string.IsNullOrEmpty(googleUpdated))
            return true;
        var linkUpdated = GetLinkGoogleUpdatedAt(localId);
        if (string.IsNullOrEmpty(linkUpdated))
            return true;
        if (!DateTimeOffset.TryParse(googleUpdated, out var googleAt))
            return true;
        if (!DateTimeOffset.TryParse(linkUpdated, out var localAt))
            return true;
        return googleAt >= localAt;
    }

    private bool HasPendingPush(int calendarItemId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT PendingPush FROM CalendarExternalLinks
            WHERE CalendarItemId = $c AND Provider = $p";
        cmd.Parameters.AddWithValue("$c", calendarItemId);
        cmd.Parameters.AddWithValue("$p", Provider);
        var o = cmd.ExecuteScalar();
        return o != null && Convert.ToInt32(o, CultureInfo.InvariantCulture) == 1;
    }

    private string? GetLinkGoogleUpdatedAt(int calendarItemId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT GoogleUpdatedAt FROM CalendarExternalLinks
            WHERE CalendarItemId = $c AND Provider = $p";
        cmd.Parameters.AddWithValue("$c", calendarItemId);
        cmd.Parameters.AddWithValue("$p", Provider);
        return cmd.ExecuteScalar() as string;
    }

    private void DeleteLocalByExternalId(string externalId)
    {
        var id = FindLocalIdByExternalId(externalId);
        if (!id.HasValue) return;
        _calendar.DeleteItem(id.Value, 0, propagateGoogleDelete: false);
        RemoveLink(id.Value);
    }

    private int GetLastCalendarId()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Id FROM CalendarItems ORDER BY Id DESC LIMIT 1";
        return Convert.ToInt32(cmd.ExecuteScalar(), CultureInfo.InvariantCulture);
    }

    private int? FindLocalIdByExternalId(string externalId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT CalendarItemId FROM CalendarExternalLinks WHERE Provider = $p AND ExternalId = $e";
        cmd.Parameters.AddWithValue("$p", Provider);
        cmd.Parameters.AddWithValue("$e", externalId);
        var o = cmd.ExecuteScalar();
        return o == null ? null : Convert.ToInt32(o, CultureInfo.InvariantCulture);
    }

    private void LinkExternal(int calendarItemId, string externalId, string? etag, string? googleUpdated = null)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO CalendarExternalLinks (CalendarItemId, Provider, ExternalId, ETag, UpdatedAt, PendingPush, GoogleUpdatedAt)
            VALUES ($c, $p, $e, $t, $u, 0, $g)
            ON CONFLICT(CalendarItemId, Provider) DO UPDATE SET
                ExternalId = $e, ETag = $t, UpdatedAt = $u, PendingPush = 0, GoogleUpdatedAt = $g";
        cmd.Parameters.AddWithValue("$c", calendarItemId);
        cmd.Parameters.AddWithValue("$p", Provider);
        cmd.Parameters.AddWithValue("$e", externalId);
        cmd.Parameters.AddWithValue("$t", (object?)etag ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$u", DateTime.UtcNow.ToString("o"));
        cmd.Parameters.AddWithValue("$g", (object?)googleUpdated ?? DBNull.Value);
        cmd.ExecuteNonQuery();
    }

    private void UpdateLinkEtag(int calendarItemId, string? etag, string? googleUpdated = null)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE CalendarExternalLinks SET ETag = $t, UpdatedAt = $u, PendingPush = 0, GoogleUpdatedAt = $g
            WHERE CalendarItemId = $c AND Provider = $p";
        cmd.Parameters.AddWithValue("$c", calendarItemId);
        cmd.Parameters.AddWithValue("$p", Provider);
        cmd.Parameters.AddWithValue("$t", (object?)etag ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$u", DateTime.UtcNow.ToString("o"));
        cmd.Parameters.AddWithValue("$g", (object?)googleUpdated ?? DBNull.Value);
        cmd.ExecuteNonQuery();
    }

    private void ClearPending(int calendarItemId, string? etag) => UpdateLinkEtag(calendarItemId, etag);

    private void RemoveLink(int calendarItemId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM CalendarExternalLinks WHERE CalendarItemId = $c AND Provider = $p";
        cmd.Parameters.AddWithValue("$c", calendarItemId);
        cmd.Parameters.AddWithValue("$p", Provider);
        cmd.ExecuteNonQuery();
    }

    private List<LocalEventRow> LoadPendingPushRows()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT c.Id, l.ExternalId, c.Title, c.Description, c.StartDateTime, c.EndDateTime, c.AllDay,
                   c.Type, COALESCE(c.Recurrence, '')
            FROM CalendarExternalLinks l
            JOIN CalendarItems c ON c.Id = l.CalendarItemId
            WHERE l.Provider = $p AND l.PendingPush = 1 AND c.Status = 'active'
              AND c.Type IN ('event', 'task')";
        cmd.Parameters.AddWithValue("$p", Provider);
        return ReadLocalRows(cmd);
    }

    private List<LocalEventRow> LoadUnlinkedLocalEvents()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT c.Id, '', c.Title, c.Description, c.StartDateTime, c.EndDateTime, c.AllDay,
                   c.Type, COALESCE(c.Recurrence, '')
            FROM CalendarItems c
            LEFT JOIN CalendarExternalLinks l ON l.CalendarItemId = c.Id AND l.Provider = $p
            WHERE c.Status = 'active' AND c.Type IN ('event', 'task') AND l.CalendarItemId IS NULL
            LIMIT 25";
        cmd.Parameters.AddWithValue("$p", Provider);
        return ReadLocalRows(cmd);
    }

    private static List<LocalEventRow> ReadLocalRows(SqliteCommand cmd)
    {
        using var r = cmd.ExecuteReader();
        var list = new List<LocalEventRow>();
        while (r.Read())
        {
            list.Add(new LocalEventRow
            {
                CalendarItemId = r.GetInt32(0),
                ExternalId = r.GetString(1),
                Title = r.IsDBNull(2) ? "Event" : r.GetString(2),
                Description = r.IsDBNull(3) ? "" : r.GetString(3),
                StartUtc = r.IsDBNull(4) ? DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm") : r.GetString(4),
                EndUtc = r.IsDBNull(5) ? null : r.GetString(5),
                AllDay = !r.IsDBNull(6) && r.GetInt32(6) == 1,
                Type = r.IsDBNull(7) ? "event" : r.GetString(7),
                Recurrence = r.IsDBNull(8) ? "" : r.GetString(8),
            });
        }

        return list;
    }

    private static HttpClient CreateClient(string accessToken)
    {
        var http = new HttpClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return http;
    }

    private static async Task<string> ExchangeRefreshTokenAsync(string refreshToken)
    {
        using var http = new HttpClient();
        var form = new Dictionary<string, string>
        {
            ["client_id"] = GoogleCalendarOAuthService.ReadClientId()!,
            ["client_secret"] = GoogleCalendarOAuthService.ReadClientSecret()!,
            ["refresh_token"] = refreshToken,
            ["grant_type"] = "refresh_token",
        };
        using var res = await http.PostAsync("https://oauth2.googleapis.com/token", new FormUrlEncodedContent(form));
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException(body);
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.GetProperty("access_token").GetString()!;
    }

    private static string ParseGoogleDateTime(JsonElement el)
    {
        if (el.TryGetProperty("dateTime", out var dt))
        {
            if (DateTimeOffset.TryParse(dt.GetString(), out var dto))
                return dto.UtcDateTime.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        }

        if (el.TryGetProperty("date", out var d))
            return d.GetString() + " 00:00";
        return DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
    }

    private static string ToRfc3339(string storage) =>
        DateTime.ParseExact(storage, "yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal)
            .ToUniversalTime()
            .ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

    private static int ReadPollMinutes()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_GOOGLE_CALENDAR_SYNC_MINUTES");
        if (int.TryParse(raw, out var n))
            return Math.Clamp(n, 5, 1440);
        return 15;
    }

    internal static string ReadConflictMode()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_GOOGLE_SYNC_CONFLICT")?.Trim();
        if (string.IsNullOrEmpty(raw))
            return "newest";
        return raw.ToLowerInvariant() switch
        {
            "google" or "local" or "newest" => raw.ToLowerInvariant(),
            _ => "newest",
        };
    }

    private List<PendingDeleteRow> LoadPendingDeletes(int connectionId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, ExternalId, CalendarId FROM GoogleCalendarPendingDeletes
            WHERE ConnectionId = $c ORDER BY Id LIMIT 50";
        cmd.Parameters.AddWithValue("$c", connectionId);
        using var r = cmd.ExecuteReader();
        var list = new List<PendingDeleteRow>();
        while (r.Read())
        {
            list.Add(new PendingDeleteRow
            {
                Id = r.GetInt32(0),
                ExternalId = r.GetString(1),
                CalendarId = r.GetString(2),
            });
        }

        return list;
    }

    private void RemovePendingDelete(int id)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM GoogleCalendarPendingDeletes WHERE Id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    private sealed class PendingDeleteRow
    {
        public int Id { get; set; }
        public string ExternalId { get; set; } = "";
        public string CalendarId { get; set; } = "";
    }

    private sealed class LocalEventRow
    {
        public int CalendarItemId { get; set; }
        public string ExternalId { get; set; } = "";
        public string Title { get; set; } = "";
        public string? Description { get; set; }
        public string StartUtc { get; set; } = "";
        public string? EndUtc { get; set; }
        public bool AllDay { get; set; }
        public string Type { get; set; } = "event";
        public string Recurrence { get; set; } = "";
    }
}
