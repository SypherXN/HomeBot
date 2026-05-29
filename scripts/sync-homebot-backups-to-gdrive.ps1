# Upload local SQLite backups to Google Drive via rclone and prune old files.
# Requires: rclone installed and configured (https://rclone.org/install/)
# Enable HOMEBOT_GDRIVE_BACKUP_ENABLED in .env or set env vars before running.
#
# Usage:
#   $env:HOMEBOT_GDRIVE_BACKUP_ENABLED = "true"
#   $env:HOMEBOT_GDRIVE_RCLONE_REMOTE = "gdrive"
#   .\scripts\sync-homebot-backups-to-gdrive.ps1

param(
    [string]$BackupDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "backups"),
    [string]$RcloneRemote = $env:HOMEBOT_GDRIVE_RCLONE_REMOTE,
    [string]$RemotePath = $(if ($env:HOMEBOT_GDRIVE_BACKUP_PATH) { $env:HOMEBOT_GDRIVE_BACKUP_PATH } else { "HomeBot/backups" }),
    [int]$RetentionDays = $(if ($env:HOMEBOT_GDRIVE_RETENTION_DAYS) { [int]$env:HOMEBOT_GDRIVE_RETENTION_DAYS } else { 90 }),
    [int]$LocalRetentionDays = $(if ($env:HOMEBOT_LOCAL_BACKUP_RETENTION_DAYS) { [int]$env:HOMEBOT_LOCAL_BACKUP_RETENTION_DAYS } else { 30 }),
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Test-Truthy([string]$v) {
    $v -match '^(?i)(true|1|yes|on)$'
}

if (-not (Test-Truthy $env:HOMEBOT_GDRIVE_BACKUP_ENABLED)) {
    Write-Host "Google Drive backup disabled (set HOMEBOT_GDRIVE_BACKUP_ENABLED=true)."
    exit 0
}

if (-not $RcloneRemote) {
    throw "Set HOMEBOT_GDRIVE_RCLONE_REMOTE (rclone remote name from 'rclone config')."
}

$rclone = Get-Command rclone -ErrorAction SilentlyContinue
if (-not $rclone) {
    throw "rclone not found on PATH. Install from https://rclone.org/install/"
}

$RemotePath = $RemotePath.Trim().TrimStart("/").TrimEnd("/")
$RemoteFull = "${RcloneRemote}:${RemotePath}"

$dry = @()
if ($DryRun -or (Test-Truthy $env:HOMEBOT_GDRIVE_BACKUP_DRY_RUN)) {
    Write-Host "DRY RUN"
    $dry = @("--dry-run")
}

if (-not (Test-Path $BackupDir)) {
    throw "Backup directory not found: $BackupDir"
}

Write-Host "==> Uploading to $RemoteFull"
& rclone copy $BackupDir $RemoteFull --include "homebot.db.*" --update @dry
if ($LASTEXITCODE -ne 0) { throw "rclone copy failed with exit $LASTEXITCODE" }

if ($RetentionDays -gt 0) {
    Write-Host "==> Pruning remote older than $RetentionDays days"
    & rclone delete $RemoteFull --include "homebot.db.*" --min-age "${RetentionDays}d" @dry
    if ($LASTEXITCODE -ne 0) { throw "rclone delete failed with exit $LASTEXITCODE" }
    & rclone rmdirs $RemoteFull --leave-root @dry 2>$null
}

if ($LocalRetentionDays -gt 0) {
    Write-Host "==> Pruning local older than $LocalRetentionDays days"
    $cutoff = (Get-Date).AddDays(-$LocalRetentionDays)
    Get-ChildItem -Path $BackupDir -File -Filter "homebot.db.*" |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        ForEach-Object {
            if ($dry.Count -gt 0) { Write-Host "Would delete $($_.FullName)" }
            else { Remove-Item -LiteralPath $_.FullName -Force }
        }
}

Write-Host "Google Drive backup sync finished."
