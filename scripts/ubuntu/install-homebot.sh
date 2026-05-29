#!/usr/bin/env bash
# Install HomeBot on Ubuntu 22.04 or 24.04 (Discord + API + systemd).
# Run as root: sudo bash scripts/ubuntu/install-homebot.sh https://github.com/YOUR_USER/HomeBot.git
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

REPO_URL="${1:-${HOMEBOT_REPO_URL:-}}"
INSTALL_ROOT="${HOMEBOT_INSTALL_ROOT:-/opt/homebot}"
APP_DIR="${HOMEBOT_APP_DIR:-${INSTALL_ROOT}/app}"
SERVICE_NAME="${HOMEBOT_SERVICE_NAME:-homebot.service}"
ENV_FILE="${APP_DIR}/.env"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0 https://github.com/YOUR_USER/HomeBot.git" >&2
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

echo "==> Installing packages (git, curl, wget)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates wget

if ! command -v dotnet >/dev/null 2>&1; then
  echo "==> Installing .NET 10 SDK (Ubuntu ${UBUNTU_VER})..."
  wget -q "https://packages.microsoft.com/config/ubuntu/${UBUNTU_VER}/packages-microsoft-prod.deb" \
    -O /tmp/packages-microsoft-prod.deb
  dpkg -i /tmp/packages-microsoft-prod.deb
  apt-get update -qq
  apt-get install -y -qq dotnet-sdk-10.0
fi
echo "==> dotnet $(dotnet --version)"

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

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "==> Creating ${ENV_FILE} from .env.example"
  cp "${APP_DIR}/.env.example" "${ENV_FILE}"
  chown homebot:homebot "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
else
  echo "==> Keeping existing ${ENV_FILE}"
  chmod 600 "${ENV_FILE}" 2>/dev/null || true
  chown homebot:homebot "${ENV_FILE}" 2>/dev/null || true
fi

if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
  echo "==> Stopping ${SERVICE_NAME} for publish..."
  systemctl stop "${SERVICE_NAME}"
fi

echo "==> Publishing release build to ${APP_DIR}/publish ..."
publish_homebot "${APP_DIR}"

echo "==> Installing systemd unit /etc/systemd/system/${SERVICE_NAME}"
install_systemd_unit "${APP_DIR}" "${SERVICE_NAME}"
systemctl enable "${SERVICE_NAME}"

if ! env_file_ready "${ENV_FILE}"; then
  systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
  print_env_reminder "${ENV_FILE}" "${SERVICE_NAME}"
  echo "Guide: ${APP_DIR}/docs/UBUNTU_DEPLOY.md (or docs/SETUP.md in the repo)"
  exit 0
fi

echo "==> Starting ${SERVICE_NAME}..."
systemctl restart "${SERVICE_NAME}" || systemctl start "${SERVICE_NAME}"
sleep 1
systemctl --no-pager status "${SERVICE_NAME}" || true

echo ""
echo "Done."
echo "  Health: curl -sS http://127.0.0.1:5050/api/health"
echo "  Logs:   journalctl -u ${SERVICE_NAME} -f"
echo "  Config: sudo -u homebot nano ${ENV_FILE}"
echo "  Update: sudo bash ${APP_DIR}/scripts/ubuntu/update-homebot.sh"
echo "  Guide:  ${APP_DIR}/docs/UBUNTU_DEPLOY.md"
echo "  Backup: ${APP_DIR}/docs/SETUP.md#20-backing-up-sqlite-homebotdb (local §20.1, Google Drive §20.2)"
