# Backs up repo-root homebot.db (+ WAL/SHM) with a timestamp. Run while HomeBot is STOPPED
# so the copy is consistent (close dotnet / stop Task Scheduler job), unless you pass -Force.
# Usage: .\scripts\backup-homebot-sqlite.ps1 [-RepoRoot path] [-BackupDir path] [-Force]

param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$BackupDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "backups"),
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not $Force -and (Get-Process -Name "HomeBot" -ErrorAction SilentlyContinue)) {
    throw "Stop HomeBot.exe first, or re-run with -Force if you know the DB is idle (e.g. only dotnet run — copying while writing can corrupt backups)."
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"

foreach ($name in @("homebot.db")) {
    $src = Join-Path $RepoRoot $name
    if (Test-Path $src) {
        Copy-Item -LiteralPath $src -Destination (Join-Path $BackupDir "$name.$stamp") -Force
    }
    foreach ($ext in @("wal", "shm")) {
        $side = "$RepoRoot\$name-$ext"
        if (Test-Path $side) {
            Copy-Item -LiteralPath $side -Destination (Join-Path $BackupDir "$name.$stamp-$ext") -Force
        }
    }
}

Write-Host "Backup written to $BackupDir (suffix $stamp)."
