#!/usr/bin/env python3
"""Live: lance Netflix (ou --prime) sur Apple TV chambre via Core HA adapter."""
from __future__ import annotations

import argparse
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--prime", action="store_true")
    parser.add_argument("--dry", action="store_true", help="resolve only, no HA write")
    args = parser.parse_args()
    _load_env()
    sys.path.insert(0, "/opt/jarvis/core")
    from jarvis_core.homeassistant import HomeAssistantAdapter

    hass = HomeAssistantAdapter()
    phrase = "lance prime video chambre" if args.prime else "lance netflix chambre"
    targets = await hass.resolve_streaming(phrase)
    print("phrase", phrase)
    print("targets", [(e.entity_id, e.state, e.name) for e in targets])
    if args.dry:
        return 0
    result = await hass.execute_streaming(phrase)
    print("result", {k: result.get(k) for k in ("ok", "entity_id", "service", "source", "label", "reason")})
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
