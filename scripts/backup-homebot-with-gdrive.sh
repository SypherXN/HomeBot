#!/usr/bin/env bash
# Local SQLite backup (stop → copy → start) then optional Google Drive upload + retention.
# Usage: sudo bash scripts/backup-homebot-with-gdrive.sh [APP_DIR] [BACKUP_DIR] [SERVICE_NAME]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APP_DIR="${1:-/opt/homebot/app}"
BK_DIR="${2:-${HOMEBOT_BACKUP_DIR:-/opt/homebot/backups}}"
SERVICE="${3:-homebot.service}"

export HOMEBOT_BACKUP_DIR="${BK_DIR}"

"${SCRIPT_DIR}/backup-homebot-sqlite.sh" "${APP_DIR}" "${BK_DIR}" "${SERVICE}"
"${SCRIPT_DIR}/sync-homebot-backups-to-gdrive.sh"
