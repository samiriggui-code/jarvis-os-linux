#!/usr/bin/env python3
"""Patch Hermes platform_toolsets from Core hermes_toolsets module."""
import os
from pathlib import Path

os.environ.setdefault("JARVIS_CORE_ENV", "/etc/jarvis/core.env")
core_env = Path("/etc/jarvis/core.env")
if core_env.is_file():
    for line in core_env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

import sys
sys.path.insert(0, "/opt/jarvis/core")
from jarvis_core.hermes_toolsets import platform_toolsets_ordered

toolsets = platform_toolsets_ordered()
config = Path("/var/lib/jarvis/hermes/config.yaml")
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
