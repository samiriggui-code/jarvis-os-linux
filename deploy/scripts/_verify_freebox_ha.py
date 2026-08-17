#!/usr/bin/env python3
"""Test live Freebox via Home Assistant (NUC).

Lecture toujours. Écriture (turn_on / Netflix) seulement si --play.
Jamais de toggle Wi-Fi.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
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


def _api(base: str, token: str, method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{base}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else []
    except urllib.error.HTTPError as exc:
        return exc.code, {"error": exc.read().decode(errors="replace")[:400]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--play", action="store_true", help="turn_on + Netflix si lecteur joignable")
    args = parser.parse_args()

    _load_env()
    base = (os.environ.get("JARVIS_HASS_URL") or "http://127.0.0.1:8123").rstrip("/")
    token = (os.environ.get("JARVIS_HASS_TOKEN") or "").strip()
    if not token:
        print("FAIL: JARVIS_HASS_TOKEN missing")
        return 1

    code, states = _api(base, token, "GET", "/api/states")
    if code != 200 or not isinstance(states, list):
        print("FAIL: HA states", code, states)
        return 1

    fb = [
        s
        for s in states
        if isinstance(s, dict)
        and (
            "freebox" in str(s.get("entity_id") or "").lower()
            or "freebox" in str((s.get("attributes") or {}).get("friendly_name") or "").lower()
        )
    ]
    print(f"=== Freebox HA ({len(fb)} entités) ===")
    live = 0
    dead = 0
    players: list[dict] = []
    for s in sorted(fb, key=lambda x: str(x.get("entity_id"))):
        eid = str(s.get("entity_id"))
        st = str(s.get("state"))
        name = (s.get("attributes") or {}).get("friendly_name") or eid
        mark = "LIVE" if st not in ("unavailable", "unknown") else "DEAD"
        if mark == "LIVE":
            live += 1
        else:
            dead += 1
        print(f"  [{mark}] {eid} = {st}  ({name})")
        if eid.startswith("media_player."):
            attrs = s.get("attributes") or {}
            feat = int(attrs.get("supported_features") or 0)
            srcs = attrs.get("source_list") or []
            print(f"         features_bitmask={feat} sources={len(srcs)}")
            players.append(s)

    print(f"\nlive={live} dead={dead}")

    # Cible Core : androidtv_remote (pop_2), pas le doublon freebox.
    preferred = "media_player.freebox_player_pop_2"
    chosen = next((p for p in players if p.get("entity_id") == preferred), None)
    if chosen is None and players:
        chosen = players[0]
    if chosen is None:
        print("FAIL: aucun media_player Freebox")
        return 1

    eid = str(chosen.get("entity_id"))
    st = str(chosen.get("state"))
    print(f"\ncible={eid} state={st}")

    if not args.play:
        print("SKIP play — relancer avec --play pour turn_on / Netflix")
        return 0 if live else 1

    if "wifi" in eid.lower() or eid.startswith("switch."):
        print("REFUS: pas de toggle Wi-Fi")
        return 1

    print(f"POST media_player.turn_on {eid}")
    code, out = _api(
        base,
        token,
        "POST",
        "/api/services/media_player/turn_on",
        {"entity_id": eid},
    )
    print(f"  http={code}")
    if code >= 400:
        print("FAIL turn_on", out)
        return 1

    # Relire l'état
    code, after = _api(base, token, "GET", f"/api/states/{eid}")
    if isinstance(after, dict):
        print(f"  state_after={after.get('state')}")

    srcs = (chosen.get("attributes") or {}).get("source_list") or []
    netflix = next((s for s in srcs if str(s).lower() == "netflix"), None)
    if netflix:
        print(f"POST select_source Netflix")
        code, out = _api(
            base,
            token,
            "POST",
            "/api/services/media_player/select_source",
            {"entity_id": eid, "source": netflix},
        )
        print(f"  http={code} source={netflix}")
    else:
        print("POST play_media Netflix (pas de source_list)")
        code, out = _api(
            base,
            token,
            "POST",
            "/api/services/media_player/play_media",
            {
                "entity_id": eid,
                "media_content_type": "app",
                "media_content_id": "com.netflix.ninja",
            },
        )
        print(f"  http={code}")

    if code >= 400:
        print("FAIL app launch", out)
        return 1
    print("Freebox HA play: OK (HA a accepté — vérifier l'écran salon)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
