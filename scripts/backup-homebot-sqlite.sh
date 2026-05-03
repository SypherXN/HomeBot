#!/usr/bin/env bash
# Weekly-style backup: stops HomeBot, copies SQLite files with a timestamp, restarts.
# Usage: sudo ./backup-homebot-sqlite.sh [APP_DIR] [BACKUP_DIR] [SERVICE_NAME]
# Defaults: APP_DIR=/opt/homebot/app  BACKUP_DIR=/opt/homebot/backups  SERVICE_NAME=homebot.service
set -euo pipefail

APP_DIR="${1:-/opt/homebot/app}"
BK_DIR="${2:-/opt/homebot/backups}"
SERVICE="${3:-homebot.service}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo) so systemctl stop/start works." >&2
  exit 1
fi

mkdir -p "$BK_DIR"
if id homebot &>/dev/null; then
  chown homebot:homebot "$BK_DIR" 2>/dev/null || true
fi

systemctl stop "$SERVICE"

stamp="$(date +%F-%H%M)"
db="homebot.db"
if id homebot &>/dev/null; then
  _cp() { sudo -u homebot cp -a "$@"; }
else
  _cp() { cp -a "$@"; }
fi

src="$APP_DIR/$db"
if [[ -f "$src" ]]; then
  _cp "$src" "$BK_DIR/${db}.${stamp}"
fi
for ext in wal shm; do
  f="$APP_DIR/${db}-${ext}"
  if [[ -f "$f" ]]; then
    _cp "$f" "$BK_DIR/${db}.${stamp}-${ext}"
  fi
done

systemctl start "$SERVICE"
echo "Backup finished under $BK_DIR (timestamp $stamp)."
