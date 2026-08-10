#!/usr/bin/env bash
# AUTH_SMOKE_TEST — orchestrateur (Core 4–5 + optionnel HUD 1–4)
#
# Usage :
#   ./deploy/scripts/auth-smoke-test.sh
#   JARVIS_CORE_WS=ws://127.0.0.1:8765 ./deploy/scripts/auth-smoke-test.sh
#   AUTH_SMOKE_HUD=1 JARVIS_HUD_URL=http://127.0.0.1:5173 ./deploy/scripts/auth-smoke-test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WS="${JARVIS_CORE_WS:-ws://127.0.0.1:8765}"

echo "======== AUTH_SMOKE_TEST ========"
echo "WS=$WS"

cd "$ROOT/core"
if [[ -x .venv/bin/python ]]; then
  PY=.venv/bin/python
else
  PY=python3
fi
JARVIS_CORE_WS="$WS" "$PY" -m jarvis_core._smoke_auth_face

if [[ "${AUTH_SMOKE_HUD:-0}" == "1" ]]; then
  echo ""
  HUD_DIR="${ROOT}/hud"
  if [[ ! -d "${HUD_DIR}/scripts" ]]; then
    echo "!! hud/scripts absent — AUTH_SMOKE_HUD ignoré"
    exit 0
  fi
  cd "${HUD_DIR}"
  node scripts/authSmokeBrowser.mjs
fi

echo "======== AUTH_SMOKE_TEST DONE ========"
