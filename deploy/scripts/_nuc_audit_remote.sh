#!/usr/bin/env bash
# Audit NUC — Hermes / Voicebox / Ollama + inventaire cleanup
set -euo pipefail

echo "========== HERMES CONFIG (extrait) =========="
if [[ -f /var/lib/jarvis/hermes/config.yaml ]]; then
  grep -E 'model:|base_url|platform_toolsets|api_server|external_dirs|enabled:' /var/lib/jarvis/hermes/config.yaml | head -60
else
  echo "config.yaml ABSENT"
fi

echo
echo "========== HERMES ENV (noms de cles seulement) =========="
if [[ -f /etc/jarvis/hermes.env ]]; then
  grep -E '^[A-Z_][A-Z0-9_]*=' /etc/jarvis/hermes.env | cut -d= -f1 | sort
else
  echo "hermes.env ABSENT"
fi

echo
echo "========== CORE .env (noms de cles seulement) =========="
if [[ -f /opt/jarvis/core/.env ]]; then
  grep -E '^[A-Z_][A-Z0-9_]*=' /opt/jarvis/core/.env | cut -d= -f1 | sort
else
  echo "core/.env ABSENT"
fi

echo
echo "========== HERMES TOOLSETS (auth via hermes CLI si dispo) =========="
if command -v hermes >/dev/null 2>&1; then
  hermes toolsets 2>/dev/null | head -40 || echo "hermes toolsets cmd failed"
else
  echo "sans auth: curl public health OK; toolsets necessitent cle API (voir Dashboard hermes_status)"
  curl -s -m 5 -o /dev/null -w "toolsets_http=%{http_code}\n" http://127.0.0.1:8642/v1/toolsets
fi

echo
echo "========== VOICEBOX PROFILES =========="
curl -s -m 10 http://127.0.0.1:17600/profiles | head -c 1500
echo

echo
echo "========== OLLAMA CHAT TEST =========="
curl -s -m 20 http://127.0.0.1:11435/api/chat -d '{"model":"llama3.1:8b","stream":false,"messages":[{"role":"user","content":"ping"}]}' | head -c 300
echo

echo
echo "========== SKILLS HERMES =========="
find /var/lib/jarvis/hermes -name 'SKILL.md' 2>/dev/null | head -20

echo
echo "========== DISK /opt/jarvis =========="
du -sh /opt/jarvis/* 2>/dev/null | sort -h

echo
echo "========== ARBO /opt/jarvis =========="
ls -la /opt/jarvis/
for d in hud dashboard core setup share bin hermes-agent; do
  echo "--- $d ---"
  ls -la "/opt/jarvis/$d" 2>/dev/null | head -15 || echo "(absent)"
done

echo
echo "========== HUD dist =========="
ls -la /opt/jarvis/hud/dist/ 2>/dev/null | head -10
if [[ -d /opt/jarvis/hud/dist/assets ]]; then
  echo "assets_count=$(find /opt/jarvis/hud/dist/assets -type f | wc -l)"
fi

echo
echo "========== CANDIDATS CLEANUP =========="
find /opt/jarvis -maxdepth 3 -type d \( -name vendor -o -name node_modules -o -name src -o -name .git \) 2>/dev/null
ls -la /tmp/index-* /tmp/jarvis-* /tmp/huddeploy 2>/dev/null | head -15 || true

echo
echo "========== NGINX =========="
grep -E 'root |alias |proxy_pass' /etc/nginx/conf.d/jarvis*.conf 2>/dev/null | head -20

echo "AUDIT DONE"
