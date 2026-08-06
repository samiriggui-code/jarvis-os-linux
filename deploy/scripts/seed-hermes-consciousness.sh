#!/usr/bin/env bash
# Seed conscience JARVIS → HERMES_HOME
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/deploy/hermes"
HERMES_HOME="${HERMES_HOME:-${HOME}/.hermes}"
FORCE_SOUL="${1:-}"

mkdir -p "$HERMES_HOME/skills" "$HERMES_HOME/memories"

if [[ ! -f "$HERMES_HOME/SOUL.md" || "$FORCE_SOUL" == "--force-soul" ]]; then
  cp "$SRC/SOUL.md" "$HERMES_HOME/SOUL.md"
  echo "SOUL.md → $HERMES_HOME/SOUL.md"
else
  echo "SOUL.md inchangé (passe --force-soul pour écraser)"
fi

# Tous les skills produit sous deploy/hermes/skills/
if [[ -d "$SRC/skills" ]]; then
  for skill_dir in "$SRC/skills"/*; do
    [[ -d "$skill_dir" ]] || continue
    skill="$(basename "$skill_dir")"
    mkdir -p "$HERMES_HOME/skills/$skill"
    cp -a "$skill_dir/." "$HERMES_HOME/skills/$skill/"
    echo "skill $skill → $HERMES_HOME/skills/$skill"
  done
fi

if [[ ! -f "$HERMES_HOME/memories/MEMORY.md" || "$FORCE_SOUL" == "--force-soul" ]]; then
  cp "$SRC/memories/MEMORY.md" "$HERMES_HOME/memories/MEMORY.md"
else
  if ! grep -q "JARVIS OS" "$HERMES_HOME/memories/MEMORY.md" 2>/dev/null; then
    echo "" >> "$HERMES_HOME/memories/MEMORY.md"
    cat "$SRC/memories/MEMORY.md" >> "$HERMES_HOME/memories/MEMORY.md"
  fi
fi

EXT="$SRC/skills"
CFG="$HERMES_HOME/config.yaml"

# L'API :8642 n'a PAS besoin de ce fichier : `API_SERVER_ENABLED` +
# `API_SERVER_KEY` dans /etc/jarvis/hermes.env suffisent à enrôler la
# plateforme (gateway/config.py). Le YAML n'est là que pour rendre le réglage
# lisible — d'où la prudence ci-dessous sur une config existante.
if [[ -f "$CFG" ]]; then
  if ! grep -q "JARVIS OS (seed-hermes" "$CFG" 2>/dev/null; then
    cat >> "$CFG" <<EOF

# --- JARVIS OS (seed-hermes-consciousness) ---
# Rien n'est activé ici : une config existante a déjà ses propres blocs, et
# réécrire « platforms: » ou « skills: » écraserait les autres plateformes
# (YAML : à clé dupliquée, la dernière gagne). À fusionner À LA MAIN.
#
# API locale pour le Core — forme IMBRIQUÉE obligatoire :
# platforms:
#   api_server:
#     enabled: true
#     extra:
#       host: "127.0.0.1"
#       port: 8642
#
# gateway:
#   api_server:
#     max_concurrent_runs: 5
#
# skills:
#   external_dirs:
#     - "$EXT"
EOF
    echo "consignes de fusion → $CFG (rien d'écrasé)"
  fi
  if ! grep -q "api_server" "$CFG" 2>/dev/null; then
    echo "⚠ config.yaml sans api_server — l'API :8642 dépend alors uniquement"
    echo "  de /etc/jarvis/hermes.env (API_SERVER_ENABLED + API_SERVER_KEY)."
  fi
else
  cat > "$CFG" <<EOF
# API locale pour le Core (JARVIS_HERMES_URL → :8642).
# La clé vit dans /etc/jarvis/hermes.env, jamais ici.
platforms:
  api_server:
    enabled: true
    extra:
      host: "127.0.0.1"
      port: 8642

gateway:
  api_server:
    max_concurrent_runs: 5

skills:
  external_dirs:
    - "$EXT"
EOF
  echo "config.yaml créé → $CFG"
fi

echo "OK — HERMES_HOME=$HERMES_HOME"
echo "    Prod NUC : HERMES_HOME=/var/lib/jarvis/hermes systemctl enable --now jarvis-hermes"
echo "    Vérifier : curl -sS http://127.0.0.1:8642/health"
