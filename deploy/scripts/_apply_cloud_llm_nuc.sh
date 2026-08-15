#!/usr/bin/env bash
# Bascule Hermes + Core sur OpenRouter (principal) / Nous (fallback si clé présente).
# Retire Ollama de la config. N'exécute pas hermes auth.
set -euo pipefail

HERMES_CFG="/var/lib/jarvis/hermes/config.yaml"
CORE_ENV="/etc/jarvis/core.env"
HERMES_ENV="/etc/jarvis/hermes.env"
TS="$(date +%Y%m%d-%H%M%S)"

OR_MODEL="$(grep -m1 '^JARVIS_OPENROUTER_MODEL=' "$CORE_ENV" 2>/dev/null | cut -d= -f2-)"
OR_MODEL="${OR_MODEL//\"/}"
OR_MODEL="${OR_MODEL//\'/}"
OR_MODEL="${OR_MODEL:-qwen/qwen3.5-flash-02-23}"
NOUS_MODEL="${JARVIS_NOUS_FALLBACK_MODEL:-google/gemini-3-flash-preview}"

echo "== backup =="
cp -a "$HERMES_CFG" "${HERMES_CFG}.bak-${TS}"
cp -a "$CORE_ENV" "${CORE_ENV}.bak-${TS}"
[[ -f "$HERMES_ENV" ]] && cp -a "$HERMES_ENV" "${HERMES_ENV}.bak-${TS}"

echo "== sync LLM keys into hermes.env if missing =="
touch "$HERMES_ENV"
chmod 600 "$HERMES_ENV"
if grep -q '^OPENROUTER_API_KEY=' "$CORE_ENV" && ! grep -q '^OPENROUTER_API_KEY=' "$HERMES_ENV"; then
  grep '^OPENROUTER_API_KEY=' "$CORE_ENV" >> "$HERMES_ENV"
  echo "OPENROUTER_API_KEY copied core.env -> hermes.env"
fi
if grep -q '^NOUS_API_KEY=' "$CORE_ENV" && ! grep -q '^NOUS_API_KEY=' "$HERMES_ENV"; then
  grep '^NOUS_API_KEY=' "$CORE_ENV" >> "$HERMES_ENV"
  echo "NOUS_API_KEY copied core.env -> hermes.env"
fi

echo "== comment Ollama vars in core.env =="
for var in JARVIS_REMOTE_LLM_URL JARVIS_OLLAMA_MODEL OLLAMA_HOST JARVIS_OLLAMA_URL JARVIS_OLLAMA_FIRST; do
  sed -i "s/^${var}=/# ${var} (disabled ${TS})=/" "$CORE_ENV" || true
done

echo "== Hermes model -> openrouter =="
export HERMES_CFG OR_MODEL NOUS_MODEL
python3 << 'PYEOF'
from pathlib import Path
import os
import re

path = Path(os.environ["HERMES_CFG"])
or_model = os.environ["OR_MODEL"]
nous_model = os.environ["NOUS_MODEL"]
core = Path("/etc/jarvis/core.env").read_text() if Path("/etc/jarvis/core.env").is_file() else ""
has_nous_key = "NOUS_API_KEY=" in core and not re.search(r"^NOUS_API_KEY=\s*$", core, re.M)
has_oauth = Path("/var/lib/jarvis/hermes/auth.json").is_file()

block = f"""model:
  provider: openrouter
  default: "{or_model}"
  base_url: ""
"""
if has_nous_key:
    block += f"""
fallback_providers:
  - provider: nous-api
    model: "{nous_model}"
"""
elif has_oauth:
    block += f"""
fallback_providers:
  - provider: nous
    model: "{nous_model}"
"""

text = path.read_text()
text = re.sub(r"^model:\n(?:  .*\n)*", "", text, count=1, flags=re.M)
text = re.sub(r"^fallback_providers:\n(?:  - .*\n)*", "", text, count=1, flags=re.M)
path.write_text(block + "\n" + text.lstrip())
print("Hermes config.yaml updated (nous_fallback=" + str(has_nous_key or has_oauth) + ")")
PYEOF

echo "== disable ollama tunnel =="
systemctl disable --now jarvis-tunnel-ollama.service 2>/dev/null || true

echo "== deploy jarvis-hermes launcher (sources core.env) =="
if [[ -f /opt/jarvis/bin/jarvis-hermes ]]; then
  grep -q 'core.env' /opt/jarvis/bin/jarvis-hermes || sed -i 's/hermes.env"/hermes.env" "${JARVIS_CONFIG_DIR}\/core.env"/' /opt/jarvis/bin/jarvis-hermes || true
fi

echo "== restart services =="
systemctl restart jarvis-hermes jarvis-core

echo "DONE"
