#!/usr/bin/env bash
# Pi salon — arrêt HA, garde ear/cam/announce uniquement.
# Exécuter SUR LE PI (ssh jarvis-pi ou jarvis-pi-via-nuc).
set -euo pipefail

log() { echo "[pi-cleanup] $*"; }

# Stop Home Assistant container
if [[ -d /opt/homeassistant ]]; then
  log "stop HA docker /opt/homeassistant"
  (cd /opt/homeassistant && docker compose down 2>/dev/null) || true
  if docker ps -a --format '{{.Names}}' | grep -qi homeassistant; then
    docker stop homeassistant 2>/dev/null || true
    docker rm homeassistant 2>/dev/null || true
  fi
  # Désactiver autostart HA
  if systemctl is-enabled home-assistant 2>/dev/null; then
    systemctl disable --now home-assistant 2>/dev/null || true
  fi
fi

# Retirer HA du service announce (env obsolète)
UNIT=/etc/systemd/system/jarvis-device-announce.service
if [[ -f "$UNIT" ]]; then
  sed -i '/JARVIS_HA_URL/d' "$UNIT"
  systemctl daemon-reload
fi

# Sync script announce sans HA gateway
PI_DIR="${JARVIS_PI_DIR:-/opt/jarvis/pi-salon}"
if [[ -f "$PI_DIR/jarvis_device_announce.py" ]]; then
  if grep -q home_assistant "$PI_DIR/jarvis_device_announce.py" 2>/dev/null; then
    log "WARN: jarvis_device_announce.py contient encore home_assistant — resync deploy/pi-salon/"
  fi
fi

# Garder I/O salon
for svc in jarvis-ear jarvis-cam jarvis-device-announce; do
  systemctl enable "$svc" 2>/dev/null || true
  systemctl restart "$svc" 2>/dev/null || log "service $svc absent ou échec restart"
  systemctl is-active "$svc" 2>/dev/null || log "$svc inactive"
done

# Vérifier : pas de port 8123
if curl -sf --max-time 2 http://127.0.0.1:8123/api/ >/dev/null 2>&1; then
  log "FAIL: HA écoute encore sur :8123"
  exit 1
fi

log "Pi nettoyé — ear/cam/announce seulement, HA arrêté"
