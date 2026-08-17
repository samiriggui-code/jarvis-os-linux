#!/usr/bin/env bash
# Retire skills dupliqués (local + seed external_dirs) et le catalogue upstream Hermes
# (apple, github, media…) qui gonfle l'index skills à chaque run api_server.
set -eu

LOCAL=/var/lib/jarvis/hermes/skills
SEED=/opt/jarvis/seed/deploy/hermes/skills
DUPS=(
  agent-reach deep-research ecosystem-hosts family-enroll
  hud-apps jarvis-memory jarvis-os user-locale
)

# Upstream Hermes category packs — hors périmètre JARVIS (external_dirs = seed JARVIS)
UPSTREAM=(
  apple autonomous-ai-agents creative email github media mlops
  note-taking productivity research smart-home social-media software-development
)

for name in "${DUPS[@]}"; do
  if [[ -d "$LOCAL/$name" && -d "$SEED/$name" ]]; then
    rm -rf "$LOCAL/$name"
    echo "removed duplicate skill: $name"
  fi
done

for name in "${UPSTREAM[@]}"; do
  if [[ -d "$LOCAL/$name" ]]; then
    rm -rf "$LOCAL/$name"
    echo "removed upstream skill: $name"
  fi
done

echo "OK skills dedupe (local=$(find "$LOCAL" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l) dirs, seed external_dirs=$SEED)"
