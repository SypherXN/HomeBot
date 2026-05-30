#!/usr/bin/env bash
# Upload local SQLite backups to Google Drive (via rclone) and prune old files locally and remotely.
#
# Prerequisites:
#   sudo apt install -y rclone
#   rclone config   # create a remote, e.g. name "gdrive" → Google Drive
#
# Enable in /opt/homebot/app/.env (see .env.example), then run manually or from systemd.
#
# Usage:
#   sudo bash scripts/sync-homebot-backups-to-gdrive.sh
#
# Environment (also loaded via systemd EnvironmentFile=):
#   HOMEBOT_GDRIVE_BACKUP_ENABLED=true
#   HOMEBOT_GDRIVE_RCLONE_REMOTE=gdrive
#   HOMEBOT_GDRIVE_BACKUP_PATH=HomeBot/backups
#   HOMEBOT_GDRIVE_RETENTION_DAYS=90
#   HOMEBOT_LOCAL_BACKUP_RETENTION_DAYS=30
#   HOMEBOT_BACKUP_DIR=/opt/homebot/backups
#   HOMEBOT_GDRIVE_BACKUP_DRY_RUN=true   # optional: print actions only
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup/backup-env.sh
source "${SCRIPT_DIR}/backup/backup-env.sh"

if ! is_truthy "${HOMEBOT_GDRIVE_BACKUP_ENABLED:-}"; then
  echo "Google Drive backup disabled (set HOMEBOT_GDRIVE_BACKUP_ENABLED=true to enable)."
  exit 0
fi

LOCAL_DIR="${HOMEBOT_BACKUP_DIR:-/opt/homebot/backups}"
REMOTE_NAME="${HOMEBOT_GDRIVE_RCLONE_REMOTE:-}"
REMOTE_PATH="${HOMEBOT_GDRIVE_BACKUP_PATH:-HomeBot/backups}"
RETENTION_DAYS="$(positive_int_or_default "${HOMEBOT_GDRIVE_RETENTION_DAYS:-}" 90)"
LOCAL_RETENTION_DAYS="$(positive_int_or_default "${HOMEBOT_LOCAL_BACKUP_RETENTION_DAYS:-}" 30)"

if [[ -z "${REMOTE_NAME}" ]]; then
  echo "HOMEBOT_GDRIVE_RCLONE_REMOTE is required (rclone remote name from 'rclone config')." >&2
  exit 1
fi

REMOTE_PATH="${REMOTE_PATH#/}"
REMOTE_PATH="${REMOTE_PATH%/}"
REMOTE_FULL="${REMOTE_NAME}:${REMOTE_PATH}"

if ! command -v rclone >/dev/null 2>&1; then
  echo "rclone not found. Install it (e.g. sudo apt install -y rclone)." >&2
  exit 1
fi

if ! rclone listremotes 2>/dev/null | grep -Fxq "${REMOTE_NAME}:"; then
  echo "rclone remote '${REMOTE_NAME}:' is not configured. Run: rclone config" >&2
  exit 1
fi

if [[ ! -d "${LOCAL_DIR}" ]]; then
  echo "Local backup directory does not exist: ${LOCAL_DIR}" >&2
  exit 1
fi

encrypt_local_backups() {
  if ! is_truthy "${HOMEBOT_GDRIVE_BACKUP_ENCRYPT:-}"; then
    return 0
  fi
  if ! command -v gpg >/dev/null 2>&1; then
    echo "gpg not found. Install gnupg or unset HOMEBOT_GDRIVE_BACKUP_ENCRYPT." >&2
    exit 1
  fi
  local pass_file="${HOMEBOT_GDRIVE_BACKUP_ENCRYPT_PASSPHRASE_FILE:-}"
  if [[ -z "${pass_file}" || ! -f "${pass_file}" ]]; then
    echo "Set HOMEBOT_GDRIVE_BACKUP_ENCRYPT_PASSPHRASE_FILE to a readable passphrase file." >&2
    exit 1
  fi
  shopt -s nullglob
  for f in "${LOCAL_DIR}"/homebot.db.*; do
    [[ -f "${f}" ]] || continue
    [[ "${f}" == *.gpg ]] && continue
    local out="${f}.gpg"
    if [[ -f "${out}" && "${out}" -nt "${f}" ]]; then
      continue
    fi
    if is_truthy "${HOMEBOT_GDRIVE_BACKUP_DRY_RUN:-}"; then
      echo "DRY RUN — would encrypt ${f} → ${out}"
      continue
    fi
    echo "==> Encrypting ${f}"
    gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase-file "${pass_file}" -o "${out}" "${f}"
  done
  shopt -u nullglob
}

encrypt_local_backups

RCLONE_INCLUDE=(--include "homebot.db.*")
if is_truthy "${HOMEBOT_GDRIVE_BACKUP_ENCRYPT:-}"; then
  RCLONE_INCLUDE=(--include "homebot.db.*.gpg")
fi

RCLONE_EXTRA=()
if is_truthy "${HOMEBOT_GDRIVE_BACKUP_DRY_RUN:-}"; then
  echo "DRY RUN — no files will be changed."
  RCLONE_EXTRA+=(--dry-run)
fi

echo "==> Uploading ${LOCAL_DIR}/homebot.db.* → ${REMOTE_FULL}"
rclone copy "${LOCAL_DIR}" "${REMOTE_FULL}" \
  "${RCLONE_INCLUDE[@]}" \
  --update \
  "${RCLONE_EXTRA[@]}"

if [[ "${RETENTION_DAYS}" -gt 0 ]]; then
  echo "==> Pruning remote files older than ${RETENTION_DAYS} day(s) under ${REMOTE_FULL}"
  REMOTE_PRUNE_PATTERN="homebot.db.*"
  if is_truthy "${HOMEBOT_GDRIVE_BACKUP_ENCRYPT:-}"; then
    REMOTE_PRUNE_PATTERN="homebot.db.*.gpg"
  fi
  rclone delete "${REMOTE_FULL}" \
    --include "${REMOTE_PRUNE_PATTERN}" \
    --min-age "${RETENTION_DAYS}d" \
    "${RCLONE_EXTRA[@]}"
  rclone rmdirs "${REMOTE_FULL}" --leave-root "${RCLONE_EXTRA[@]}" 2>/dev/null || true
else
  echo "==> Remote retention disabled (HOMEBOT_GDRIVE_RETENTION_DAYS=0); skipping remote prune."
fi

if [[ "${LOCAL_RETENTION_DAYS}" -gt 0 ]]; then
  echo "==> Pruning local files older than ${LOCAL_RETENTION_DAYS} day(s) in ${LOCAL_DIR}"
  if is_truthy "${HOMEBOT_GDRIVE_BACKUP_DRY_RUN:-}"; then
    find "${LOCAL_DIR}" -maxdepth 1 -type f -name 'homebot.db.*' -mtime "+${LOCAL_RETENTION_DAYS}" -print
  else
    find "${LOCAL_DIR}" -maxdepth 1 -type f -name 'homebot.db.*' -mtime "+${LOCAL_RETENTION_DAYS}" -print -delete
  fi
else
  echo "==> Local retention disabled (HOMEBOT_LOCAL_BACKUP_RETENTION_DAYS=0); skipping local prune."
fi

echo "Google Drive backup sync finished."
