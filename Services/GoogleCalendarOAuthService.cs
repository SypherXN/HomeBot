using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Data.Sqlite;

/// <summary>Google OAuth2 for Calendar two-way sync.</summary>
public sealed class GoogleCalendarOAuthService
{
    private const string TokenEndpoint = "https://oauth2.googleapis.com/token";
    private const string AuthorizeHost = "https://accounts.google.com/o/oauth2/v2/auth";
    private const string CalendarScope = "https://www.googleapis.com/auth/calendar";

    private readonly DatabaseService _db;

    public GoogleCalendarOAuthService(DatabaseService db)
    {
        _db = db;
    }

    public static string? ReadClientId() =>
        Environment.GetEnvironmentVariable("HOMEBOT_GOOGLE_OAUTH_CLIENT_ID")?.Trim();

    public static string? ReadClientSecret() =>
        Environment.GetEnvironmentVariable("HOMEBOT_GOOGLE_OAUTH_CLIENT_SECRET")?.Trim();

    public static string? ReadRedirectUri() =>
        Environment.GetEnvironmentVariable("HOMEBOT_GOOGLE_OAUTH_REDIRECT_URI")?.Trim();

    public bool IsConfigured() =>
        !string.IsNullOrEmpty(ReadClientId()) &&
        !string.IsNullOrEmpty(ReadClientSecret()) &&
        !string.IsNullOrEmpty(ReadRedirectUri());

    public IResult? TryGetAuthorizeUrl(string discordUserId, out string url)
    {
        url = "";
        if (!IsConfigured())
            return ApiResults.BadRequest("Google OAuth not configured.", "oauth_not_configured");

        var secret = WebAuthService.ReadJwtSecret();
        if (!WebAuthService.IsJwtSecretConfigured(secret))
            return ApiResults.BadRequest("JWT secret required.", "jwt_not_configured");

        var state = CreateSignedState(discordUserId.Trim(), secret!);
        var q = new Dictionary<string, string?>
        {
            ["client_id"] = ReadClientId(),
            ["redirect_uri"] = ReadRedirectUri(),
            ["response_type"] = "code",
            ["scope"] = CalendarScope,
            ["access_type"] = "offline",
            ["prompt"] = "consent",
            ["state"] = state,
        };
        url = QueryHelpers.AddQueryString(AuthorizeHost, q);
        return null;
    }

    public async Task<IResult?> TryHandleCallbackAsync(string code, string state)
    {
        if (!IsConfigured())
            return ApiResults.BadRequest("Google OAuth not configured.", "oauth_not_configured");

        var secret = WebAuthService.ReadJwtSecret();
        if (!WebAuthService.IsJwtSecretConfigured(secret) || !TryValidateState(state, secret!, out var discordUserId))
            return ApiResults.Validation("Invalid OAuth state.");

        using var http = new HttpClient();
        var form = new Dictionary<string, string>
        {
            ["code"] = code,
            ["client_id"] = ReadClientId()!,
            ["client_secret"] = ReadClientSecret()!,
            ["redirect_uri"] = ReadRedirectUri()!,
            ["grant_type"] = "authorization_code",
        };
        using var res = await http.PostAsync(TokenEndpoint, new FormUrlEncodedContent(form));
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            return ApiResults.BadRequest($"Google token exchange failed: {body}", "oauth_exchange_failed");

        using var doc = JsonDocument.Parse(body);
        var refresh = doc.RootElement.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : null;
        if (string.IsNullOrEmpty(refresh))
            return ApiResults.BadRequest("Google did not return a refresh token. Revoke app access and retry with consent.", "no_refresh_token");

        SaveConnection(discordUserId, refresh!);
        return null;
    }

    public void Disconnect(string discordUserId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE GoogleCalendarConnections SET IsActive = 0 WHERE DiscordUserId = $d";
        cmd.Parameters.AddWithValue("$d", discordUserId.Trim());
        cmd.ExecuteNonQuery();
    }

    public GoogleCalendarConnectionModel? GetConnection(string discordUserId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, DiscordUserId, CalendarId, SyncToken, LastSyncAt, LastSyncError, IsActive
            FROM GoogleCalendarConnections WHERE DiscordUserId = $d AND IsActive = 1";
        cmd.Parameters.AddWithValue("$d", discordUserId.Trim());
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return null;
        return ReadConnection(r);
    }

