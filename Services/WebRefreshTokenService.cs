using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Data.Sqlite;

/// <summary>
/// Opaque browser refresh tokens (hashed at rest) for rotating web sessions alongside short-lived JWTs.
/// </summary>
public sealed class WebRefreshTokenService
{
    private readonly DatabaseService _db;

    public WebRefreshTokenService(DatabaseService db) => _db = db;

    /// <summary>Default 30 days; override with <c>HOMEBOT_WEB_REFRESH_TTL_SECONDS</c> (3600–31536000).</summary>
    public static int RefreshTokenLifetimeSeconds
    {
        get
        {
            var raw = Environment.GetEnvironmentVariable("HOMEBOT_WEB_REFRESH_TTL_SECONDS");
            if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) &&
                n >= 3600 &&
                n <= 86400 * 365)
            {
                return n;
            }

            return 60 * 60 * 24 * 30;
        }
    }

    public static string HashToken(string plain) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(plain)));

    /// <summary>Inserts a new refresh row and returns the plaintext token (show once to the client).</summary>
    public (string PlainToken, DateTimeOffset ExpiresAt) IssueForUser(string username, string discordUserId)
    {
        var buf = new byte[32];
        RandomNumberGenerator.Fill(buf);
        var plain = WebEncoders.Base64UrlEncode(buf);
        var hash = HashToken(plain);
        var exp = DateTimeOffset.UtcNow.AddSeconds(RefreshTokenLifetimeSeconds);
        var expStr = exp.ToString("o", CultureInfo.InvariantCulture);
        var created = DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture);

        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO WebRefreshTokens (TokenHash, Username, DiscordUserId, ExpiresAt, CreatedAt)
            VALUES ($h, $u, $d, $e, $c)";
        cmd.Parameters.AddWithValue("$h", hash);
        cmd.Parameters.AddWithValue("$u", username.Trim());
        cmd.Parameters.AddWithValue("$d", discordUserId.Trim());
        cmd.Parameters.AddWithValue("$e", expStr);
        cmd.Parameters.AddWithValue("$c", created);
        cmd.ExecuteNonQuery();

        return (plain, exp);
    }

    /// <summary>
    /// When <paramref name="plain"/> matches a non-expired row, returns identity fields without deleting it.
    /// </summary>
    public bool TryPeekValid(string plain, out string username, out string discordUserId)
    {
        username = "";
        discordUserId = "";
        if (string.IsNullOrWhiteSpace(plain))
            return false;

        var hash = HashToken(plain.Trim());

        using var conn = _db.GetConnection();
        conn.Open();

        using var sel = conn.CreateCommand();
        sel.CommandText = @"
            SELECT Username, DiscordUserId, ExpiresAt FROM WebRefreshTokens WHERE TokenHash = $h";
        sel.Parameters.AddWithValue("$h", hash);
        using var r = sel.ExecuteReader();
        if (!r.Read())
            return false;

        username = r.GetString(0).Trim();
        discordUserId = r.GetString(1).Trim();
        var expRaw = r.GetString(2);
        if (!DateTimeOffset.TryParse(
                expRaw,
                CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind,
                out var exp) ||
            DateTimeOffset.UtcNow > exp)
        {
            r.Close();
            DeleteByHash(conn, hash);
            return false;
        }

        return username.Length > 0 && discordUserId.Length > 0;
    }

    /// <summary>Deletes the refresh row for this plaintext token, if any (after issuing a new session).</summary>
    public void DeleteByPlain(string plain)
    {
        if (string.IsNullOrWhiteSpace(plain))
            return;
        var hash = HashToken(plain.Trim());
        using var conn = _db.GetConnection();
        conn.Open();
        DeleteByHash(conn, hash);
    }

    /// <summary>Revokes a session without replacing it (logout).</summary>
    public void RevokePlain(string plain) => DeleteByPlain(plain);

    private static void DeleteByHash(SqliteConnection conn, string hash)
    {
        using var del = conn.CreateCommand();
        del.CommandText = "DELETE FROM WebRefreshTokens WHERE TokenHash = $h";
        del.Parameters.AddWithValue("$h", hash);
        del.ExecuteNonQuery();
    }
}
