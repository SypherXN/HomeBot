using System.Net;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using WebPush;

/// <summary>Browser Web Push (PWA) for calendar/budget notifications.</summary>
public sealed class WebPushService
{
    private readonly DatabaseService _db;

    public WebPushService(DatabaseService db)
    {
        _db = db;
    }

    public static string? ReadPublicKey() =>
        Environment.GetEnvironmentVariable("HOMEBOT_VAPID_PUBLIC_KEY")?.Trim();

    public static string? ReadPrivateKey() =>
        Environment.GetEnvironmentVariable("HOMEBOT_VAPID_PRIVATE_KEY")?.Trim();

    public static string ReadSubject()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_VAPID_SUBJECT")?.Trim();
        return string.IsNullOrEmpty(raw) ? "mailto:homebot@localhost" : raw;
    }

    public bool IsConfigured() =>
        !string.IsNullOrEmpty(ReadPublicKey()) && !string.IsNullOrEmpty(ReadPrivateKey());

    public object GetPublicConfig() =>
        new { configured = IsConfigured(), publicKey = ReadPublicKey() };

    public void SaveSubscription(ulong discordUserId, PushSubscriptionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Endpoint))
            throw new ArgumentException("endpoint required.");
        if (request.Keys is null || string.IsNullOrWhiteSpace(request.Keys.P256dh) || string.IsNullOrWhiteSpace(request.Keys.Auth))
            throw new ArgumentException("keys.p256dh and keys.auth required.");

        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO PushSubscriptions (DiscordUserId, Endpoint, P256dh, Auth)
            VALUES ($d, $e, $p, $a)
            ON CONFLICT(Endpoint) DO UPDATE SET
                DiscordUserId = $d, P256dh = $p, Auth = $a";
        cmd.Parameters.AddWithValue("$d", discordUserId.ToString());
        cmd.Parameters.AddWithValue("$e", request.Endpoint.Trim());
        cmd.Parameters.AddWithValue("$p", request.Keys.P256dh.Trim());
        cmd.Parameters.AddWithValue("$a", request.Keys.Auth.Trim());
        cmd.ExecuteNonQuery();
    }

    public void RemoveSubscription(ulong discordUserId, string endpoint)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM PushSubscriptions WHERE DiscordUserId = $d AND Endpoint = $e";
        cmd.Parameters.AddWithValue("$d", discordUserId.ToString());
        cmd.Parameters.AddWithValue("$e", endpoint.Trim());
        cmd.ExecuteNonQuery();
    }

    public async Task TryNotifyUserAsync(ulong discordUserId, string title, string body, string? url = null)
    {
        if (!IsConfigured())
            return;

        var payload = JsonSerializer.Serialize(new { title, body, url = url ?? "/" });
        var vapid = new VapidDetails(ReadSubject(), ReadPublicKey()!, ReadPrivateKey()!);
        var client = new WebPushClient();

        foreach (var row in ListSubscriptions(discordUserId))
        {
            try
            {
                var sub = new PushSubscription(row.Endpoint, row.P256dh, row.Auth);
                await client.SendNotificationAsync(sub, payload, vapid);
            }
            catch (WebPushException ex) when (ex.StatusCode is HttpStatusCode.Gone or HttpStatusCode.NotFound)
            {
                DeleteByEndpoint(row.Endpoint);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[HomeBot Push] Send failed: {ex.Message}");
            }
        }
    }

    private List<PushSubscriptionRow> ListSubscriptions(ulong discordUserId)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Endpoint, P256dh, Auth FROM PushSubscriptions WHERE DiscordUserId = $d";
        cmd.Parameters.AddWithValue("$d", discordUserId.ToString());
        using var r = cmd.ExecuteReader();
        var list = new List<PushSubscriptionRow>();
        while (r.Read())
        {
            list.Add(new PushSubscriptionRow
            {
                Endpoint = r.GetString(0),
                P256dh = r.GetString(1),
                Auth = r.GetString(2),
            });
        }

        return list;
    }

    private void DeleteByEndpoint(string endpoint)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM PushSubscriptions WHERE Endpoint = $e";
        cmd.Parameters.AddWithValue("$e", endpoint);
        cmd.ExecuteNonQuery();
    }

    private sealed class PushSubscriptionRow
    {
        public string Endpoint { get; set; } = "";
        public string P256dh { get; set; } = "";
        public string Auth { get; set; } = "";
    }
}

public sealed class PushSubscriptionRequest
{
    public string Endpoint { get; set; } = "";
    public PushSubscriptionKeys? Keys { get; set; }
}

public sealed class PushSubscriptionKeys
{
    public string P256dh { get; set; } = "";
    public string Auth { get; set; } = "";
}
