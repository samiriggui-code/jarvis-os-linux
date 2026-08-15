#!/usr/bin/env bash
# Nettoyage NUC — débris HUD/Core/Dashboard, garde structure pour prochain deploy
set -euo pipefail

echo "[cleanup] début $(date -Is)"

# 1) Script prune officiel si présent
if [[ -x /opt/jarvis/scripts/prune-nuc-hud.sh ]]; then
  /opt/jarvis/scripts/prune-nuc-hud.sh || true
elif [[ -f /tmp/prune-nuc-hud.sh ]]; then
  bash /tmp/prune-nuc-hud.sh || true
fi

# 2) Débris /tmp déploiement
echo "[cleanup] /tmp deploy leftovers"
rm -f /tmp/index-*.js /tmp/index-*.css /tmp/index.html \
  /tmp/__init__.py /tmp/face_engine.py /tmp/capabilities.py /tmp/sequences.py \
  /tmp/auth.yaml /tmp/enrolement.yaml /tmp/jarvis-hud /tmp/jarvis-hud-session \
  /tmp/jarvis-hud.service /tmp/SKILL.md /tmp/voiceConfirm.ts \
  /tmp/_check_face.py /tmp/_hud_ws_grep*.py /tmp/dump_tools.py \
  /tmp/jarvis_init.py /tmp/manager.py /tmp/providers.py /tmp/pi_login.py \
  /tmp/jarvis_hls_url.txt 2>/dev/null || true
rm -rf /tmp/jarvis-dash-deploy /tmp/huddeploy /tmp/jarvis-core-sync /tmp/core-deploy 2>/dev/null || true

# 3) Sources React / vendor sur NUC — ne doivent pas y être (seulement dist/)
for junk in /opt/jarvis/hud/src /opt/jarvis/hud/node_modules /opt/jarvis/hud/.git \
            /opt/jarvis/dashboard/src /opt/jarvis/dashboard/node_modules /opt/jarvis/dashboard/.git \
            /opt/jarvis/vendor /opt/jarvis/figma1 /opt/jarvis/figma2; do
  if [[ -e "$junk" ]]; then
    echo "[cleanup] rm -rf $junk"
    rm -rf "$junk"
  fi
done

# 4) Vieux builds HUD — bundles orphelins (garde ceux référencés par index.html)
HUD_DIST="/opt/jarvis/hud/dist"
if [[ -f "$HUD_DIST/index.html" && -d "$HUD_DIST/assets" ]]; then
  mapfile -t KEEP < <(grep -oE 'assets/[^"'\'' ]+' "$HUD_DIST/index.html" | sed 's#^assets/##' | sort -u)
  KEEP+=("vision_bundle-CUyJA7J6.js")
  shopt -s nullglob
  for f in "$HUD_DIST/assets"/index-*.js "$HUD_DIST/assets"/index-*.css; do
    base=$(basename "$f")
    keep=0
    for k in "${KEEP[@]}"; do [[ "$base" == "$k" ]] && keep=1 && break; done
    if [[ $keep -eq 0 ]]; then
      echo "[cleanup] orphan hud asset: $base"
      rm -f "$f"
    fi
  done
fi

# 5) Dashboard — supprimer src/node_modules si présents, garder dist/
DASH_DIST="/opt/jarvis/dashboard/dist"
if [[ -d /opt/jarvis/dashboard && ! -d "$DASH_DIST" ]]; then
  echo "[cleanup] dashboard sans dist/ — contenu:"
  ls -la /opt/jarvis/dashboard | head -10
fi

# 6) Core — pas de .git / __pycache__ massif (safe)
find /opt/jarvis/core -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
find /opt/jarvis/core -name '*.pyc' -delete 2>/dev/null || true

# 7) Chromium cache kiosk
if [[ -d /var/lib/jarvis/chromium-hud ]]; then
  echo "[cleanup] chromium-hud cache"
  rm -rf /var/lib/jarvis/chromium-hud/Default/Cache \
         /var/lib/jarvis/chromium-hud/Default/Code\ Cache \
         /var/lib/jarvis/chromium-hud/ShaderCache \
         /var/lib/jarvis/chromium-hud/GrShaderCache 2>/dev/null || true
fi

# 8) Copie monorepo accidentelle sous /opt/jarvis (hors cibles prod)
for stray in /opt/jarvis/docs /opt/jarvis/deploy /opt/jarvis/hud/package.json /opt/jarvis/dashboard/package.json; do
  if [[ -e "$stray" ]]; then
    echo "[cleanup] stray monorepo file: $stray"
    rm -rf "$stray"
  fi
done

echo "[cleanup] disk after:"
df -h / | tail -1
du -sh /opt/jarvis/* 2>/dev/null | sort -h
echo "[cleanup] fin $(date -Is)"
