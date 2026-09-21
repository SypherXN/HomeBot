using System.Globalization;

/// <summary>
/// Reads local SQLite backup directory stats for ops visibility (no rclone on every poll).
/// </summary>
public sealed class BackupStatsService
{
    public object GetLocalBackupStats()
    {
        var dir = Environment.GetEnvironmentVariable("HOMEBOT_BACKUP_DIR")?.Trim();
        if (string.IsNullOrEmpty(dir))
            dir = "/opt/homebot/backups";

        var gdriveEnabled = string.Equals(
            Environment.GetEnvironmentVariable("HOMEBOT_GDRIVE_BACKUP_ENABLED")?.Trim(),
            "true",
            StringComparison.OrdinalIgnoreCase);

        if (!Directory.Exists(dir))
        {
            return new
            {
                backupDir = dir,
                exists = false,
                fileCount = 0,
                latestFile = (string?)null,
                latestModifiedUtc = (string?)null,
                totalBytes = 0L,
                gdriveEnabled,
                encryptBeforeUpload = string.Equals(
                    Environment.GetEnvironmentVariable("HOMEBOT_GDRIVE_BACKUP_ENCRYPT")?.Trim(),
                    "true",
                    StringComparison.OrdinalIgnoreCase),
            };
        }

        var files = Directory.EnumerateFiles(dir)
            .Where(f => IsLocalBackupFileName(Path.GetFileName(f)))
            .Select(f => new FileInfo(f))
            .OrderByDescending(f => f.LastWriteTimeUtc)
            .ToList();

        long totalBytes = files.Sum(f => f.Length);
        var latest = files.FirstOrDefault();

        return new
        {
            backupDir = dir,
            exists = true,
            fileCount = files.Count,
            latestFile = latest?.Name,
            latestModifiedUtc = latest?.LastWriteTimeUtc.ToString("o", CultureInfo.InvariantCulture),
            totalBytes,
            gdriveEnabled,
            encryptBeforeUpload = string.Equals(
                Environment.GetEnvironmentVariable("HOMEBOT_GDRIVE_BACKUP_ENCRYPT")?.Trim(),
                "true",
                StringComparison.OrdinalIgnoreCase),
        };
    }

    /// <summary>
    /// Timestamped copies from backup-homebot-sqlite.sh (<c>homebot.db.2026-09-20-0331</c>)
    /// plus manual names like <c>homebot-2026-05-03.db</c>. WAL/SHM sidecars are ignored.
    /// </summary>
    public static bool IsLocalBackupFileName(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return false;

        var name = fileName.Trim();
        if (name.EndsWith("-wal", StringComparison.OrdinalIgnoreCase) ||
            name.EndsWith("-shm", StringComparison.OrdinalIgnoreCase))
            return false;

        if (name.StartsWith("homebot.db.", StringComparison.OrdinalIgnoreCase))
            return true;

        return name.StartsWith("homebot-", StringComparison.OrdinalIgnoreCase) &&
               (name.EndsWith(".db", StringComparison.OrdinalIgnoreCase) ||
                name.EndsWith(".db.gpg", StringComparison.OrdinalIgnoreCase));
    }
}
