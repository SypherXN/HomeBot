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
}
