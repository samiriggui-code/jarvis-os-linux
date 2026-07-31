#!/usr/bin/env bash
# Crée l'arborescence JARVIS sur le NUC (à lancer EN ROOT sur le NUC, ou via ssh).
# Usage local NUC:  sudo bash bootstrap-nuc-tree.sh
# Usage depuis PC:  ssh root@IP 'bash -s' < deploy/scripts/bootstrap-nuc-tree.sh
set -euo pipefail

OPT="${JARVIS_OPT:-/opt/jarvis}"
ETC="${JARVIS_ETC:-/etc/jarvis}"
STORAGE="${JARVIS_STORAGE:-/storage/jarvis}"
VARLIB="${JARVIS_VARLIB:-/var/lib/jarvis}"

echo "==> Création arborescence JARVIS"

mkdir -p \
  "${OPT}/hud/dist" \
  "${OPT}/dashboard/dist" \
  "${OPT}/core" \
  "${OPT}/setup" \
  "${OPT}/bin" \
  "${OPT}/share" \
  "${ETC}" \
  "${STORAGE}/models" \
  "${STORAGE}/backups" \
  "${STORAGE}/logs" \
  "${STORAGE}/media" \
  "${STORAGE}/cache" \
  "${VARLIB}/state" \
  "${VARLIB}/devices"

if [[ ! -f "${ETC}/secrets.env" ]]; then
  umask 077
  touch "${ETC}/secrets.env"
  chmod 600 "${ETC}/secrets.env"
fi

if [[ ! -f "${ETC}/config.yaml" ]]; then
  cat > "${ETC}/config.yaml" <<'EOF'
assistant:
  name: Hermes
profile: assistant
llm:
  mode: system
paths:
  opt: /opt/jarvis
  storage: /storage/jarvis
  config: /etc/jarvis
EOF
fi

if [[ ! -f "${ETC}/modules.yaml" ]]; then
  cat > "${ETC}/modules.yaml" <<'EOF'
hud: true
core: true
dashboard: true
ollama: false
homeassistant: false
whisper: false
piper: false
EOF
fi

if [[ ! -f "${ETC}/hardware.yaml" ]]; then
  cat > "${ETC}/hardware.yaml" <<'EOF'
# Rempli plus tard par Capability Manager
machine:
  hostname: null
  ram_gb: null
  gpu: false
detected: []
EOF
fi

if [[ ! -e /var/log/jarvis ]]; then
  ln -sfn "${STORAGE}/logs" /var/log/jarvis || true
fi

cat > "${OPT}/bin/jarvis-core" <<'EOF'
#!/usr/bin/env bash
export JARVIS_CONFIG_DIR="${JARVIS_CONFIG_DIR:-/etc/jarvis}"
cd /opt/jarvis/core
exec /opt/jarvis/core/.venv/bin/python -m jarvis_core "$@"
EOF

# Kiosque Chromium — sert le build React (pas PySide)
cat > "${OPT}/bin/jarvis-hud" <<'EOF'
#!/usr/bin/env bash
URL="${JARVIS_HUD_URL:-http://127.0.0.1:8080/}"
# Préférer chromium / chromium-browser / google-chrome selon la distro
CHROME="${JARVIS_CHROME:-}"
if [[ -z "$CHROME" ]]; then
  for c in chromium chromium-browser google-chrome google-chrome-stable; do
    command -v "$c" >/dev/null 2>&1 && CHROME="$c" && break
  done
fi
if [[ -z "$CHROME" ]]; then
  echo "jarvis-hud: aucun Chromium trouvé" >&2
  exit 1
fi
exec "$CHROME" --kiosk --noerrdialogs --disable-infobars \
  --check-for-update-interval=31536000 \
  --user-data-dir=/var/lib/jarvis/chromium-hud \
  "$URL"
EOF

chmod 755 "${OPT}/bin/jarvis-core" "${OPT}/bin/jarvis-hud"

UNIT_DIR=/etc/systemd/system

cat > "${UNIT_DIR}/jarvis-core.service" <<'EOF'
[Unit]
Description=JARVIS Core (orchestrator)
After=network.target
PartOf=jarvis.target

[Service]
Type=simple
WorkingDirectory=/opt/jarvis/core
Environment=JARVIS_CONFIG_DIR=/etc/jarvis
Environment=JARVIS_FORCE_SYSTEM=1
ExecStart=/opt/jarvis/bin/jarvis-core
Restart=on-failure
RestartSec=3

[Install]
WantedBy=jarvis.target
EOF

cat > "${UNIT_DIR}/jarvis-hud.service" <<'EOF'
[Unit]
Description=JARVIS HUD (Chromium kiosk → React)
After=jarvis-core.service graphical-session.target
Requires=jarvis-core.service
PartOf=jarvis.target

[Service]
Type=simple
Environment=JARVIS_CONFIG_DIR=/etc/jarvis
Environment=JARVIS_HUD_URL=http://127.0.0.1:8080/
Environment=DISPLAY=:0
ExecStart=/opt/jarvis/bin/jarvis-hud
Restart=on-failure
RestartSec=3

[Install]
WantedBy=jarvis.target
EOF

cat > "${UNIT_DIR}/jarvis.target" <<'EOF'
[Unit]
Description=JARVIS OS stack
Wants=jarvis-core.service jarvis-hud.service

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload 2>/dev/null || true

echo "==> Arborescence prête"
echo "    ${OPT}"
echo "    ${ETC}"
echo "    ${STORAGE}"
echo ""
echo "Suite: synchroniser core/ (fronts React quand prêts) puis:"
echo "  systemctl enable --now jarvis-core.service"
echo "  # HUD kiosk: besoin DISPLAY + build servi sur JARVIS_HUD_URL"
tree -L 3 "${OPT}" "${ETC}" "${STORAGE}" 2>/dev/null || find "${OPT}" "${ETC}" "${STORAGE}" "${VARLIB}" -maxdepth 2 -type d | sort
