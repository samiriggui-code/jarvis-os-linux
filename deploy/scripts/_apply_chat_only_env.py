#!/usr/bin/env python3
"""Apply JARVIS_HERMES_CHAT_ONLY=1 on NUC core.env."""
from pathlib import Path

path = Path("/etc/jarvis/core.env")
lines = path.read_text(encoding="utf-8").splitlines()
drop = {
    "JARVIS_HERMES_FULL",
    "JARVIS_HERMES_MINIMAL",
    "JARVIS_HERMES_TOOLSETS_ENABLED",
}
set_keys = {
    "JARVIS_HERMES_CHAT_ONLY": "1",
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
    if k in drop:
        continue
    if k in set_keys:
        out.append(f"{k}={set_keys[k]}")
        seen.add(k)
    else:
        out.append(line)
        seen.add(k)
for k, v in set_keys.items():
    if k not in seen:
        out.append(f"{k}={v}")
path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
print("core.env chat-only OK")
