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

for skill in jarvis-os family-enroll; do
  mkdir -p "$HERMES_HOME/skills/$skill"
  cp -a "$SRC/skills/$skill/." "$HERMES_HOME/skills/$skill/"
  echo "skill $skill → $HERMES_HOME/skills/$skill"
done

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
if [[ -f "$CFG" ]]; then
  if ! grep -q "JARVIS OS (seed-hermes" "$CFG" 2>/dev/null; then
    cat >> "$CFG" <<EOF

# --- JARVIS OS (seed-hermes-consciousness) ---
# skills:
#   external_dirs:
#     - "$EXT"
EOF
  fi
else
  cat > "$CFG" <<EOF
skills:
  external_dirs:
    - "$EXT"
EOF
fi

echo "OK — HERMES_HOME=$HERMES_HOME"
