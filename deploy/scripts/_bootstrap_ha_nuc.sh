#!/usr/bin/env bash
# Bootstrap HA sur NUC + bascule Core env → 127.0.0.1:8123
# Migration config depuis Pi (192.168.1.27) si joignable.
set -euo pipefail

HA_DIR="${JARVIS_HA_DIR:-/opt/jarvis/homeassistant}"
CORE_ENV="${JARVIS_CORE_ENV:-/etc/jarvis/core.env}"
PI_HA_URL="${JARVIS_HA_PI_URL:-http://192.168.1.27:8123}"
REPO="${JARVIS_REPO:-/opt/jarvis}"
DEPLOY="${JARVIS_DEPLOY:-$(cd "$(dirname "$0")/.." && pwd)}"

log() { echo "[ha-nuc] $*"; }

mkdir -p "$HA_DIR/config"
if [[ -f "$REPO/deploy/homeassistant/compose.nuc.yaml" ]]; then
  cp "$REPO/deploy/homeassistant/compose.nuc.yaml" "$HA_DIR/compose.yaml"
elif [[ -f "$(dirname "$0")/../homeassistant/compose.nuc.yaml" ]]; then
  cp "$(dirname "$0")/../homeassistant/compose.nuc.yaml" "$HA_DIR/compose.yaml"
else
  log "compose.nuc.yaml introuvable"; exit 1
fi

# YAML versionné (packages, dashboard) — base avant import backup Pi
for sub in configuration.yaml packages dashboards; do
  src="$DEPLOY/homeassistant/$sub"
  if [[ ! -e "$src" ]]; then
    src="$REPO/deploy/homeassistant/$sub"
  fi
  if [[ -e "$src" ]]; then
    if [[ -d "$src" ]]; then
      mkdir -p "$HA_DIR/config/$(basename "$sub")"
      rsync -a "$src/" "$HA_DIR/config/$(basename "$sub")/" 2>/dev/null || cp -r "$src/." "$HA_DIR/config/$(basename "$sub")/"
    else
      cp "$src" "$HA_DIR/config/"
    fi
  fi
done

# Fichiers minimaux si absents
for f in automations.yaml scripts.yaml scenes.yaml; do
  [[ -f "$HA_DIR/config/$f" ]] || echo "[]" > "$HA_DIR/config/$f" 2>/dev/null || touch "$HA_DIR/config/$f"
done

# Token actuel (Pi) pour export backup
if [[ -f "$CORE_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$CORE_ENV" 2>/dev/null || true
fi
TOKEN="${JARVIS_HASS_TOKEN:-}"

if [[ -n "$TOKEN" ]]; then
  if curl -sf -H "Authorization: Bearer $TOKEN" "$PI_HA_URL/api/" >/dev/null 2>&1; then
    log "Pi HA joignable — tentative backup tarball via API"
    BACKUP="/tmp/jarvis-ha-pi-backup.tar"
    if curl -sf -H "Authorization: Bearer $TOKEN" \
      -o "$BACKUP" "$PI_HA_URL/api/hassio/backups/latest/download" 2>/dev/null; then
      log "backup Pi téléchargé → extraction partielle dans config NUC"
      mkdir -p /tmp/ha-backup-extract
      tar -xf "$BACKUP" -C /tmp/ha-backup-extract 2>/dev/null || true
      if [[ -d /tmp/ha-backup-extract/data ]]; then
        rsync -a /tmp/ha-backup-extract/data/ "$HA_DIR/config/" || true
      fi
      rm -rf /tmp/ha-backup-extract "$BACKUP"
    else
      log "backup supervisé indisponible (container HA) — YAML repo + re-pairing manuel"
    fi
  else
    log "Pi HA non joignable — install NUC avec YAML repo seulement"
  fi
fi

cd "$HA_DIR"
docker compose pull
docker compose up -d
sleep 8

if curl -sf http://127.0.0.1:8123/api/ >/dev/null 2>&1; then
  log "HA NUC UP sur :8123"
else
  log "HA NUC démarre (premier boot peut prendre 2-5 min) — vérifier: curl http://127.0.0.1:8123/api/"
fi

# Bascule Core → NUC local
python3 <<'PY'
from pathlib import Path
import re

path = Path("/etc/jarvis/core.env")
if not path.is_file():
    raise SystemExit("core.env absent")
lines = path.read_text(encoding="utf-8").splitlines()
out = []
seen_url = False
for line in lines:
    if line.startswith("JARVIS_HASS_URL="):
        out.append("JARVIS_HASS_URL=http://127.0.0.1:8123")
        seen_url = True
    elif line.startswith("HASS_URL="):
        continue
    else:
        out.append(line)
if not seen_url:
    out.append("JARVIS_HASS_URL=http://127.0.0.1:8123")
path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
print("core.env → JARVIS_HASS_URL=http://127.0.0.1:8123")
PY

systemctl restart jarvis-core
log "jarvis-core restarted"
grep '^JARVIS_HASS_URL=' "$CORE_ENV" || true
