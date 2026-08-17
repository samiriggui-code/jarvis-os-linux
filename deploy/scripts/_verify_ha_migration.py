#!/usr/bin/env python3
"""Vérif HA NUC + Pi après migration."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

for p in (Path("/etc/jarvis/core.env"),):
    if p.is_file():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

token = os.environ.get("JARVIS_HASS_TOKEN", "")
nuc = os.environ.get("JARVIS_HASS_URL", "http://127.0.0.1:8123").rstrip("/")
pi = "http://192.168.1.27:8123"


def probe(label: str, url: str) -> None:
    try:
        req = urllib.request.Request(f"{url}/api/", headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read().decode())
        print(f"[OK] {label}: {data.get('message', data)}")
        req2 = urllib.request.Request(f"{url}/api/states", headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req2, timeout=15) as r2:
            states = json.loads(r2.read().decode())
        print(f"     {label} entities: {len(states)}")
    except urllib.error.HTTPError as e:
        print(f"[HTTP {e.code}] {label} — token Pi invalide sur NUC HA (recréer token)")
    except Exception as exc:
        print(f"[DOWN] {label}: {exc}")


print(f"JARVIS_HASS_URL={nuc}")
probe("NUC HA", nuc)
probe("Pi HA (doit DOWN après cleanup)", pi)
