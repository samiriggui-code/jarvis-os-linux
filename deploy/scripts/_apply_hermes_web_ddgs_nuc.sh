#!/usr/bin/env bash
# Active web_search via DDGS (DuckDuckGo, gratuit) sur Hermes NUC — sans clé API.
set -euo pipefail
CONFIG="${HERMES_HOME:-/var/lib/jarvis/hermes}/config.yaml"
VENV="${HERMES_VENV:-/opt/jarvis/hermes-agent/.venv}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ ! -f "$CONFIG" ]]; then
  echo "config absent: $CONFIG" >&2
  exit 1
fi

cp "$CONFIG" "${CONFIG}.bak-${STAMP}"
echo "backup: ${CONFIG}.bak-${STAMP}"

python3 <<'PY'
from pathlib import Path

config = Path("/var/lib/jarvis/hermes/config.yaml")
lines = config.read_text(encoding="utf-8").splitlines()
out: list[str] = []
in_web = False
web_indent = 0
has_search_backend = False
inserted = False

for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith("web:") and not line.startswith(" "):
        in_web = True
        web_indent = len(line) - len(line.lstrip())
        out.append(line)
        continue
    if in_web:
        cur_indent = len(line) - len(line.lstrip()) if line.strip() else web_indent + 2
        if line.strip() and cur_indent <= web_indent and not stripped.startswith("#"):
            if not has_search_backend and not inserted:
                out.append(f"{' ' * (web_indent + 2)}search_backend: ddgs")
                inserted = True
            in_web = False
        elif stripped.startswith("search_backend:"):
            out.append(f"{' ' * (web_indent + 2)}search_backend: ddgs")
            has_search_backend = True
            inserted = True
            continue
    out.append(line)

if not inserted and not has_search_backend:
    if out and out[-1].strip():
        out.append("")
    out.append("web:")
    out.append("  search_backend: ddgs")
    inserted = True

config.write_text("\n".join(out) + "\n", encoding="utf-8")
print("OK config web.search_backend=ddgs")
PY

if [[ ! -x "${VENV}/bin/pip" ]]; then
  echo "venv pip absent: ${VENV}/bin/pip" >&2
  exit 1
fi

"${VENV}/bin/pip" install -q 'ddgs>=9.0'
echo "OK pip ddgs"

systemctl restart jarvis-hermes
sleep 4

if curl -sf http://127.0.0.1:8642/health >/dev/null; then
  echo "OK hermes health"
else
  echo "WARN hermes health check failed" >&2
  exit 1
fi

if [[ -d /opt/jarvis/hermes-agent ]]; then
  (
    cd /opt/jarvis/hermes-agent
    "${VENV}/bin/python" -m tools.web_tools 2>&1 | head -8
  ) || true
fi

grep -A3 '^web:' "$CONFIG" || true
