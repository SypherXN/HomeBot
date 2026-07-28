# Shared helpers for install-homebot.sh and update-homebot.sh
# shellcheck shell=bash

read_env_var() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 1
  local line
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -1 || true)"
  [[ -n "$line" ]] || return 1
  printf '%s' "${line#*=}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr -d '\r'
}

# Returns 0 when .env has the minimum values for a working Discord + API deployment.
env_file_ready() {
  local file="$1"
  local token guild api_on api_tok jwt

  token="$(read_env_var "$file" DISCORD_TOKEN || true)"
  guild="$(read_env_var "$file" DISCORD_GUILD_ID || true)"
  api_on="$(read_env_var "$file" HOMEBOT_API_ENABLED || true)"
  api_tok="$(read_env_var "$file" HOMEBOT_API_TOKEN || true)"
  jwt="$(read_env_var "$file" HOMEBOT_WEB_JWT_SECRET || true)"

  [[ -n "$token" ]] || return 1
  [[ -n "$guild" ]] || return 1
  [[ "${api_on,,}" == "true" ]] || return 1
  [[ -n "$api_tok" ]] || return 1
  [[ ${#jwt} -ge 32 ]] || return 1
  return 0
}

print_env_reminder() {
  local env_path="$1" service="$2"
  echo ""
  echo "==> Configure secrets before HomeBot can run:"
  echo "    sudo -u homebot nano ${env_path}"
  echo ""
  echo "    Required minimum (no quotes around values):"
  echo "      DISCORD_TOKEN=..."
  echo "      DISCORD_GUILD_ID=...          # digits only"
  echo "      HOMEBOT_API_ENABLED=true"
  echo "      HOMEBOT_API_TOKEN=...         # long random secret"
  echo "      HOMEBOT_WEB_JWT_SECRET=...    # at least 32 characters"
  echo ""
  echo "    Use KEY=value lines only — no 'export'. Avoid inline # comments on the same line."
  echo "    Then: sudo systemctl restart ${service}"
  echo "    Check: curl -sS http://127.0.0.1:5050/api/health"
  echo ""
}

install_systemd_unit() {
  local app_dir="$1"
  local service_name="$2"
  local unit_dest="/etc/systemd/system/${service_name}"
  local script_dir unit_src dotnet_bin

  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  unit_src="${script_dir}/../systemd/homebot.service.example"
  dotnet_bin="$(command -v dotnet)"

  if [[ -z "$dotnet_bin" ]]; then
    echo "dotnet not found in PATH" >&2
    return 1
  fi

  if [[ -f "$unit_src" ]]; then
    sed -e "s|/opt/homebot/app|${app_dir}|g" \
        -e "s|/usr/bin/dotnet|${dotnet_bin}|g" \
        "$unit_src" >"$unit_dest"
  else
    cat >"$unit_dest" <<EOF
[Unit]
Description=HomeBot Discord + API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=homebot
Group=homebot
WorkingDirectory=${app_dir}
EnvironmentFile=${app_dir}/.env
ExecStart=${dotnet_bin} ${app_dir}/publish/HomeBot.dll
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
  fi

  systemctl daemon-reload
}

publish_homebot() {
  local app_dir="$1"
  sudo -u homebot bash -c "cd '${app_dir}' && dotnet publish -c Release -o '${app_dir}/publish'"
}

# Git does not track the executable bit on these scripts; systemd units invoke them directly.
ensure_script_executables() {
  local app_dir="$1"
  find "${app_dir}/scripts" -type f -name '*.sh' -exec chmod +x {} \;
}
