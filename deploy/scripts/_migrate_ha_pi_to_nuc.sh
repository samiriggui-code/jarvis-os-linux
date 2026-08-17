#!/usr/bin/env bash
# Orchestration depuis NUC : bootstrap HA local + cleanup Pi + vérif.
set -euo pipefail

log_warn() { echo "[migrate] WARN: $*"; }

REPO="${JARVIS_REPO:-/opt/jarvis}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

bash "$SCRIPT_DIR/_bootstrap_ha_nuc.sh"

# Cleanup Pi via SSH (clés NUC → Pi)
PI_HOST="${JARVIS_PI_HOST:-192.168.1.27}"
PI_USER="${JARVIS_PI_USER:-pi}"
PI_KEY="${JARVIS_PI_SSH_KEY:-/etc/jarvis/ssh/pi_terminal}"

if [[ -f "$PI_KEY" ]]; then
  scp -i "$PI_KEY" -o StrictHostKeyChecking=no \
    "$SCRIPT_DIR/_cleanup_pi_ha.sh" "${PI_USER}@${PI_HOST}:/tmp/" || true
  ssh -i "$PI_KEY" -o StrictHostKeyChecking=no "${PI_USER}@${PI_HOST}" \
    "sed -i 's/\r$//' /tmp/_cleanup_pi_ha.sh && sudo bash /tmp/_cleanup_pi_ha.sh" || \
    log_warn "Pi cleanup SSH échoué — lancer manuellement sur Pi"
else
  echo "[migrate] Pas de clé Pi ($PI_KEY) — cleanup Pi manuel requis"
  echo "  scp deploy/scripts/_cleanup_pi_ha.sh pi@192.168.1.27:/tmp/"
  echo "  ssh pi@192.168.1.27 'sudo bash /tmp/_cleanup_pi_ha.sh'"
fi

# Smoke HA NUC
sleep 5
TOKEN=""
if [[ -f /etc/jarvis/core.env ]]; then
  # shellcheck disable=SC1091
  source /etc/jarvis/core.env
fi
if curl -sf http://127.0.0.1:8123/api/ >/dev/null 2>&1; then
  echo "[migrate] HA NUC API OK"
elif [[ -n "${JARVIS_HASS_TOKEN:-}" ]]; then
  curl -sf -H "Authorization: Bearer $JARVIS_HASS_TOKEN" http://127.0.0.1:8123/api/ && \
    echo "[migrate] HA NUC API auth OK" || echo "[migrate] HA NUC boot en cours — créer token si 1er install"
else
  echo "[migrate] HA NUC premier boot — créer compte admin + token long-lived"
fi

PYTHONPATH="$REPO/core" python3 -m jarvis_core._smoke_gateway 2>/dev/null || true
echo "[migrate] DONE"
