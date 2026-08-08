#!/usr/bin/env bash
# Efface tous les users Auth (SQL + profils disque). → first_run = true.
# Usage (NUC) : sudo bash deploy/scripts/wipe-auth-users.sh
set -euo pipefail

ENV_FILE="${JARVIS_CORE_ENV:-/etc/jarvis/core.env}"
DATA_DIR="${JARVIS_DATA_DIR:-/opt/jarvis/core/data}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # Ne source que JARVIS_DATABASE_URL
  # shellcheck disable=SC1091
  source <(grep -E '^JARVIS_DATABASE_URL=' "$ENV_FILE" || true)
  set +a
fi

if [[ -z "${JARVIS_DATABASE_URL:-}" ]]; then
  echo "JARVIS_DATABASE_URL manquant ($ENV_FILE)" >&2
  exit 1
fi

echo "== truncate users =="
psql "$JARVIS_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "TRUNCATE auth_audit, users RESTART IDENTITY CASCADE;"

echo "== wipe profils disque =="
if [[ -d "$DATA_DIR/users" ]]; then
  find "$DATA_DIR/users" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
fi
mkdir -p "$DATA_DIR/users"

echo "== count =="
psql "$JARVIS_DATABASE_URL" -tAc "SELECT count(*) FROM users;"

echo "OK — first_run attendu au prochain auth.status"
