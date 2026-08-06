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
  "${OPT}/hermes-agent" \
  "${OPT}/bin" \
  "${OPT}/share" \
  "${ETC}" \
  "${STORAGE}/models" \
  "${STORAGE}/backups" \
  "${STORAGE}/logs" \
  "${STORAGE}/media" \
  "${STORAGE}/cache" \
  "${VARLIB}/state" \
  "${VARLIB}/devices" \
  "${VARLIB}/hermes"

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

# ⚠ COPIE VERBATIM de deploy/bin/jarvis-hermes — ne pas éditer ici seulement.
# Ce script se lance aussi par `ssh root@IP 'bash -s' < …`, sans dépôt sur la
# cible : impossible de copier depuis deploy/bin/, il faut donc l'embarquer.
# `deploy/scripts/check-embedded-copies.sh` vérifie que les deux concordent.
# --- BEGIN EMBED deploy/bin/jarvis-hermes ---
cat > "${OPT}/bin/jarvis-hermes" <<'EOF'
#!/usr/bin/env bash
# Lance Hermes gateway en foreground (systemd Type=simple).
# API locale : 127.0.0.1:8642 — Core via JARVIS_HERMES_URL.
set -euo pipefail

export JARVIS_CONFIG_DIR="${JARVIS_CONFIG_DIR:-/etc/jarvis}"
export HERMES_HOME="${HERMES_HOME:-/var/lib/jarvis/hermes}"
export API_SERVER_ENABLED="${API_SERVER_ENABLED:-true}"
export API_SERVER_HOST="${API_SERVER_HOST:-127.0.0.1}"
export API_SERVER_PORT="${API_SERVER_PORT:-8642}"

# EnvironmentFile=systemd charge déjà secrets ; rechargement utile hors unit.
for f in "${JARVIS_CONFIG_DIR}/secrets.env" "${JARVIS_CONFIG_DIR}/hermes.env"; do
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$f"
    set +a
  fi
done

mkdir -p "$HERMES_HOME"

HERMES_BIN="${HERMES_BIN:-}"
if [[ -z "$HERMES_BIN" ]]; then
  for c in \
    /opt/jarvis/hermes-agent/.venv/bin/hermes \
    /opt/jarvis/hermes-agent/venv/bin/hermes; do
    if [[ -x "$c" ]]; then
      HERMES_BIN="$c"
      break
    fi
  done
fi
if [[ -z "$HERMES_BIN" ]] && command -v hermes >/dev/null 2>&1; then
  HERMES_BIN="$(command -v hermes)"
fi
if [[ -z "${HERMES_BIN:-}" ]]; then
  echo "jarvis-hermes: binaire 'hermes' introuvable." >&2
  echo "  git clone https://github.com/NousResearch/hermes-agent /opt/jarvis/hermes-agent" >&2
  echo "  puis : cd /opt/jarvis/hermes-agent && python3 -m venv .venv && .venv/bin/pip install -e ." >&2
  exit 1
fi

WORKDIR="${HERMES_WORKDIR:-/opt/jarvis/hermes-agent}"
if [[ -d "$WORKDIR" ]]; then
  cd "$WORKDIR"
fi

# --replace : une seule instance (évite les doublons au Restart=)
exec "$HERMES_BIN" gateway run --replace "$@"
EOF
# --- END EMBED ---

chmod 755 "${OPT}/bin/jarvis-core" "${OPT}/bin/jarvis-hud" "${OPT}/bin/jarvis-hermes"

if [[ ! -f "${ETC}/hermes.env" ]]; then
  umask 077
  # La clé est GÉNÉRÉE, pas laissée en placeholder. Hermes n'active la
  # plateforme api_server que si la clé passe `has_usable_secret(min_length=16)`
  # (gateway/config.py) : avec un CHANGE_ME, la gateway démarre, le service
  # est « active (running) », et RIEN n'écoute sur 8642. Le Core sonde
  # /health dans le vide et se rabat en silence — la panne exacte que ce
  # dépôt s'est déjà prise avec voicebox.
  if command -v openssl >/dev/null 2>&1; then
    HERMES_KEY="$(openssl rand -hex 32)"
  else
    HERMES_KEY="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  cat > "${ETC}/hermes.env" <<EOF
