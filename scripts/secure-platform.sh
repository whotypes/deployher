#!/usr/bin/env bash
# Production hardening: strong Postgres password, loopback-only infra ports, DOCKER-USER firewall.
# Safe to re-run. Does not change SSH or delete data.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

ENV_FILE="${ENV_FILE:-.env}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "$ENV_FILE")

read_env_var() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  printf '%s' "${line#*=}"
}

set_env_var() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    local escaped="${value//\\/\\\\}"
    escaped="${escaped//&/\\&}"
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

ensure_compose_file_env() {
  if grep -qE '^COMPOSE_FILE=' "$ENV_FILE" 2>/dev/null; then
    if ! grep -q 'docker-compose.prod.yml' "$ENV_FILE"; then
      local current
      current="$(read_env_var COMPOSE_FILE || true)"
      set_env_var COMPOSE_FILE "${current}:docker-compose.prod.yml"
    fi
  else
    printf '\nCOMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml\n' >>"$ENV_FILE"
  fi
}

ensure_postgres_env() {
  local user db password
  user="$(read_env_var POSTGRES_USER 2>/dev/null || true)"
  db="$(read_env_var POSTGRES_DB 2>/dev/null || true)"
  password="$(read_env_var POSTGRES_PASSWORD 2>/dev/null || true)"

  [[ -n "$user" ]] || set_env_var POSTGRES_USER app
  [[ -n "$db" ]] || set_env_var POSTGRES_DB placeholder

  if [[ -z "$password" ]] || [[ "$password" == "app" ]]; then
    password="$(openssl rand -hex 32)"
    set_env_var POSTGRES_PASSWORD "$password"
    echo "secure-platform: generated new POSTGRES_PASSWORD"
  fi
}

rotate_postgres_password() {
  local user password
  user="$(read_env_var POSTGRES_USER)"
  password="$(read_env_var POSTGRES_PASSWORD)"

  if ! docker ps --format '{{.Names}}' | grep -qx postgres; then
    echo "secure-platform: postgres container not running; password will apply on first init or next start"
    return 0
  fi

  local sql_password="${password//\'/\'\'}"
  if docker exec -e PGPASSWORD=app postgres \
    psql -U "$user" -d "$(read_env_var POSTGRES_DB)" -v ON_ERROR_STOP=1 \
    -c "ALTER USER \"${user}\" WITH PASSWORD '${sql_password}';" >/dev/null 2>&1; then
    echo "secure-platform: rotated postgres role password (was default or stale)"
    return 0
  fi

  if docker exec -e PGPASSWORD="$password" postgres \
    psql -U "$user" -d "$(read_env_var POSTGRES_DB)" -v ON_ERROR_STOP=1 \
    -c "SELECT 1;" >/dev/null 2>&1; then
    echo "secure-platform: postgres already uses POSTGRES_PASSWORD from .env"
    return 0
  fi

  echo "secure-platform: could not rotate postgres password automatically" >&2
  echo "secure-platform: set POSTGRES_PASSWORD in .env, then run:" >&2
  echo "  docker exec -it postgres psql -U $user -d $(read_env_var POSTGRES_DB) -c \"ALTER USER $user WITH PASSWORD '...';\"" >&2
  exit 1
}

install_firewall() {
  if [[ "$(id -u)" -eq 0 ]]; then
    bash "$repo_root/scripts/install-docker-firewall.sh"
  else
    echo "secure-platform: skipping firewall install (not root); run: sudo bash scripts/install-docker-firewall.sh"
  fi
}

main() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "secure-platform: missing $ENV_FILE" >&2
    exit 1
  fi

  ensure_compose_file_env
  ensure_postgres_env
  rotate_postgres_password
  install_firewall

  echo "secure-platform: applying production compose overrides..."
  "${COMPOSE[@]}" up -d
  if [[ "${SECURE_PLATFORM_BUILD:-}" == "1" ]]; then
    echo "secure-platform: rebuilding images (SECURE_PLATFORM_BUILD=1)..."
    "${COMPOSE[@]}" up -d --build
  fi

  echo "secure-platform: done"
}

main "$@"
