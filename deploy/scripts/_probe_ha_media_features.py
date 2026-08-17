#!/usr/bin/env python3
"""Read-only: media_player features + streaming readiness (no play_media)."""
from __future__ import annotations

import json
import os
import urllib.request
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


# HA media_player supported_features bits (subset)
FEATS = {
    1: "pause",
    2: "seek",
    4: "volume_set",
    8: "volume_mute",
    16: "previous",
    32: "next",
    128: "turn_on",
    256: "turn_off",
    512: "play_media",
    16384: "select_source",
    32768: "stop",
    65536: "clear_playlist",
    131072: "play",
    1048576: "browse_media",
}


def main() -> int:
    _load_env()
    base = (os.environ.get("JARVIS_HASS_URL") or "http://127.0.0.1:8123").rstrip("/")
    tok = os.environ["JARVIS_HASS_TOKEN"]
    req = urllib.request.Request(
        f"{base}/api/states",
        headers={"Authorization": f"Bearer {tok}"},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        states = json.loads(r.read().decode())

    print("=== media_player (controllable path) ===")
    for s in states:
        eid = s.get("entity_id") or ""
        if not eid.startswith("media_player."):
            continue
        attrs = s.get("attributes") or {}
        feat = int(attrs.get("supported_features") or 0)
        names = [n for bit, n in FEATS.items() if feat & bit]
        srcs = attrs.get("source_list") or []
        print(f"\n{eid}")
        print(f"  state={s.get('state')}  name={attrs.get('friendly_name')}")
        print(f"  features={names or ['(none)']}")
        if srcs:
            print(f"  sources({len(srcs)}): {', '.join(str(x) for x in srcs[:20])}")
            for key in ("Netflix", "Prime", "Amazon", "Disney", "YouTube", "Plex"):
                hits = [x for x in srcs if key.lower() in str(x).lower()]
                if hits:
                    print(f"  match {key}: {hits}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
