using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;

/// <summary>
/// Household web logins stored in SQLite (<see cref="DatabaseService"/> <c>WebUsers</c>).
/// </summary>
public sealed class WebAuthService
{
    private static readonly Regex UsernamePattern = new("^[a-zA-Z0-9_-]{3,40}$", RegexOptions.CultureInvariant);

    private readonly DatabaseService _db;

    public WebAuthService(DatabaseService db)
    {
        _db = db;
    }

    public static string? ReadJwtSecret()
    {
        var s = Environment.GetEnvironmentVariable("HOMEBOT_WEB_JWT_SECRET")?.Trim();
        return string.IsNullOrEmpty(s) ? null : s;
    }

    public static bool IsJwtSecretConfigured(string? secret) =>
        !string.IsNullOrEmpty(secret) && Encoding.UTF8.GetByteCount(secret) >= 32;

    public int CountUsers()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM WebUsers";
        var n = Convert.ToInt32(cmd.ExecuteScalar(), CultureInfo.InvariantCulture);
        return n;
    }

    public IResult? TryCreateFirstUser(string username, string password, string discordUserId, string? setupToken)
    {
        if (!IsJwtSecretConfigured(ReadJwtSecret()))
            return ApiResults.BadRequest("HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes) is required.", "jwt_not_configured");

        if (CountUsers() > 0)
            return ApiResults.Conflict("A web user already exists. Use register with an invite token.", "bootstrap_used");

        var setupEnv = Environment.GetEnvironmentVariable("HOMEBOT_WEB_SETUP_TOKEN")?.Trim();
        if (!string.IsNullOrEmpty(setupEnv))
        {
            if (string.IsNullOrEmpty(setupToken) || !CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(setupEnv),
                    Encoding.UTF8.GetBytes(setupToken)))
            {
                return ApiResults.Validation("Invalid or missing setupToken (HOMEBOT_WEB_SETUP_TOKEN is configured).");
            }
        }

        return TryInsertUser(username, password, discordUserId);
    }

    /// <summary>
    /// Inserts a web user after Discord-side verification (or tests).
    /// </summary>
    public IResult? TryInsertWebUser(string username, string password, string discordUserId) =>
        TryInsertUser(username, password, discordUserId);

    public IResult? TryRegisterInvited(string inviteToken, string username, string password, string discordUserId)
    {
        if (!IsJwtSecretConfigured(ReadJwtSecret()))
            return ApiResults.BadRequest("HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes) is required.", "jwt_not_configured");

        var invite = Environment.GetEnvironmentVariable("HOMEBOT_WEB_INVITE_TOKEN")?.Trim();
        if (string.IsNullOrEmpty(invite))
            return ApiResults.BadRequest("Registration is disabled (HOMEBOT_WEB_INVITE_TOKEN not set).", "invite_disabled");

        if (string.IsNullOrEmpty(inviteToken) || !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(invite),
                Encoding.UTF8.GetBytes(inviteToken)))
        {
            return ApiResults.Validation("Invalid invite token.");
        }

        return TryInsertUser(username, password, discordUserId);
    }

    public (string accessToken, string username, string discordUserId)? TryLogin(string username, string password)
    {
        var secret = ReadJwtSecret();
        if (!IsJwtSecretConfigured(secret))
            return null;

        if (!TryGetUserCredentials(username.Trim(), out var storedHash, out var discordUserId))
            return null;

        if (!VerifyPassword(password, storedHash))
            return null;

        var token = HomeBotJwtTokens.CreateAccessToken(username.Trim(), discordUserId, secret!);
        return (token, username.Trim(), discordUserId);
    }

    /// <summary>
    /// Issues the same session JWT shape as password login when a <see cref="WebUsers"/> row exists for the Discord id.
    /// Used by Discord OAuth after the user proves identity with Discord.
    /// </summary>
    public (string AccessToken, string Username, string DiscordUserId)? TryIssueJwtForWebUserByDiscordId(string discordUserIdDigits)
    {
        var secret = ReadJwtSecret();
        if (!IsJwtSecretConfigured(secret))
            return null;

        var d = discordUserIdDigits.Trim();
        if (!ulong.TryParse(d, NumberStyles.Integer, CultureInfo.InvariantCulture, out var uid) || uid == 0)
            return null;

        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Username FROM WebUsers WHERE DiscordUserId = $d";
        cmd.Parameters.AddWithValue("$d", d);
        var o = cmd.ExecuteScalar();
        if (o is null)
            return null;

        var username = Convert.ToString(o, CultureInfo.InvariantCulture)!.Trim();
        if (username.Length == 0)
            return null;

        var token = HomeBotJwtTokens.CreateAccessToken(username, d, secret!);
        return (token, username, d);
    }

    private IResult? TryInsertUser(string username, string password, string discordUserId)
    {
        var nameErr = ValidateUsername(username);
        if (nameErr != null)
            return ApiResults.Validation(nameErr);

        var passErr = ValidatePassword(password);
        if (passErr != null)
            return ApiResults.Validation(passErr);

        if (!ulong.TryParse(discordUserId.Trim(), CultureInfo.InvariantCulture, out var snowflake) || snowflake == 0)
            return ApiResults.Validation("discordUserId must be a non-zero numeric Discord user id.");

        var hash = HashPassword(password);

        try
        {
            using var conn = _db.GetConnection();
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO WebUsers (Username, PasswordHash, DiscordUserId)
                VALUES ($u, $p, $d)";
            cmd.Parameters.AddWithValue("$u", username.Trim());
            cmd.Parameters.AddWithValue("$p", hash);
            cmd.Parameters.AddWithValue("$d", discordUserId.Trim());
            cmd.ExecuteNonQuery();
        }
        catch (SqliteException ex) when (ex.Message.Contains("UNIQUE", StringComparison.OrdinalIgnoreCase))
        {
            return ApiResults.Conflict("That username is already taken.", "username_taken");
        }

        return null;
    }

    private static string? ValidateUsername(string username)
    {
        var t = username.Trim();
        if (t.Length < 3)
            return "Username must be at least 3 characters.";
        if (!UsernamePattern.IsMatch(t))
            return "Username may use letters, digits, underscore, and hyphen (3–40 characters).";
        return null;
    }

    private static string? ValidatePassword(string password)
    {
        if (password.Length < 8)
            return "Password must be at least 8 characters.";
        return null;
    }

    private bool TryGetUserCredentials(string username, out string passwordHash, out string discordUserId)
    {
        passwordHash = "";
        discordUserId = "";

        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT PasswordHash, DiscordUserId FROM WebUsers WHERE Username = $u COLLATE NOCASE";
        cmd.Parameters.AddWithValue("$u", username);

        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
            return false;

        passwordHash = reader.GetString(0);
        discordUserId = reader.GetString(1);
        return true;
    }

    private static string HashPassword(string password)
    {
        Span<byte> salt = stackalloc byte[16];
        RandomNumberGenerator.Fill(salt);

        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            120_000,
            HashAlgorithmName.SHA256,
            32);

        return string.Create(CultureInfo.InvariantCulture, $"120000.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}");
    }

    private static bool VerifyPassword(string password, string stored)
    {
        var parts = stored.Split('.');
        if (parts.Length != 3)
            return false;

        if (!int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var iterations) || iterations < 10_000)
            return false;

        byte[] salt;
        byte[] expected;
        try
        {
            salt = Convert.FromBase64String(parts[1]);
            expected = Convert.FromBase64String(parts[2]);
        }
        catch
        {
            return false;
        }

        var actual = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            expected.Length);

        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}
