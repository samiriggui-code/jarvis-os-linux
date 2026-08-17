#!/usr/bin/env python3
"""Inventory HA entities on NUC (read-only). No secrets printed."""
from __future__ import annotations

import json
import os
import urllib.request
from collections import Counter
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


def main() -> int:
    _load_env()
    base = (os.environ.get("JARVIS_HASS_URL") or "http://127.0.0.1:8123").rstrip("/")
    tok = (os.environ.get("JARVIS_HASS_TOKEN") or "").strip()
    if not tok:
        print("FAIL: JARVIS_HASS_TOKEN missing")
        return 1
    req = urllib.request.Request(
        f"{base}/api/states",
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        states = json.loads(r.read().decode())
    c = Counter(s["entity_id"].split(".", 1)[0] for s in states)
    print(f"entities_total {len(states)}")
    print("domains", dict(c.most_common(15)))
    for d in ("light", "switch", "media_player", "cover", "climate", "camera", "binary_sensor"):
        items = [s for s in states if s["entity_id"].startswith(f"{d}.")]
        print(f"--- {d} ({len(items)}) ---")
        for s in items[:8]:
            name = (s.get("attributes") or {}).get("friendly_name") or s["entity_id"]
            print(f"  {s['entity_id']}  state={s.get('state')}  name={name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
