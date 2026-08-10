#!/usr/bin/env bash
# Sync Core Python → NUC (code uniquement, sans HUD/dashboard).
#
# Usage WSL / Linux :
#   ./deploy/scripts/sync-core-only-nuc.sh
#   NUC_SSH=jarvis-nuc ./deploy/scripts/sync-core-only-nuc.sh
#   NUC_PIP=1 ./deploy/scripts/sync-core-only-nuc.sh   # pip optionnel (souvent inutile)
#
# Windows PowerShell : préférer sync-core-only-nuc.ps1 (alias jarvis-nuc-wan).
#
# Ne touche PAS : .env, data/*.db, data/users/, data/holomat/ (prod NUC).
# Après sync : systemctl restart jarvis-core (service existant, /opt/jarvis/bin/jarvis-core).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE="${NUC_SSH:-jarvis-nuc}"
OPT="${NUC_OPT:-/opt/jarvis}"
TMP="/tmp/jarvis-core-push-$$"

RSYNC_KEEP=(
  --exclude '.venv' --exclude '__pycache__' --exclude 'node_modules'
  --exclude '.env'
  --exclude 'data/*.db'
  --exclude 'data/users/'
  --exclude 'data/holomat/'
)

echo "==> SSH ${REMOTE} — push core/jarvis_core via ${TMP}"
ssh "${REMOTE}" "mkdir -p ${TMP}"
rsync -av --delete "${RSYNC_KEEP[@]}" \
  "${ROOT}/core/jarvis_core/" "${REMOTE}:${TMP}/jarvis_core/"
scp "${ROOT}/core/requirements.txt" "${REMOTE}:${TMP}/requirements.txt"

echo "==> install + restart jarvis-core"
ssh "${REMOTE}" bash -s <<EOF
set -e
rsync -a --delete --exclude '__pycache__' ${TMP}/jarvis_core/ ${OPT}/core/jarvis_core/
cp ${TMP}/requirements.txt ${OPT}/core/requirements.txt
rm -rf ${TMP}
cd ${OPT}/core
if [[ "${NUC_PIP:-0}" == "1" ]]; then
  python3 -m venv .venv 2>/dev/null || true
  . .venv/bin/activate
  pip install -q -r requirements.txt || echo "WARN: pip install partiel — venv NUC peut rester inchangé"
fi
systemctl restart jarvis-core
sleep 3
systemctl is-active jarvis-core
journalctl -u jarvis-core -n 6 --no-pager | tail -6
EOF

echo "==> Core sync terminé"
