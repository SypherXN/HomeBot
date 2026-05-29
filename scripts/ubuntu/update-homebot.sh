#!/usr/bin/env bash
# Pull latest code, republish, and restart HomeBot (Ubuntu + systemd).
# Run as root: sudo bash /opt/homebot/app/scripts/ubuntu/update-homebot.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

INSTALL_ROOT="${HOMEBOT_INSTALL_ROOT:-/opt/homebot}"
APP_DIR="${HOMEBOT_APP_DIR:-${HOMEBOT_INSTALL_DIR:-${INSTALL_ROOT}/app}}"
SERVICE_NAME="${HOMEBOT_SERVICE_NAME:-homebot.service}"
ENV_FILE="${APP_DIR}/.env"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "No git repo at ${APP_DIR}" >&2
  echo "Install first: sudo bash scripts/ubuntu/install-homebot.sh https://github.com/YOUR_USER/HomeBot.git" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE} — run install-homebot.sh or copy .env.example to .env" >&2
  exit 1
fi

if ! env_file_ready "${ENV_FILE}"; then
  echo "==> ${ENV_FILE} is incomplete; fix secrets before updating the running service." >&2
  print_env_reminder "${ENV_FILE}" "${SERVICE_NAME}"
  exit 1
fi

if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
  echo "==> Stopping ${SERVICE_NAME}..."
  systemctl stop "${SERVICE_NAME}"
fi

echo "==> git pull (${APP_DIR})"
sudo -u homebot bash -c "cd '${APP_DIR}' && git pull --ff-only"

echo "==> dotnet publish"
publish_homebot "${APP_DIR}"

echo "==> Starting ${SERVICE_NAME}..."
systemctl start "${SERVICE_NAME}"
sleep 1
systemctl --no-pager status "${SERVICE_NAME}" || true

echo ""
echo "Done. curl -sS http://127.0.0.1:5050/api/health"
