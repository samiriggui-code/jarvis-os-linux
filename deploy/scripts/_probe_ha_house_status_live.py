#!/usr/bin/env python3
"""Live proof: Core house_status against NUC HA (read-only)."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path


def _load_env(path: str = "/etc/jarvis/core.env") -> None:
    p = Path(path)
    if not p.is_file():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


async def main() -> int:
    _load_env()
    sys.path.insert(0, "/opt/jarvis/core")
    from jarvis_core.homeassistant import HomeAssistantAdapter

    hass = HomeAssistantAdapter()
    if not hass.configured:
        print("FAIL: not configured")
        return 1
    status = await hass.house_status()
    print("total", status.get("total"))
    print("light_count", (status.get("counts") or {}).get("light", 0))
    print("speech", status.get("speech"))
    print("rows", len(status.get("rows") or []))
    for row in (status.get("rows") or [])[:8]:
        print(" ", row)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
