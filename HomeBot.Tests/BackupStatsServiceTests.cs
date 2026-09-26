using Xunit;

namespace HomeBot.Tests;

public sealed class BackupStatsServiceTests
{
    [Theory]
    [InlineData("homebot.db.2026-09-20-0331", true)]
    [InlineData("homebot.db.2026-09-20-0331.gpg", true)]
    [InlineData("homebot-2026-05-03.db", true)]
    [InlineData("homebot-pre-categories-2026-09-14-040517.db", true)]
    [InlineData("homebot-pre-categories-2026-09-14-040517.db.gpg", true)]
    [InlineData("homebot.db.2026-09-20-0331-wal", false)]
    [InlineData("homebot.db.2026-09-20-0331-shm", false)]
    [InlineData("homebot.db", false)]
    [InlineData("random.db", false)]
    [InlineData(null, false)]
    [InlineData("", false)]
    public void IsLocalBackupFileName_matches_script_and_manual_copies(string? name, bool expected)
    {
        Assert.Equal(expected, BackupStatsService.IsLocalBackupFileName(name));
    }

    [Fact]
    public void Recency_uses_backup_stamp_instead_of_preserved_database_mtime()
    {
        var dbMtime = new DateTime(2026, 9, 19, 1, 52, 30, DateTimeKind.Utc);
        Assert.Equal(
            new DateTime(2026, 9, 20, 3, 31, 0, DateTimeKind.Utc),
            BackupStatsService.RecencyUtc("homebot.db.2026-09-20-0331", dbMtime));
    }

    [Theory]
    [InlineData("homebot.db.2026-09-20-0331.gpg", 2026, 9, 20, 3, 31, 0)]
    [InlineData("homebot-pre-categories-2026-09-14-040517.db", 2026, 9, 14, 4, 5, 17)]
    [InlineData("homebot-2026-05-03.db", 2026, 5, 3, 0, 0, 0)]
    public void TryParseBackupStampUtc_reads_timestamped_backup_names(
        string name, int year, int month, int day, int hour, int minute, int second)
    {
        Assert.Equal(
            new DateTime(year, month, day, hour, minute, second, DateTimeKind.Utc),
            BackupStatsService.TryParseBackupStampUtc(name));
    }

    [Fact]
    public void Recency_falls_back_to_mtime_without_valid_filename_stamp()
    {
        var mtime = new DateTime(2026, 9, 1, 12, 0, 0, DateTimeKind.Utc);
        Assert.Equal(mtime, BackupStatsService.RecencyUtc("homebot-manual.db", mtime));
        Assert.Null(BackupStatsService.TryParseBackupStampUtc("homebot.db.2026-13-40-0331"));
    }
}
