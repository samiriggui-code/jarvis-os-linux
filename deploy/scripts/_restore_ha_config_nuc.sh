#!/usr/bin/env bash
set -euo pipefail
cd /opt/jarvis/homeassistant
docker compose down
if [[ -d config && ! -d config.pi-migrated.bak ]]; then
  mv config "config.nuc-fresh.bak.$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p config
tar xzf /tmp/ha-config.tgz -C .
docker compose up -d
echo "HA restored from Pi config — waiting 20s"
sleep 20
python3 /tmp/_verify_ha_migration.py