HERMES_HOME=/var/lib/jarvis/hermes
API_SERVER_ENABLED=true
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642
# Générée au bootstrap. 16 caractères minimum, sinon l'API ne démarre pas.
API_SERVER_KEY=${HERMES_KEY}
EOF
  chmod 600 "${ETC}/hermes.env"
  echo "==> ${ETC}/hermes.env créé — API_SERVER_KEY générée (64 hex)"
  unset HERMES_KEY
fi

# Surchargeable comme les autres chemins — permet un essai à blanc complet
# hors NUC (cf. deploy/scripts/check-embedded-copies.sh).
UNIT_DIR="${JARVIS_UNIT_DIR:-/etc/systemd/system}"
mkdir -p "${UNIT_DIR}"

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
# nginx sert le build sur 127.0.0.1:8080. `Requires` et pas `Wants` : sans
# lui, Chromium démarre sur « connexion refusée », en plein salon.
After=jarvis-core.service nginx.service graphical-session.target
Requires=jarvis-core.service nginx.service
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

# --- BEGIN EMBED deploy/systemd/jarvis-hermes.service ---
cat > "${UNIT_DIR}/jarvis-hermes.service" <<'EOF'
[Unit]
Description=JARVIS Hermes Agent (HTTP API :8642)
Documentation=https://github.com/NousResearch/hermes-agent
After=network.target
# Wants et pas Requires depuis jarvis.target : Hermes down ne doit pas
# emporter JARVIS BASE (Core / HUD). Le Core sonde /health et se rabat.
PartOf=jarvis.target
# Après rafales de crash, systemd cesse de relancer (Safe Mode manuel,
# OnFailure plus tard). Ces deux directives appartiennent à [Unit] depuis
# systemd 230 : laissées dans [Service], elles sont ignorées et le frein
# anti-rafale n'existe pas — un Hermes qui boucle au démarrage repartirait
# indéfiniment.
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=simple
WorkingDirectory=/opt/jarvis/hermes-agent
Environment=JARVIS_CONFIG_DIR=/etc/jarvis
Environment=HERMES_HOME=/var/lib/jarvis/hermes
Environment=API_SERVER_ENABLED=true
Environment=API_SERVER_HOST=127.0.0.1
Environment=API_SERVER_PORT=8642
# Secrets (API_SERVER_KEY, clés LLM…) — hors git
EnvironmentFile=-/etc/jarvis/secrets.env
EnvironmentFile=-/etc/jarvis/hermes.env
ExecStart=/opt/jarvis/bin/jarvis-hermes
Restart=on-failure
RestartSec=5
TimeoutStartSec=120

[Install]
WantedBy=jarvis.target
# Alias pour les docs / recovery : systemctl restart hermes-agent
Alias=hermes-agent.service
EOF
# --- END EMBED ---

# --- BEGIN EMBED deploy/systemd/jarvis.target ---
cat > "${UNIT_DIR}/jarvis.target" <<'EOF'
[Unit]
Description=JARVIS OS stack
# Hermes en Wants (pas Requires) : sa mort n'arrête pas Core / HUD / voicebox.
Wants=jarvis-core.service jarvis-hud.service jarvis-voicebox.service jarvis-hermes.service

[Install]
WantedBy=multi-user.target
EOF
# --- END EMBED ---

# ─── nginx : sert le build du HUD sur 127.0.0.1:8080 ─────────────────────
# Sans lui, jarvis-hud.service lance Chromium sur une URL que personne ne
# sert. La configuration vit dans le dépôt (deploy/nginx/jarvis-hud.conf) et
# est poussée par sync-to-nuc.sh ; on ne la duplique pas ici.
if [[ -d /etc/nginx/conf.d ]]; then
  if [[ -f "${OPT}/share/nginx/jarvis-hud.conf" ]]; then
    install -m 644 "${OPT}/share/nginx/jarvis-hud.conf" /etc/nginx/conf.d/jarvis-hud.conf
    nginx -t >/dev/null 2>&1 && systemctl reload nginx 2>/dev/null || true
    echo "==> nginx : conf HUD installée"
  else
    echo "!! ${OPT}/share/nginx/jarvis-hud.conf absent — lancer sync-to-nuc.sh d'abord"
  fi
else
  echo "!! nginx absent — le HUD ne sera pas servi. Installer : apt install nginx"
fi

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
