#!/usr/bin/env bash
# Vérifie que le toolset spotify est exposé à l'API Hermes (platform_toolsets).
# Prérequis côté Hermes : credentials Spotify dans config Hermes (hors scope Core).
set -euo pipefail

HERMES_URL="${JARVIS_HERMES_URL:-http://127.0.0.1:8642}"
KEY="${JARVIS_HERMES_KEY:-}"

if [ -z "$KEY" ]; then
  echo "ERREUR: JARVIS_HERMES_KEY absente"
  exit 1
fi

echo "==> toolsets Hermes @ ${HERMES_URL}"
raw="$(curl -sf -m 10 -H "Authorization: Bearer ${KEY}" "${HERMES_URL}/v1/toolsets" || true)"
if [ -z "$raw" ]; then
  echo "FAIL: /v1/toolsets injoignable"
  exit 1
fi

if echo "$raw" | grep -qi spotify; then
  echo "OK: spotify présent dans /v1/toolsets"
else
  echo "FAIL: spotify absent — fusionner deploy/hermes/config.snippet.yaml (platform_toolsets)"
  echo "$raw" | head -c 400
  exit 1
fi

echo "DONE — activer JARVIS_SPOTIFY_ENABLED=1 dans /etc/jarvis/core.env si credentials Spotify OK"
