#!/usr/bin/env bash
# web_extract via Firecrawl — NUC Hermes.
# Prérequis : FIRECRAWL_API_KEY dans /etc/jarvis/hermes.env (chmod 600).
# Search reste DDGS (web.search_backend) ; extract = backend séparé.
set -euo pipefail

CONFIG="${HERMES_HOME:-/var/lib/jarvis/hermes}/config.yaml"
ENV_FILE="${JARVIS_CONFIG_DIR:-/etc/jarvis}/hermes.env"
VENV="${HERMES_VENV:-/opt/jarvis/hermes-agent/.venv}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ ! -f "$CONFIG" ]]; then
  echo "config absent: $CONFIG" >&2
  exit 1
fi

if [[ ! -x "${VENV}/bin/pip" ]]; then
  echo "venv pip absent: ${VENV}/bin/pip" >&2
  exit 1
fi

# Charge clé sans l'afficher
set -a
# shellcheck disable=SC1090
[[ -f "$ENV_FILE" ]] && . "$ENV_FILE"
set +a

if [[ -z "${FIRECRAWL_API_KEY:-}" ]]; then
  echo "WARN: FIRECRAWL_API_KEY absente de ${ENV_FILE} — pip seulement, pas de config." >&2
  "${VENV}/bin/pip" install -q 'firecrawl-py>=1.0'
  echo "OK pip firecrawl-py (ajoute FIRECRAWL_API_KEY puis relance pour activer extract)"
  exit 0
fi

cp "$CONFIG" "${CONFIG}.bak-${STAMP}"
echo "backup: ${CONFIG}.bak-${STAMP}"

"${VENV}/bin/pip" install -q 'firecrawl-py>=1.0'
echo "OK pip firecrawl-py"

python3 <<'PY'
from pathlib import Path

config = Path("/var/lib/jarvis/hermes/config.yaml")
lines = config.read_text(encoding="utf-8").splitlines()
out: list[str] = []
in_web = False
web_indent = 0
has_extract = False

for line in lines:
    stripped = line.strip()
    if stripped.startswith("web:") and not line.startswith(" "):
        in_web = True
        web_indent = len(line) - len(line.lstrip())
        out.append(line)
        continue
    if in_web:
        cur_indent = len(line) - len(line.lstrip()) if line.strip() else web_indent + 2
        if line.strip() and cur_indent <= web_indent and not stripped.startswith("#"):
            if not has_extract:
                out.append(f"{' ' * (web_indent + 2)}extract_backend: firecrawl")
            in_web = False
        elif stripped.startswith("extract_backend:"):
            out.append(f"{' ' * (web_indent + 2)}extract_backend: firecrawl")
            has_extract = True
            continue
    out.append(line)

if not has_extract:
    if out and out[-1].strip():
        out.append("")
    if not any(l.strip() == "web:" for l in out):
        out.append("web:")
        out.append("  search_backend: ddgs")
    out.append("  extract_backend: firecrawl")

config.write_text("\n".join(out) + "\n", encoding="utf-8")
print("OK config web.extract_backend=firecrawl")
PY

systemctl restart jarvis-hermes
sleep 4

if curl -sf http://127.0.0.1:8642/health >/dev/null; then
  echo "OK hermes health"
else
  echo "WARN hermes health check failed" >&2
  exit 1
fi

(
  cd /opt/jarvis/hermes-agent
  HERMES_HOME=/var/lib/jarvis/hermes "${VENV}/bin/python" /opt/jarvis/seed/deploy/scripts/_smoke_web_extract_nuc.py
) || true

grep -A5 '^web:' "$CONFIG" || true
