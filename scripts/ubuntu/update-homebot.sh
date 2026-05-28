#!/usr/bin/env bash
# Pull latest code, republish, and restart HomeBot (Ubuntu + systemd).
# Run as root: sudo bash scripts/ubuntu/update-homebot.sh
set -euo pipefail

APP_DIR="${HOMEBOT_INSTALL_DIR:-/opt/homebot/app}"
SERVICE_NAME="${HOMEBOT_SERVICE_NAME:-homebot.service}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "No git repo at ${APP_DIR}" >&2
  exit 1
fi

echo "==> git pull"
sudo -u homebot bash -c "cd '${APP_DIR}' && git pull"

echo "==> dotnet publish"
sudo -u homebot bash -c "cd '${APP_DIR}' && dotnet publish -c Release -o '${APP_DIR}/publish'"

echo "==> restart ${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"
systemctl --no-pager status "${SERVICE_NAME}" || true

echo "Done. curl -sS http://127.0.0.1:5050/api/health"
