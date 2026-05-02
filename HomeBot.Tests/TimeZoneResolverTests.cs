using Xunit;

namespace HomeBot.Tests;

public class TimeZoneResolverTests
{
    [Fact]
    public void TryFind_UTC_succeeds()
    {
        Assert.True(TimeZoneResolver.TryFind("UTC", out var tz));
        Assert.Equal(TimeZoneInfo.Utc.Id, tz.Id);
    }

    [Fact]
    public void TryFind_empty_fails()
    {
        Assert.False(TimeZoneResolver.TryFind(null, out _));
        Assert.False(TimeZoneResolver.TryFind("   ", out _));
    }

    [Fact]
    public void Resolve_missing_uses_default()
    {
        var tz = TimeZoneResolver.Resolve(null);
        Assert.True(TimeZoneResolver.TryFind(TimeZoneResolver.DefaultHouseholdTimeZoneId, out var expected));
        Assert.Equal(expected.Id, tz.Id);
    }

    [Fact]
    public void TryFind_common_IANA_succeeds()
    {
        Assert.True(TimeZoneResolver.TryFind("America/New_York", out var tz));
        // Windows may canonicalize to a different Id while still representing the same zone.
        Assert.NotEqual(TimeZoneInfo.Utc.Id, tz.Id);
    }

    [Fact]
    public void ToStorageId_stays_resolvable()
    {
        Assert.True(TimeZoneResolver.TryFind("America/Los_Angeles", out var tz));
        var stored = TimeZoneResolver.ToStorageId(tz);
        Assert.False(string.IsNullOrEmpty(stored));
        Assert.True(TimeZoneResolver.TryFind(stored, out _), $"stored id should resolve: {stored}");
    }

    [Fact]
    public void TryFind_Pacific_Standard_Time_resolves_when_supported()
    {
        if (!TimeZoneResolver.TryFind("Pacific Standard Time", out var tz))
            return;

        Assert.True(TimeZoneResolver.TryFind(TimeZoneResolver.ToStorageId(tz), out _));
    }
}
