using System.Globalization;

/// <summary>
/// Resolves IANA or Windows time zone ids for <see cref="TimeZoneInfo"/> lookups.
/// </summary>
public static class TimeZoneResolver
{
    /// <summary>Used when no household timezone is configured or the stored value is invalid.</summary>
    public const string DefaultHouseholdTimeZoneId = "UTC";

    /// <summary>
    /// Tries <paramref name="id"/>; on failure falls back to <paramref name="fallbackId"/>; then <see cref="DefaultHouseholdTimeZoneId"/>.
    /// </summary>
    public static TimeZoneInfo Resolve(string? id, string? fallbackId = null)
    {
        if (TryFind(id, out var tz))
            return tz;
        if (!string.IsNullOrWhiteSpace(fallbackId) && TryFind(fallbackId, out tz))
            return tz;
        if (TryFind(DefaultHouseholdTimeZoneId, out tz))
            return tz;
        return TimeZoneInfo.Utc;
    }

    /// <summary>
    /// Returns <c>true</c> when <paramref name="id"/> is non-empty and maps to a system zone
    /// (direct id, or via Windows ↔ IANA conversion on .NET 6+).
    /// </summary>
    public static bool TryFind(string? id, out TimeZoneInfo tz)
    {
        tz = TimeZoneInfo.Utc;
        if (string.IsNullOrWhiteSpace(id))
            return false;

        var s = id.Trim();
        if (TryFindDirect(s, out tz))
            return true;

        if (TimeZoneInfo.TryConvertWindowsIdToIanaId(s, out var iana) &&
            !string.IsNullOrEmpty(iana) &&
            TryFindDirect(iana, out tz))
            return true;

        if (TimeZoneInfo.TryConvertIanaIdToWindowsId(s, out var windows) &&
            !string.IsNullOrEmpty(windows) &&
            TryFindDirect(windows, out tz))
            return true;

        return false;
    }

    /// <summary>
    /// Prefers an IANA id for <see cref="ConfigService"/> storage so the same database works on Linux and Windows.
    /// </summary>
    public static string ToStorageId(TimeZoneInfo tz)
    {
        if (TimeZoneInfo.TryConvertWindowsIdToIanaId(tz.Id, out var iana) && !string.IsNullOrEmpty(iana))
            return iana;
        return tz.Id;
    }

    private static bool TryFindDirect(string zoneId, out TimeZoneInfo tz)
    {
        tz = TimeZoneInfo.Utc;
        try
        {
            tz = TimeZoneInfo.FindSystemTimeZoneById(zoneId);
            return true;
        }
        catch (TimeZoneNotFoundException)
        {
            return false;
        }
        catch (InvalidTimeZoneException)
        {
            return false;
        }
    }

    /// <summary>
    /// Midnight on the given calendar date in <paramref name="tz"/>, expressed as UTC.
    /// </summary>
    public static DateTime LocalDateToUtc(DateTime dateOnly, TimeZoneInfo tz)
    {
        var wall = new DateTime(dateOnly.Year, dateOnly.Month, dateOnly.Day, 0, 0, 0, DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(wall, tz);
    }

    /// <summary>
    /// Parses <c>yyyy-MM-ddTHH:mm</c> as a wall time in <paramref name="tz"/> and returns UTC storage string
    /// <c>yyyy-MM-dd HH:mm</c> (no suffix; treated as UTC when read back).
    /// </summary>
    public static bool TryParseWallDateTimeToUtcStorage(string input, TimeZoneInfo tz, out string utcStorage, out string? error)
    {
        utcStorage = "";
        error = null;
        if (string.IsNullOrWhiteSpace(input))
            return false;
        var t = input.Trim();
        if (DateTime.TryParseExact(
                t,
                new[] { "yyyy-MM-ddTHH:mm", "yyyy-MM-ddTHH:mm:ss" },
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var wall))
        {
            try
            {
                var utc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(wall, DateTimeKind.Unspecified), tz);
                utcStorage = utc.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        return false;
    }
}
