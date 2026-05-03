using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;

/// <summary>
/// Links Web UI account creation to a Discord user by having them run <c>/webui-verify</c> in the guild.
/// </summary>
public sealed class WebAuthDiscordVerificationService
{
    private const string Charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private const int CodeLength = 8;
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromMinutes(15);

    private readonly DatabaseService _db;
    private readonly WebAuthService _auth;

    public WebAuthDiscordVerificationService(DatabaseService db, WebAuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    public sealed record StartResult(string SessionId, string Code, DateTimeOffset ExpiresAt);

    public IResult? TryStart(string intent, out StartResult? result)
    {
        result = null;
        if (!WebAuthService.IsJwtSecretConfigured(WebAuthService.ReadJwtSecret()))
            return ApiResults.BadRequest("HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes) is required.", "jwt_not_configured");

        var i = intent.Trim().ToLowerInvariant();
        if (i is not ("bootstrap" or "register"))
            return ApiResults.Validation("intent must be 'bootstrap' or 'register'.");

        var users = _auth.CountUsers();
        if (i == "bootstrap" && users > 0)
            return ApiResults.Conflict("Bootstrap is only for the first account. Use register.", "bootstrap_used");

        if (i == "register" && users == 0)
            return ApiResults.BadRequest("Create the first account with bootstrap first.", "register_needs_bootstrap");

        var sessionId = Guid.NewGuid().ToString("N");
        var code = GenerateCode();
        var expires = DateTimeOffset.UtcNow.Add(SessionLifetime);

        try
        {
            using var conn = _db.GetConnection();
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO WebAuthVerifications (SessionId, Code, Intent, ExpiresAt)
                VALUES ($s, $c, $i, $e)";
            cmd.Parameters.AddWithValue("$s", sessionId);
            cmd.Parameters.AddWithValue("$c", code);
            cmd.Parameters.AddWithValue("$i", i);
            cmd.Parameters.AddWithValue("$e", expires.ToString("o", CultureInfo.InvariantCulture));
            cmd.ExecuteNonQuery();
        }
        catch (SqliteException ex) when (ex.Message.Contains("UNIQUE", StringComparison.OrdinalIgnoreCase))
        {
            return ApiResults.Conflict("Could not allocate a unique code; try again.", "code_collision");
        }

        result = new StartResult(sessionId, code, expires);
        return null;
    }

    /// <summary>
    /// Called from the Discord slash command when a member submits the code.
    /// </summary>
    public string TryVerifyInDiscord(string codeInput, ulong discordUserId)
    {
        if (string.IsNullOrWhiteSpace(codeInput))
            return "Enter the code from the web page (e.g. `/webui-verify code:ABCD12EF`).";

        var code = NormalizeCode(codeInput);
        if (code.Length != CodeLength)
            return "That code does not look valid. Copy the 8 characters from the web page.";

        using var conn = _db.GetConnection();
        conn.Open();

        using (var tx = conn.BeginTransaction())
        {
            using var sel = conn.CreateCommand();
            sel.Transaction = tx;
            sel.CommandText = @"
                SELECT SessionId, DiscordUserId, ExpiresAt, ConsumedAt FROM WebAuthVerifications
                WHERE Code = $c COLLATE NOCASE";
            sel.Parameters.AddWithValue("$c", code);

            using var reader = sel.ExecuteReader();
            if (!reader.Read())
            {
                tx.Commit();
                return "Unknown or expired code. Start again on the web setup page.";
            }

            var sessionId = reader.GetString(0);
            var existingDiscord = reader.IsDBNull(1) ? null : reader.GetString(1);
            var expiresAtRaw = reader.GetString(2);
            var consumedAt = reader.IsDBNull(3) ? null : reader.GetString(3);

            reader.Close();

            if (consumedAt != null)
            {
                tx.Commit();
                return "That code was already used to create an account.";
            }

            if (!DateTimeOffset.TryParse(
                    expiresAtRaw,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.RoundtripKind,
                    out var expiresAt) || DateTimeOffset.UtcNow > expiresAt)
            {
                tx.Commit();
                return "That code has expired. Start again on the web setup page.";
            }

            var did = discordUserId.ToString(CultureInfo.InvariantCulture);
            if (existingDiscord != null && existingDiscord != did)
                return "Someone else already confirmed this code in Discord.";

            using var upd = conn.CreateCommand();
            upd.Transaction = tx;
            upd.CommandText = @"
                UPDATE WebAuthVerifications
                SET DiscordUserId = $d, VerifiedAt = $v
                WHERE SessionId = $s AND (DiscordUserId IS NULL OR DiscordUserId = $d)";
            upd.Parameters.AddWithValue("$d", did);
            upd.Parameters.AddWithValue("$v", DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture));
            upd.Parameters.AddWithValue("$s", sessionId);
            var n = upd.ExecuteNonQuery();
            if (n == 0)
            {
                tx.Commit();
                return "Could not update this verification (try a new code from the web page).";
            }

            tx.Commit();
        }

        return $"✅ Linked to your Discord account. Go back to the browser and finish creating **{code}**.";
    }

