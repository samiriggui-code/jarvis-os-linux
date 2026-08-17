#!/usr/bin/env bash
# Plafond toolsets Hermes api_server — tout sauf homeassistant (lit core.env).
set -euo pipefail

CONFIG="${HERMES_HOME:-/var/lib/jarvis/hermes}/config.yaml"
CORE_ENV="${JARVIS_CORE_ENV:-/etc/jarvis/core.env}"
STAMP="$(date +%Y%m%d-%H%M%S)"
cp "$CONFIG" "${CONFIG}.bak-${STAMP}"

export JARVIS_CORE_ENV="$CORE_ENV"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PYTHONPATH="${ROOT}/core${PYTHONPATH:+:$PYTHONPATH}"

python3 <<'PY'
import os
from pathlib import Path

core_env = Path(os.environ.get("JARVIS_CORE_ENV", "/etc/jarvis/core.env"))
if core_env.is_file():
    for line in core_env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

from jarvis_core.hermes_toolsets import platform_toolsets_ordered

toolsets = platform_toolsets_ordered()
if "homeassistant" in toolsets:
    raise SystemExit("homeassistant must not be in platform toolsets")

config = Path(os.environ.get("HERMES_CONFIG", "/var/lib/jarvis/hermes/config.yaml"))
text = config.read_text(encoding="utf-8")
start = text.find("platform_toolsets:")
if start < 0:
    raise SystemExit("platform_toolsets: absent")

rest = text[start:]
end = len(rest)
for line in rest.splitlines()[1:]:
    if line and not line.startswith(" ") and not line.startswith("#"):
        end = rest.index(line)
        break

lines = ["platform_toolsets:", "  api_server:"]
lines.extend(f"    - {t}" for t in toolsets)
new_block = "\n".join(lines) + "\n"
config.write_text(text[:start] + new_block + rest[end:], encoding="utf-8")
print(f"OK platform_toolsets ({len(toolsets)}):", ", ".join(toolsets))
PY

grep -A40 '^platform_toolsets:' "$CONFIG"
systemctl restart jarvis-hermes
sleep 3
systemctl is-active jarvis-hermes
