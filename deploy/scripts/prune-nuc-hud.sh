#!/usr/bin/env bash
# Nettoyage disque NUC — ne garde que le build HUD référencé par index.html.
set -euo pipefail

HUD_DIST="${JARVIS_HUD_DIST:-/opt/jarvis/hud/dist}"
ASSETS="$HUD_DIST/assets"

echo "[jarvis-prune] HUD: $HUD_DIST"

if [[ ! -f "$HUD_DIST/index.html" ]]; then
  echo "index.html absent — abort" >&2
  exit 1
fi

# Fichiers réellement liés depuis index.html
mapfile -t KEEP < <(grep -oE 'assets/[^"'\'' ]+' "$HUD_DIST/index.html" | sed 's#^assets/##' | sort -u)
KEEP+=("vision_bundle-CUyJA7J6.js")  # lazy-load gestes (pas toujours dans index)

echo "[jarvis-prune] keep:"
printf '  %s\n' "${KEEP[@]}"

if [[ -d "$ASSETS" ]]; then
  shopt -s nullglob
  for f in "$ASSETS"/index-*.js "$ASSETS"/index-*.css; do
    base=$(basename "$f")
    keep=0
    for k in "${KEEP[@]}"; do
      if [[ "$base" == "$k" ]]; then keep=1; break; fi
    done
    if [[ $keep -eq 0 ]]; then
      echo "  rm $base"
      rm -f "$f"
    fi
  done
fi

# Débris scp /tmp
echo "[jarvis-prune] /tmp deploy leftovers"
rm -f /tmp/index-*.js /tmp/index-*.css /tmp/index.html \
  /tmp/__init__.py /tmp/face_engine.py /tmp/capabilities.py /tmp/sequences.py \
  /tmp/auth.yaml /tmp/enrolement.yaml /tmp/jarvis-hud /tmp/jarvis-hud-session \
  /tmp/jarvis-hud.service /tmp/SKILL.md /tmp/voiceConfirm.ts \
  /tmp/_check_face.py /tmp/_hud_ws_grep*.py /tmp/dump_tools.py \
  /tmp/jarvis_init.py /tmp/manager.py /tmp/providers.py /tmp/pi_login.py \
  /tmp/jarvis_hls_url.txt 2>/dev/null || true
rm -rf /tmp/jarvis-dash-deploy /tmp/huddeploy 2>/dev/null || true

# Chromium kiosk cache (régénéré au prochain start)
if [[ -d /var/lib/jarvis/chromium-hud ]]; then
  echo "[jarvis-prune] chromium-hud Cache/Code Cache"
  rm -rf /var/lib/jarvis/chromium-hud/Default/Cache \
         /var/lib/jarvis/chromium-hud/Default/Code\ Cache \
         /var/lib/jarvis/chromium-hud/ShaderCache \
         /var/lib/jarvis/chromium-hud/GrShaderCache 2>/dev/null || true
fi

df -h / | tail -1
echo "[jarvis-prune] OK — assets restants:"
ls -lh "$ASSETS"/index-* 2>/dev/null || true
