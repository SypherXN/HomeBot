# Loads repo-root .env into this process (KEY=value lines only), then runs `dotnet run`.
# Use from Task Scheduler or a shortcut: pwsh -File "C:\path\to\HomeBot\scripts\run-homebot.ps1"
# Do not use values that contain "=" before the first "=" on the line; use README for complex cases.
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot
$envFile = Join-Path $repoRoot ".env"
if (-not (Test-Path $envFile)) {
    throw ".env not found at $envFile — copy .env.example to .env and fill it in (see docs/SETUP.md)."
}

Get-Content $envFile | ForEach-Object {
    $line = $_.TrimEnd()
    if ($line.Length -eq 0) { return }
    if ($line.TrimStart().StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if ($name.Length -eq 0) { return }
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

dotnet run
