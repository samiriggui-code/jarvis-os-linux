#!/usr/bin/env bash
# Sync Core (+ assets) vers le NUC. Usage:
#   NUC_HOST=192.168.1.37 NUC_USER=root ./deploy/scripts/sync-to-nuc.sh
# Fronts React : sync quand hud/dist ou dashboard/dist existent à la racine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${NUC_HOST:-192.168.1.37}"
USER="${NUC_USER:-root}"
OPT="${NUC_OPT:-/opt/jarvis}"
STORAGE="${NUC_STORAGE:-/storage/jarvis}"

echo "==> Bootstrap tree on NUC"
ssh "${USER}@${HOST}" "bash -s" < "${ROOT}/deploy/scripts/bootstrap-nuc-tree.sh"

echo "==> NUC ${USER}@${HOST}"
ssh "${USER}@${HOST}" "mkdir -p ${OPT}/core ${OPT}/share ${OPT}/hud/dist ${OPT}/dashboard/dist ${STORAGE}/{models,backups,logs,media,cache} /etc/jarvis"

# ─── DONNÉES DE PRODUCTION : NE JAMAIS ÉCRASER ───────────────────────────
# `--delete` remplace le contenu du NUC par celui du poste de dev. Sans les
# exclusions ci-dessous, pousser une simple mise à jour de code DÉTRUIRAIT :
#   • la base users du NUC (profils du foyer, PIN, rôles) — remplacée par la
#     base de dev
#   • core/data/users/ — empreintes faciales et vocales de la famille
#   • core/.env du NUC — ses propres secrets, écrasés par ceux du poste
#
# Ces fichiers naissent sur le NUC et y vivent. Le dépôt ne les possède pas.
#
# En revanche le cache vocal (core/data/voice/cache/, ~53 Mo) EST synchronisé :
# c'est un artefact de build, produit par generate_voice_cache.py et régénérable.
RSYNC_KEEP=(
  --exclude '.venv' --exclude '__pycache__' --exclude 'node_modules'
  --exclude '.env'                 # secrets propres au NUC
  --exclude 'data/*.db'            # bases users / usage de production
  --exclude 'data/users/'          # profils + biométrie du foyer
  --exclude 'data/holomat/'        # modèles et données de reconnaissance
)

rsync -av --delete "${RSYNC_KEEP[@]}" \
  "${ROOT}/core/" "${USER}@${HOST}:${OPT}/core/"

if [[ -d "${ROOT}/assets" ]]; then
  rsync -av "${ROOT}/assets/" "${USER}@${HOST}:${OPT}/share/"
fi

# Fronts produit (absents tant que figma* non promu)
if [[ -d "${ROOT}/hud/dist" ]]; then
  rsync -av --delete "${ROOT}/hud/dist/" "${USER}@${HOST}:${OPT}/hud/dist/"
fi
if [[ -d "${ROOT}/dashboard/dist" ]]; then
  rsync -av --delete "${ROOT}/dashboard/dist/" "${USER}@${HOST}:${OPT}/dashboard/dist/"
fi

scp "${ROOT}/deploy/manifests/assistant.dev.json" "${USER}@${HOST}:/etc/jarvis/manifest.json"

ssh "${USER}@${HOST}" bash -s <<EOF
set -e
cd ${OPT}/core
python3 -m venv .venv
. .venv/bin/activate
pip install -q -r requirements.txt
echo "OK — Core: python -m jarvis_core"
echo "HUD kiosk: nécessite build React + JARVIS_HUD_URL (pas encore sync si dist absent)"
EOF

echo "==> Sync terminé"
