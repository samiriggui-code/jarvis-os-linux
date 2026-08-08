#!/usr/bin/env bash
# Crée les profils voicebox attendus par le Core (jarvis-fr / jarvis-en / jarvis-soft).
# Idempotent : ne recrée pas un profil déjà présent (match sur name).
#
# Usage (NUC ou machine où voicebox écoute) :
#   VOICEBOX_URL=http://127.0.0.1:17600 bash deploy/scripts/setup-voicebox-profiles.sh
# Depuis le poste dev via SSH :
#   ssh jarvis-nuc 'VOICEBOX_URL=http://127.0.0.1:17600 bash -s' < deploy/scripts/setup-voicebox-profiles.sh
set -euo pipefail

VOICEBOX_URL="${VOICEBOX_URL:-http://127.0.0.1:17600}"
VOICEBOX_URL="${VOICEBOX_URL%/}"

echo "==> voicebox @ ${VOICEBOX_URL}"
curl -sf -m 8 "${VOICEBOX_URL}/health" >/dev/null || {
  echo "ERREUR: voicebox injoignable sur ${VOICEBOX_URL}/health"
  exit 1
}

existing="$(curl -sf -m 15 "${VOICEBOX_URL}/profiles" || echo '[]')"

ensure_profile() {
  local name="$1"
  local language="$2"
  local preset_engine="$3"
  local preset_voice_id="$4"
  local description="$5"

  if echo "$existing" | grep -q "\"name\"[[:space:]]*:[[:space:]]*\"${name}\""; then
    echo "  OK  profil « ${name} » déjà présent"
    return 0
  fi

  payload=$(cat <<EOF
{
  "name": "${name}",
  "description": "${description}",
  "language": "${language}",
  "voice_type": "preset",
  "preset_engine": "${preset_engine}",
  "preset_voice_id": "${preset_voice_id}"
}
EOF
)

  http_code=$(curl -s -m 30 -o /tmp/vb_profile.json -w '%{http_code}' \
    -X POST "${VOICEBOX_URL}/profiles" \
    -H 'Content-Type: application/json' \
    -d "$payload")

  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    echo "  OK  profil « ${name} » créé"
    return 0
  fi

  echo "  FAIL profil « ${name} » HTTP ${http_code}"
  cat /tmp/vb_profile.json 2>/dev/null || true
  return 1
}

echo "==> profils JARVIS (preset Kokoro — CPU-friendly)"
ensure_profile "jarvis-fr"   "fr" "kokoro" "ff_siwis" "JARVIS FR — voix Kokoro Siwis"
ensure_profile "jarvis-en"   "en" "kokoro" "am_adam"  "JARVIS EN — voix Kokoro Adam"
ensure_profile "jarvis-soft" "fr" "kokoro" "ff_siwis" "JARVIS soft — même timbre, preset HUD soft"

echo "==> liste finale"
curl -sf -m 15 "${VOICEBOX_URL}/profiles" | grep -E '"name"|"preset_engine"|"preset_voice_id"' || true
echo "DONE"
