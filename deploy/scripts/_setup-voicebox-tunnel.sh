#!/usr/bin/env bash
# Tunnel NUC → VPS voicebox (17600). Utilise la clé VPS générale (pas la clé ollama bornée).
set -euo pipefail
HOST="jarvis-nuc"
ROOT="/mnt/c/laragon/www/jarvis-os-linux"
KEY_SRC="/mnt/c/Users/samir/.ssh/id_ed25519"

if [[ ! -f "$KEY_SRC" ]]; then
  echo "clé VPS absente: $KEY_SRC"; exit 1
fi

scp "$KEY_SRC" "$HOST:/root/.ssh/jarvis_vps_voicebox_ed25519"
ssh "$HOST" 'chmod 600 /root/.ssh/jarvis_vps_voicebox_ed25519'

# Installer l'unit
scp "$ROOT/deploy/systemd/jarvis-tunnel-voicebox.service" "$HOST:/etc/systemd/system/jarvis-tunnel-voicebox.service"
ssh "$HOST" 'systemctl daemon-reload
systemctl enable --now jarvis-tunnel-voicebox.service
sleep 3
systemctl is-active jarvis-tunnel-voicebox
curl -s -m 5 -o /dev/null -w "voicebox:%{http_code}\n" http://127.0.0.1:17600/ || true
systemctl restart jarvis-core
sleep 5
journalctl -u jarvis-core -n 15 --no-pager | grep -iE "voice|hermes|Auth|WS" | tail -15'
