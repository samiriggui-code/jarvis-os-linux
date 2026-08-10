#!/usr/bin/env bash
# Sync Core (+ assets + fronts buildés) vers le NUC.
#
# Usage :
#   WSL  : NUC_SSH=jarvis-nuc ./deploy/scripts/sync-to-nuc.sh
#   Win  : pwsh deploy/scripts/sync-core-only-nuc.ps1  (Core seul)
#          puis scripts dédiés HUD/dashboard quand dist/ prêts
#
# Alias SSH ( ~/.ssh/config ) :
#   jarvis-nuc      — LAN depuis WSL
#   jarvis-nuc-wan  — Windows / WAN :41222
#
# Core prod : /opt/jarvis/core · service jarvis-core · WS loopback 127.0.0.1:8765
# nginx :8080 → HUD + /ws (proxy 8765) — pas le port direct du Core.
#
# DONNÉES PROD JAMAIS ÉCRASÉES : .env, data/*.db, data/users/, data/holomat/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE="${NUC_SSH:-jarvis-nuc}"
OPT="${NUC_OPT:-/opt/jarvis}"
STORAGE="${NUC_STORAGE:-/storage/jarvis}"

if [[ "${NUC_BOOTSTRAP:-0}" == "1" ]]; then
  echo "==> Bootstrap tree on NUC (${REMOTE})"
  ssh "${REMOTE}" "bash -s" < "${ROOT}/deploy/scripts/bootstrap-nuc-tree.sh"
fi

echo "==> NUC ${REMOTE}"
ssh "${REMOTE}" "mkdir -p ${OPT}/core ${OPT}/share ${OPT}/hud/dist ${OPT}/dashboard/dist ${STORAGE}/{models,backups,logs,media,cache} /etc/jarvis"

RSYNC_KEEP=(
  --exclude '.venv' --exclude '__pycache__' --exclude 'node_modules'
  --exclude '.env'
  --exclude 'data/*.db'
  --exclude 'data/users/'
  --exclude 'data/holomat/'
)

echo "==> rsync core/"
rsync -av --delete "${RSYNC_KEEP[@]}" \
  "${ROOT}/core/" "${REMOTE}:${OPT}/core/"

if [[ -d "${ROOT}/assets" ]]; then
  echo "==> rsync assets/"
  rsync -av "${ROOT}/assets/" "${REMOTE}:${OPT}/share/"
fi

if [[ -d "${ROOT}/deploy/windows-agent" ]]; then
  echo "==> rsync windows-agent/"
  rsync -av \
    --exclude '__pycache__' --exclude 'data/' --exclude '.venv' \
    "${ROOT}/deploy/windows-agent/" "${REMOTE}:${OPT}/share/windows-agent/"
fi

echo "==> rsync nginx/ → share/ (install manuelle ou bootstrap)"
rsync -av "${ROOT}/deploy/nginx/" "${REMOTE}:${OPT}/share/nginx/"

if [[ -d "${ROOT}/hud/dist" ]]; then
  echo "==> rsync hud/dist/"
  rsync -av --delete "${ROOT}/hud/dist/" "${REMOTE}:${OPT}/hud/dist/"
else
  echo "!! hud/dist absent — npm run build dans hud/ puis resync"
fi

DASH_DIST=""
if [[ -d "${ROOT}/dashboard/dist" ]]; then
  DASH_DIST="${ROOT}/dashboard/dist"
fi
if [[ -n "${DASH_DIST}" ]]; then
  echo "==> rsync dashboard/dist/"
  rsync -av --delete "${DASH_DIST}/" "${REMOTE}:${OPT}/dashboard/dist/"
else
  echo "!! dashboard/dist absent — npm run build dans dashboard/ puis resync"
fi

scp "${ROOT}/deploy/manifests/assistant.dev.json" "${REMOTE}:/etc/jarvis/manifest.json"

echo "==> restart jarvis-core (pip seulement si NUC_PIP=1)"
ssh "${REMOTE}" bash -s <<EOF
set -e
cd ${OPT}/core
if [[ "${NUC_PIP:-0}" == "1" ]]; then
  python3 -m venv .venv 2>/dev/null || true
  . .venv/bin/activate
  pip install -q -r requirements.txt || echo "WARN: pip install partiel"
fi
systemctl restart jarvis-core
sleep 3
systemctl is-active jarvis-core
echo "OK — Core WS loopback 127.0.0.1:8765 · HUD nginx :8080"
EOF

echo "==> Sync terminé"