    public sealed record DiscordVerifyStatus(
        bool Exists,
        bool DiscordVerified,
        bool Consumed,
        bool Expired,
        DateTimeOffset? ExpiresAt);

    public DiscordVerifyStatus GetStatus(string sessionId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT DiscordUserId, ExpiresAt, ConsumedAt FROM WebAuthVerifications WHERE SessionId = $s";
        cmd.Parameters.AddWithValue("$s", sessionId.Trim());

        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
            return new DiscordVerifyStatus(false, false, false, false, null);

        var hasDiscord = !reader.IsDBNull(0);
        var expRaw = reader.GetString(1);
        var consumed = !reader.IsDBNull(2);
        DateTimeOffset.TryParse(expRaw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var exp);
        var expired = DateTimeOffset.UtcNow > exp;
        var discordVerified = hasDiscord && !consumed && !expired;
        return new DiscordVerifyStatus(true, discordVerified, consumed, expired, exp);
    }

    public IResult? TryCompleteBootstrap(string sessionId, string username, string password)
    {
        if (!WebAuthService.IsJwtSecretConfigured(WebAuthService.ReadJwtSecret()))
            return ApiResults.BadRequest("HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes) is required.", "jwt_not_configured");

        if (_auth.CountUsers() > 0)
            return ApiResults.Conflict("A web user already exists.", "bootstrap_used");

        var discord = ConsumeVerifiedSession(sessionId.Trim(), "bootstrap");
        if (discord == null)
            return ApiResults.BadRequest("Session not found, not verified in Discord, expired, or already used.", "verify_invalid");

        return _auth.TryInsertWebUser(username, password, discord);
    }

    public IResult? TryCompleteRegister(string sessionId, string username, string password)
    {
        if (!WebAuthService.IsJwtSecretConfigured(WebAuthService.ReadJwtSecret()))
            return ApiResults.BadRequest("HOMEBOT_WEB_JWT_SECRET (min 32 UTF-8 bytes) is required.", "jwt_not_configured");

        if (_auth.CountUsers() == 0)
            return ApiResults.BadRequest("Use bootstrap for the first account.", "register_needs_bootstrap");

        var discord = ConsumeVerifiedSession(sessionId.Trim(), "register");
        if (discord == null)
            return ApiResults.BadRequest("Session not found, not verified in Discord, expired, or already used.", "verify_invalid");

        return _auth.TryInsertWebUser(username, password, discord);
    }

    private string? ConsumeVerifiedSession(string sessionId, string expectedIntent)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        using var sel = conn.CreateCommand();
        sel.Transaction = tx;
        sel.CommandText = @"
            SELECT Intent, DiscordUserId, VerifiedAt, ExpiresAt, ConsumedAt
            FROM WebAuthVerifications WHERE SessionId = $s";
        sel.Parameters.AddWithValue("$s", sessionId);

        using var reader = sel.ExecuteReader();
        if (!reader.Read())
        {
            reader.Close();
            tx.Commit();
            return null;
        }

        var intent = reader.GetString(0);
        var discord = reader.IsDBNull(1) ? null : reader.GetString(1);
        var verifiedAt = reader.IsDBNull(2) ? null : reader.GetString(2);
        var expiresRaw = reader.GetString(3);
        var consumed = reader.IsDBNull(4) ? null : reader.GetString(4);
        reader.Close();

        if (consumed != null || discord == null || verifiedAt == null || intent != expectedIntent)
        {
            tx.Commit();
            return null;
        }

        if (!DateTimeOffset.TryParse(
                expiresRaw,
                CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind,
                out var expiresAt) || DateTimeOffset.UtcNow > expiresAt)
        {
            tx.Commit();
            return null;
        }

        using var upd = conn.CreateCommand();
        upd.Transaction = tx;
        upd.CommandText = @"
            UPDATE WebAuthVerifications SET ConsumedAt = $c WHERE SessionId = $s AND ConsumedAt IS NULL";
        upd.Parameters.AddWithValue("$c", DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture));
        upd.Parameters.AddWithValue("$s", sessionId);
        var n = upd.ExecuteNonQuery();
        tx.Commit();
        return n == 1 ? discord : null;
    }

    private static string GenerateCode()
    {
        Span<byte> bytes = stackalloc byte[CodeLength];
        RandomNumberGenerator.Fill(bytes);
        var sb = new StringBuilder(CodeLength);
        for (var i = 0; i < CodeLength; i++)
            sb.Append(Charset[bytes[i] % Charset.Length]);
        return sb.ToString();
    }

    private static string NormalizeCode(string input)
    {
        var sb = new StringBuilder(CodeLength);
        foreach (var ch in input.Trim().ToUpperInvariant())
        {
            if (ch is '-' or ' ')
                continue;
            sb.Append(ch);
            if (sb.Length >= CodeLength)
                break;
        }

        return sb.ToString();
    }
}
