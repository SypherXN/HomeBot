#!/usr/bin/env bash
# Restore HomeBot SQLite from a local backup file (dry-run by default).
# Usage:
#   sudo bash scripts/restore-homebot-backup.sh /path/to/homebot-YYYYMMDD.db [--apply]
# Env: APP_DIR, BACKUP_FILE, SERVICE_NAME (same as backup-homebot-sqlite.sh)

set -euo pipefail

BACKUP_FILE="${1:-}"
APPLY="${2:-}"
APP_DIR="${HOMEBOT_APP_DIR:-/opt/homebot/app}"
SERVICE="${HOMEBOT_SERVICE_NAME:-homebot.service}"
LIVE_DB="${HOMEBOT_DATABASE_PATH:-${APP_DIR}/homebot.db}"

if [[ -z "${BACKUP_FILE}" || ! -f "${BACKUP_FILE}" ]]; then
  echo "Usage: sudo bash $0 /path/to/backup.db [--apply]" >&2
  exit 1
fi

echo "Restore plan:"
echo "  Backup file: ${BACKUP_FILE}"
echo "  Live DB:     ${LIVE_DB}"
echo "  Service:     ${SERVICE}"

if [[ "${APPLY}" != "--apply" ]]; then
  echo ""
  echo "Dry run only. Re-run with --apply to stop service, replace DB, and restart."
  exit 0
fi

echo "Stopping ${SERVICE}..."
systemctl stop "${SERVICE}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -f "${LIVE_DB}" ]]; then
  cp -a "${LIVE_DB}" "${LIVE_DB}.pre-restore.${TS}"
  echo "Saved pre-restore copy: ${LIVE_DB}.pre-restore.${TS}"
fi

cp -a "${BACKUP_FILE}" "${LIVE_DB}"
for ext in -wal -shm; do
  if [[ -f "${BACKUP_FILE}${ext}" ]]; then
    cp -a "${BACKUP_FILE}${ext}" "${LIVE_DB}${ext}"
  else
    rm -f "${LIVE_DB}${ext}"
  fi
done

echo "Starting ${SERVICE}..."
systemctl start "${SERVICE}"
echo "Restore complete."
