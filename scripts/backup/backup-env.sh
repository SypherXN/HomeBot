# Shared helpers for backup scripts (sourced, not executed).
# shellcheck shell=bash

is_truthy() {
  case "${1,,}" in
    true | 1 | yes | on) return 0 ;;
  esac
  return 1
}

positive_int_or_default() {
  local raw="$1" default="$2" value
  if [[ -z "${raw}" ]]; then
    echo "$default"
    return
  fi
  if ! [[ "$raw" =~ ^[0-9]+$ ]]; then
    echo "Invalid integer: $raw" >&2
    exit 1
  fi
  value="$raw"
  if [[ "$value" -lt 0 ]]; then
    echo "Value must be >= 0: $raw" >&2
    exit 1
  fi
  echo "$value"
}
