#!/usr/bin/env bash
# Install HomeBot on Ubuntu 22.04 or 24.04 (Discord + API + systemd).
# Run as root: sudo bash scripts/ubuntu/install-homebot.sh [git-clone-url]
set -euo pipefail

REPO_URL="${1:-${HOMEBOT_REPO_URL:-}}"
INSTALL_ROOT="${HOMEBOT_INSTALL_ROOT:-/opt/homebot}"
APP_DIR="${INSTALL_ROOT}/app"
SERVICE_NAME="${HOMEBOT_SERVICE_NAME:-homebot.service}"
SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0 [git-clone-url]" >&2
  exit 1
fi

if [[ -z "${REPO_URL}" ]]; then
  echo "Usage: sudo bash $0 https://github.com/YOUR_USER/HomeBot.git" >&2
  echo "   or: HOMEBOT_REPO_URL=... sudo bash $0" >&2
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "Unsupported OS (expected Ubuntu)." >&2
  exit 1
fi
# shellcheck source=/dev/null
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "Warning: this script is written for Ubuntu; detected ID=${ID:-unknown}" >&2
fi

UBUNTU_VER="${VERSION_ID:-}"
case "${UBUNTU_VER}" in
  22.04|24.04) ;;
  *)
    echo "Unsupported Ubuntu VERSION_ID=${UBUNTU_VER} (supported: 22.04, 24.04)." >&2
    exit 1
    ;;
esac

echo "==> Installing packages (git, curl)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates wget

if ! command -v dotnet >/dev/null 2>&1; then
  echo "==> Installing .NET 10 SDK..."
  wget -q "https://packages.microsoft.com/config/ubuntu/${UBUNTU_VER}/packages-microsoft-prod.deb" \
    -O /tmp/packages-microsoft-prod.deb
  dpkg -i /tmp/packages-microsoft-prod.deb
  apt-get update -qq
  apt-get install -y -qq dotnet-sdk-10.0
fi
dotnet --version

if ! id homebot &>/dev/null; then
  echo "==> Creating user homebot..."
  adduser --disabled-password --gecos "" homebot
fi

mkdir -p "${INSTALL_ROOT}"
chown homebot:homebot "${INSTALL_ROOT}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "==> Cloning ${REPO_URL} -> ${APP_DIR}"
  sudo -u homebot git clone "${REPO_URL}" "${APP_DIR}"
else
  echo "==> Repo already exists at ${APP_DIR} (skipping clone)"
fi

if [[ ! -f "${APP_DIR}/.env" ]]; then
  echo "==> Creating ${APP_DIR}/.env from .env.example"
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  chown homebot:homebot "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
else
  echo "==> Keeping existing ${APP_DIR}/.env"
fi

echo "==> Publishing release build..."
sudo -u homebot bash -c "cd '${APP_DIR}' && dotnet publish -c Release -o '${APP_DIR}/publish'"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_SRC="${SCRIPT_DIR}/../systemd/homebot.service.example"

echo "==> Installing systemd unit ${SYSTEMD_UNIT}"
if [[ -f "${UNIT_SRC}" ]]; then
  cp "${UNIT_SRC}" "${SYSTEMD_UNIT}"
else
  cat >"${SYSTEMD_UNIT}" <<EOF
[Unit]
Description=HomeBot Discord + API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=homebot
Group=homebot
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/dotnet ${APP_DIR}/publish/HomeBot.dll
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
fi

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

if grep -q '^DISCORD_TOKEN=$' "${APP_DIR}/.env" 2>/dev/null || \
   grep -q '^HOMEBOT_API_TOKEN=$' "${APP_DIR}/.env" 2>/dev/null; then
  echo ""
  echo "==> IMPORTANT: Edit secrets before the service will work:"
  echo "    sudo -u homebot nano ${APP_DIR}/.env"
  echo "    Required minimum: DISCORD_TOKEN, DISCORD_GUILD_ID, HOMEBOT_API_ENABLED=true,"
  echo "    HOMEBOT_API_TOKEN, HOMEBOT_WEB_JWT_SECRET (32+ chars)."
  echo "    Then: sudo systemctl restart ${SERVICE_NAME}"
  echo ""
  echo "    Skipping 'systemctl start' until .env is filled."
  exit 0
fi

systemctl restart "${SERVICE_NAME}" || systemctl start "${SERVICE_NAME}"
systemctl --no-pager status "${SERVICE_NAME}" || true

echo ""
echo "Done. API should listen on port 5050 (see HOMEBOT_API_URL in .env)."
echo "Check: curl -sS http://127.0.0.1:5050/api/health"
echo "Logs:  journalctl -u ${SERVICE_NAME} -f"
echo "Guide: docs/UBUNTU_DEPLOY.md"
