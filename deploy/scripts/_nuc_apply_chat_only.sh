#!/usr/bin/env bash
set -euo pipefail
python3 /tmp/_apply_chat_only_env.py
grep -E '^(JARVIS_HERMES_CHAT_ONLY|JARVIS_CHAT_PROVIDER|JARVIS_HERMES_MINIMAL)=' /etc/jarvis/core.env || true
systemctl restart jarvis-hermes jarvis-core
sleep 4
systemctl is-active jarvis-hermes jarvis-core
curl -sf http://127.0.0.1:8642/health | head -c 80
echo