    public List<GoogleCalendarConnectionModel> ListActiveConnections()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, DiscordUserId, CalendarId, SyncToken, LastSyncAt, LastSyncError, IsActive
            FROM GoogleCalendarConnections WHERE IsActive = 1";
        using var r = cmd.ExecuteReader();
        var list = new List<GoogleCalendarConnectionModel>();
        while (r.Read())
            list.Add(ReadConnection(r));
        return list;
    }

    internal string? GetRefreshToken(int connectionId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT RefreshToken FROM GoogleCalendarConnections WHERE Id = $id AND IsActive = 1";
        cmd.Parameters.AddWithValue("$id", connectionId);
        return cmd.ExecuteScalar() as string;
    }

    internal void UpdateSyncState(int connectionId, string? syncToken, string? error)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE GoogleCalendarConnections
            SET SyncToken = $t, LastSyncAt = $at, LastSyncError = $err
            WHERE Id = $id";
        cmd.Parameters.AddWithValue("$id", connectionId);
        cmd.Parameters.AddWithValue("$t", (object?)syncToken ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$at", DateTime.UtcNow.ToString("o"));
        cmd.Parameters.AddWithValue("$err", (object?)error ?? DBNull.Value);
        cmd.ExecuteNonQuery();
    }

    public void SetCalendarId(string discordUserId, string calendarId)
    {
        if (string.IsNullOrWhiteSpace(calendarId))
            throw new ArgumentException("calendarId required.");

        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE GoogleCalendarConnections
            SET CalendarId = $c, SyncToken = NULL, LastSyncError = NULL
            WHERE DiscordUserId = $d AND IsActive = 1";
        cmd.Parameters.AddWithValue("$d", discordUserId.Trim());
        cmd.Parameters.AddWithValue("$c", calendarId.Trim());
        if (cmd.ExecuteNonQuery() == 0)
            throw new InvalidOperationException("Google Calendar not connected.");
    }

    public async Task<List<GoogleCalendarListItem>> ListCalendarsAsync(string discordUserId)
    {
        var connection = GetConnection(discordUserId);
        if (connection == null)
            throw new InvalidOperationException("Google Calendar not connected.");

        var refresh = GetRefreshToken(connection.Id);
        if (string.IsNullOrEmpty(refresh))
            return [];

        var access = await ExchangeRefreshTokenAsync(refresh);
        using var http = new HttpClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", access);
        using var res = await http.GetAsync("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer");
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException(body);

        using var doc = JsonDocument.Parse(body);
        var list = new List<GoogleCalendarListItem>();
        if (!doc.RootElement.TryGetProperty("items", out var items))
            return list;

        foreach (var item in items.EnumerateArray())
        {
            var id = item.GetProperty("id").GetString() ?? "";
            if (string.IsNullOrEmpty(id)) continue;
            list.Add(new GoogleCalendarListItem
            {
                Id = id,
                Summary = item.TryGetProperty("summary", out var s) ? s.GetString() ?? id : id,
                Primary = item.TryGetProperty("primary", out var p) && p.GetBoolean(),
            });
        }

        return list.OrderByDescending(c => c.Primary).ThenBy(c => c.Summary, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static async Task<string> ExchangeRefreshTokenAsync(string refreshToken)
    {
        using var http = new HttpClient();
        var form = new Dictionary<string, string>
        {
            ["client_id"] = ReadClientId()!,
            ["client_secret"] = ReadClientSecret()!,
            ["refresh_token"] = refreshToken,
            ["grant_type"] = "refresh_token",
        };
        using var res = await http.PostAsync(TokenEndpoint, new FormUrlEncodedContent(form));
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException(body);
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.GetProperty("access_token").GetString()!;
    }

    private void SaveConnection(string discordUserId, string refreshToken)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO GoogleCalendarConnections (DiscordUserId, RefreshToken, CalendarId, IsActive)
            VALUES ($d, $r, 'primary', 1)
            ON CONFLICT(DiscordUserId) DO UPDATE SET
                RefreshToken = $r, IsActive = 1, SyncToken = NULL, LastSyncError = NULL";
        cmd.Parameters.AddWithValue("$d", discordUserId);
        cmd.Parameters.AddWithValue("$r", refreshToken);
        cmd.ExecuteNonQuery();
    }

    private static GoogleCalendarConnectionModel ReadConnection(SqliteDataReader r) =>
        new()
        {
            Id = r.GetInt32(0),
            DiscordUserId = r.GetString(1),
            CalendarId = r.GetString(2),
            SyncToken = r.IsDBNull(3) ? null : r.GetString(3),
            LastSyncAt = r.IsDBNull(4) ? null : r.GetString(4),
            LastSyncError = r.IsDBNull(5) ? null : r.GetString(5),
            IsActive = r.GetInt32(6) == 1,
        };

    private static string CreateSignedState(string discordUserId, string secret)
    {
        var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
        var payload = $"{discordUserId}|{ts}";
        var sig = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
        return WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes($"{payload}|{sig}"));
    }

    private static bool TryValidateState(string state, string secret, out string discordUserId)
    {
        discordUserId = "";
        try
        {
            var raw = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(state));
            var parts = raw.Split('|');
            if (parts.Length != 3) return false;
            discordUserId = parts[0];
            if (!long.TryParse(parts[1], out var ts)) return false;
            if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() - ts > 900) return false;
            var payload = $"{parts[0]}|{parts[1]}";
            var expected = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
            return CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected),
                Encoding.UTF8.GetBytes(parts[2]));
        }
        catch
        {
            return false;
        }
    }
}

public sealed class GoogleCalendarConnectionModel
{
    public int Id { get; set; }
    public string DiscordUserId { get; set; } = "";
    public string CalendarId { get; set; } = "primary";
    public string? SyncToken { get; set; }
    public string? LastSyncAt { get; set; }
    public string? LastSyncError { get; set; }
    public bool IsActive { get; set; }
}

public sealed class GoogleCalendarListItem
{
    public string Id { get; set; } = "";
    public string Summary { get; set; } = "";
    public bool Primary { get; set; }
}
