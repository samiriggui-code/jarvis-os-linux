#!/usr/bin/env bash
# One-shot NUC: core.env FULL Hermes + platform_toolsets + restart + smoke
set -euo pipefail

CORE="${JARVIS_CORE_ENV:-/etc/jarvis/core.env}"
cp "$CORE" "${CORE}.bak-$(date +%Y%m%d-%H%M%S)"

python3 <<'PY'
from pathlib import Path

path = Path("/etc/jarvis/core.env")
lines = path.read_text(encoding="utf-8").splitlines()
keys_drop = {
    "JARVIS_HERMES_TOOLSETS_ENABLED",
    "JARVIS_HERMES_TOOLSET_BROWSER",
    "JARVIS_HERMES_TOOLSET_FILE",
    "JARVIS_HERMES_TOOLSET_TERMINAL",
}
keys_set = {
    "JARVIS_HERMES_FULL": "1",
    "JARVIS_CHAT_PROVIDER": "hermes",
    "JARVIS_HERMES_TIMEOUT": "120",
}
out: list[str] = []
seen: set[str] = set()
for line in lines:
    if not line.strip() or line.lstrip().startswith("#"):
        out.append(line)
        continue
    if "=" not in line:
        out.append(line)
        continue
    k = line.split("=", 1)[0].strip()
    if k in keys_drop:
        continue
    if k in keys_set:
        out.append(f"{k}={keys_set[k]}")
        seen.add(k)
    else:
        out.append(line)
        seen.add(k)
for k, v in keys_set.items():
    if k not in seen:
        out.append(f"{k}={v}")
path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
print("core.env patched OK")
PY

grep -E '^(JARVIS_HERMES_FULL|JARVIS_CHAT_PROVIDER|JARVIS_HERMES_TIMEOUT)=' "$CORE"

export PYTHONPATH=/opt/jarvis/core
sed -i 's/\r$//' /tmp/_apply_hermes_toolsets_nuc.sh
chmod +x /tmp/_apply_hermes_toolsets_nuc.sh
bash /tmp/_apply_hermes_toolsets_nuc.sh

systemctl restart jarvis-core
sleep 3
systemctl is-active jarvis-core jarvis-hermes

cd /opt/jarvis/core
PYTHONPATH=/opt/jarvis/core python3 -m jarvis_core._smoke_hermes_toolset_rollout
echo "NUC Hermes FULL push OK"
