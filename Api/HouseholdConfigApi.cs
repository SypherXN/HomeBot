using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

/// <summary>HTTP API for household settings and Discord channel bindings (mirrors /config-* and /setup-set).</summary>
public static class HouseholdConfigApi
{
    private static readonly HashSet<string> AllowedFeatures = new(StringComparer.OrdinalIgnoreCase)
    {
        "buy", "wishlist", "money", "budget", "calendar", "audit"
    };

    public static void MapHouseholdConfigRoutes(WebApplication app, IServiceProvider root)
    {
        app.MapGet("/api/household/settings", () =>
        {
            var config = root.GetRequiredService<ConfigService>().GetAll();
            return Results.Ok(new { settings = config });
        });

        app.MapGet("/api/household/channel-bindings", () =>
        {
            var bindings = root.GetRequiredService<ChannelBindingService>().GetAll();
            var asStrings = bindings.ToDictionary(kv => kv.Key, kv => kv.Value.ToString());
            return Results.Ok(new { bindings = asStrings });
        });

        var w = app.MapGroup("/api/household").RequireRateLimiting("mutation");

        w.MapPut("/settings", (HouseholdSettingPutRequest? body) =>
        {
            if (body is null || string.IsNullOrWhiteSpace(body.Key))
                return ApiResults.BadRequest("key is required.", "missing_key");

            var key = body.Key.Trim().ToLowerInvariant();
            var value = body.Value?.Trim() ?? "";

            if (key == "page_size")
            {
                if (!int.TryParse(value, out var pageSize) || pageSize < 1 || pageSize > 100)
                    return ApiResults.Validation("page_size must be an integer from 1 to 100.");
            }
            else if (key == "timezone")
            {
                if (!TimeZoneResolver.TryFind(value, out var tz))
                    return ApiResults.Validation($"Unknown timezone '{value}'.");
                value = TimeZoneResolver.ToStorageId(tz);
            }
            else
            {
                return ApiResults.Validation("Supported keys: page_size, timezone.");
            }

            root.GetRequiredService<ConfigService>().Set(key, value);
            return Results.Ok(new { ok = true, key, value });
        });

        w.MapPut("/channel-bindings", (HouseholdChannelBindingPutRequest? body) =>
        {
            if (body is null || string.IsNullOrWhiteSpace(body.Feature))
                return ApiResults.BadRequest("feature is required.", "missing_feature");
            if (body.ChannelId == 0)
                return ApiResults.Validation("channelId must be a non-zero Discord channel snowflake.");

            var feature = body.Feature.Trim().ToLowerInvariant();
            if (!AllowedFeatures.Contains(feature))
                return ApiResults.Validation($"Unknown feature '{feature}'. Allowed: {string.Join(", ", AllowedFeatures.OrderBy(x => x))}.");

            root.GetRequiredService<ChannelBindingService>().SetChannel(feature, body.ChannelId);
            return Results.Ok(new { ok = true, feature, channelId = body.ChannelId.ToString() });
        });
    }
}
