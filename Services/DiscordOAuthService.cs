using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Data.Sqlite;

/// <summary>
/// Discord OAuth2 (authorization code) for Web UI sign-in. Uses env
/// <c>HOMEBOT_DISCORD_OAUTH_CLIENT_ID</c>, <c>HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET</c>,
/// <c>HOMEBOT_DISCORD_OAUTH_REDIRECT_URI</c> (must match the Discord app redirect URL exactly),
/// and <c>HOMEBOT_WEB_OAUTH_FRONTEND_URL</c> for the browser return path.
/// </summary>
public sealed class DiscordOAuthService
{
    private const string DiscordTokenEndpoint = "https://discord.com/api/oauth2/token";
    private const string DiscordMeEndpoint = "https://discord.com/api/users/@me";
    private const string DiscordAuthorizeHost = "https://discord.com/api/oauth2/authorize";

    private readonly DatabaseService _db;
    private readonly WebAuthService _auth;

    public DiscordOAuthService(DatabaseService db, WebAuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    public static string? ReadClientId() => Environment.GetEnvironmentVariable("HOMEBOT_DISCORD_OAUTH_CLIENT_ID")?.Trim();

    public static string? ReadClientSecret() =>
        Environment.GetEnvironmentVariable("HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET")?.Trim();

    public static string? ReadRedirectUri() =>
        Environment.GetEnvironmentVariable("HOMEBOT_DISCORD_OAUTH_REDIRECT_URI")?.Trim();

    public static string ReadFrontendBase() =>
        Environment.GetEnvironmentVariable("HOMEBOT_WEB_OAUTH_FRONTEND_URL")?.Trim() ?? "http://localhost:5173";

    public bool IsOAuthConfigured() =>
        !string.IsNullOrEmpty(ReadClientId()) &&
        !string.IsNullOrEmpty(ReadClientSecret()) &&
        !string.IsNullOrEmpty(ReadRedirectUri());

    public IResult? TryGetAuthorizeUrl(out string authorizeUrl)
    {
        authorizeUrl = "";
        if (!IsOAuthConfigured())
        {
            return ApiResults.BadRequest(
                "Discord OAuth is not configured (set HOMEBOT_DISCORD_OAUTH_CLIENT_ID, HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET, HOMEBOT_DISCORD_OAUTH_REDIRECT_URI).",
                "oauth_not_configured");
        }

        var secret = WebAuthService.ReadJwtSecret();
        if (!WebAuthService.IsJwtSecretConfigured(secret))
        {
            return ApiResults.BadRequest(
                "HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes) is required for web sign-in.",
                "jwt_not_configured");
        }

        var state = CreateSignedState(secret!);
        var clientId = ReadClientId()!;
        var redirect = ReadRedirectUri()!;
        var q = new Dictionary<string, string?>
        {
            ["client_id"] = clientId,
            ["redirect_uri"] = redirect,
            ["response_type"] = "code",
            ["scope"] = "identify",
            ["state"] = state,
            ["prompt"] = "consent",
        };
        authorizeUrl = QueryHelpers.AddQueryString(DiscordAuthorizeHost, q);
        return null;
    }

    public async Task<IResult> HandleCallbackAsync(string code, string state, CancellationToken cancellationToken)
    {
        var fe = ReadFrontendBase().TrimEnd('/');
        var secret = WebAuthService.ReadJwtSecret();
        if (!WebAuthService.IsJwtSecretConfigured(secret) || !ValidateSignedState(state, secret!))
            return Results.Redirect($"{fe}/oauth/callback?oauth_error=invalid_state");

        if (string.IsNullOrWhiteSpace(code))
            return Results.Redirect($"{fe}/oauth/callback?oauth_error=missing_code");

        string discordId;
        try
        {
            discordId = await ExchangeCodeAndGetUserIdAsync(code, cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            return Results.Redirect($"{fe}/oauth/callback?oauth_error=token_exchange_failed");
        }

        var login = _auth.TryIssueJwtForWebUserByDiscordId(discordId);
        if (login is null)
        {
            return Results.Redirect(
                $"{fe}/oauth/callback?oauth_error=no_web_account&message=" +
                Uri.EscapeDataString(
                    "No web user is linked to this Discord account. Create one on the setup page first, then try again."));
        }

        var (_, username, did) = login.Value;
        var exchange = CreateExchangeCode();
        StoreExchange(exchange, username, did);

        return Results.Redirect($"{fe}/oauth/callback?oauth_code={Uri.EscapeDataString(exchange)}");
    }

    public IResult? TryConsumeExchange(string code, out (string AccessToken, string Username, string DiscordUserId)? tokens)
    {
        tokens = null;
        if (string.IsNullOrWhiteSpace(code))
            return ApiResults.Validation("code is required.");

        string username;
        string discordUserId;

        using (var conn = _db.GetConnection())
        {
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT Username, DiscordUserId, ExpiresAt FROM WebOAuthExchangeCodes WHERE Code = $c";
            cmd.Parameters.AddWithValue("$c", code.Trim());

            using var reader = cmd.ExecuteReader();
            if (!reader.Read())
                return ApiResults.BadRequest("Unknown or expired OAuth code.", "oauth_code_invalid");

            username = reader.GetString(0);
            discordUserId = reader.GetString(1);
            var expRaw = reader.GetString(2);
            reader.Close();

            if (!DateTimeOffset.TryParse(
                    expRaw,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.RoundtripKind,
                    out var exp) || DateTimeOffset.UtcNow > exp)
            {
                DeleteExchange(conn, code.Trim());
                return ApiResults.BadRequest("OAuth code has expired.", "oauth_code_expired");
            }

            DeleteExchange(conn, code.Trim());
        }

        var fresh = _auth.TryIssueJwtForWebUserByDiscordId(discordUserId);
        if (fresh is null || !string.Equals(fresh.Value.Username, username, StringComparison.OrdinalIgnoreCase))
            return ApiResults.BadRequest("Account no longer exists or has changed.", "oauth_account_invalid");

        tokens = fresh;
        return null;
    }

    private static void DeleteExchange(SqliteConnection conn, string code)
    {
        using var del = conn.CreateCommand();
        del.CommandText = "DELETE FROM WebOAuthExchangeCodes WHERE Code = $c";
        del.Parameters.AddWithValue("$c", code);
        del.ExecuteNonQuery();
    }

    private void StoreExchange(string code, string username, string discordUserId)
    {
        var exp = DateTimeOffset.UtcNow.AddMinutes(2).ToString("o", CultureInfo.InvariantCulture);
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO WebOAuthExchangeCodes (Code, Username, DiscordUserId, ExpiresAt)
            VALUES ($c, $u, $d, $e)";
        cmd.Parameters.AddWithValue("$c", code);
        cmd.Parameters.AddWithValue("$u", username);
        cmd.Parameters.AddWithValue("$d", discordUserId);
        cmd.Parameters.AddWithValue("$e", exp);
        cmd.ExecuteNonQuery();
    }

    private static string CreateExchangeCode() => Guid.NewGuid().ToString("N");

    private async Task<string> ExchangeCodeAndGetUserIdAsync(string code, CancellationToken cancellationToken)
    {
        using var http = new HttpClient();

        var clientId = ReadClientId()!;
        var clientSecret = ReadClientSecret()!;
        var redirect = ReadRedirectUri()!;

        var body = new Dictionary<string, string>
        {
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = redirect,
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, DiscordTokenEndpoint);
        req.Content = new FormUrlEncodedContent(body);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var resp = await http.SendAsync(req, cancellationToken).ConfigureAwait(false);
        var txt = await resp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (!resp.IsSuccessStatusCode)
            throw new InvalidOperationException($"Discord token: {resp.StatusCode} {txt}");

        using var tokenDoc = JsonDocument.Parse(txt);
        var access = tokenDoc.RootElement.GetProperty("access_token").GetString()
            ?? throw new InvalidOperationException("Missing access_token");

        using var meReq = new HttpRequestMessage(HttpMethod.Get, DiscordMeEndpoint);
        meReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
        using var meResp = await http.SendAsync(meReq, cancellationToken).ConfigureAwait(false);
        var meTxt = await meResp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (!meResp.IsSuccessStatusCode)
            throw new InvalidOperationException($"Discord @me: {meResp.StatusCode} {meTxt}");

        using var meDoc = JsonDocument.Parse(meTxt);
        var id = meDoc.RootElement.GetProperty("id").GetString();
        if (string.IsNullOrWhiteSpace(id) ||
            !ulong.TryParse(id, NumberStyles.Integer, CultureInfo.InvariantCulture, out var uid) ||
            uid == 0)
        {
            throw new InvalidOperationException("Invalid user id from Discord.");
        }

        return id;
    }

    private static string CreateSignedState(string jwtSecret)
    {
        var exp = DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeSeconds();
        var rnd = Guid.NewGuid().ToString("N");
        var payload = $"{exp}.{rnd}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(jwtSecret));
        var sig = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)));
        var combined = $"{payload}.{sig}";
        return WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(combined));
    }

    private static bool ValidateSignedState(string state, string jwtSecret)
    {
        try
        {
            var bytes = WebEncoders.Base64UrlDecode(state);
            var combined = Encoding.UTF8.GetString(bytes);
            var lastDot = combined.LastIndexOf('.');
            if (lastDot <= 0)
                return false;
            var payload = combined[..lastDot];
            var sigHex = combined[(lastDot + 1)..];
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(jwtSecret));
            var expected = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)));
            if (!CryptographicOperations.FixedTimeEquals(
                    Convert.FromHexString(expected),
                    Convert.FromHexString(sigHex)))
                return false;

            var expSep = payload.IndexOf('.');
            if (expSep <= 0)
                return false;
            if (!long.TryParse(payload[..expSep], NumberStyles.Integer, CultureInfo.InvariantCulture, out var expUnix))
                return false;

            var exp = DateTimeOffset.FromUnixTimeSeconds(expUnix);
            return DateTimeOffset.UtcNow <= exp;
        }
        catch
        {
            return false;
        }
    }
}
