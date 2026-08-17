#!/usr/bin/env python3
"""Live NUC — gateway smoke : routage intents, Hermes chat, HA (sans action physique)."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

# Charger core.env
for env_path in (Path("/etc/jarvis/core.env"), Path("/opt/jarvis/core/.env")):
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        break

sys.path.insert(0, "/opt/jarvis/core")


def ok(label: str, cond: bool, detail: str = "") -> None:
    mark = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{mark}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    print("NUC live gateway smoke\n")

    # ── 1. Routage intents ───────────────────────────────────────────────
    print("── Routage intents ──")
    from jarvis_core.capabilities import CAPABILITIES, Owner, match_intent, toolsets_for

    holo = match_intent("jarvis holoweb")
    ok("holoweb → web.browse", holo is not None and holo.intent == "web.browse")
    ok("holoweb → Hermes browser", holo is not None and holo.toolset == "browser")
    ok("holoweb → Owner.HERMES", holo is not None and holo.owner is Owner.HERMES)

    lights = match_intent("jarvis allume les lumières du salon")
    ok("lumières → home.control", lights is not None and lights.intent == "home.control")
    ok("lumières → Core", lights is not None and lights.owner is Owner.CORE)
    ok("lumières sans toolset Hermes", lights is not None and not lights.toolset)

    chat_q = match_intent("quelle heure est-il")
    ok("question libre → pas intent", chat_q is None)

    ok("admin a browser", "browser" in toolsets_for("admin"))
    ok("admin sans homeassistant", "homeassistant" not in toolsets_for("admin"))

    # ── 2. Hermes API ────────────────────────────────────────────────────
    print("\n── Hermes API ──")
    url = (os.environ.get("JARVIS_HERMES_URL") or "http://127.0.0.1:8642").rstrip("/")
    key = os.environ.get("JARVIS_HERMES_KEY") or ""
    ok("HERMES_KEY present", bool(key))

    req = urllib.request.Request(
        f"{url}/v1/toolsets",
        headers={"Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())
    rows = data.get("data") if isinstance(data.get("data"), list) else data.get("toolsets", [])
    names = {t.get("name") for t in rows if t.get("name")}
    enabled = {t.get("name") for t in rows if t.get("name") and t.get("enabled", True)}
    ok("toolset browser actif", "browser" in enabled or "browser" in names)
    ok("toolset skills actif", "skills" in enabled or "skills" in names)
    ok("homeassistant désactivé", "homeassistant" not in enabled)
    print(f"    toolsets API: {len(names)} noms, {len(enabled)} enabled")

    # Chat skills court (pas d'action domotique)
    body = json.dumps({
        "input": "Réponds en une phrase : es-tu Hermes et le chat JARVIS fonctionne ?",
        "instructions": "Réponse courte en français, 1 phrase max.",
    }).encode()
    req = urllib.request.Request(
        f"{url}/v1/runs",
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        started = json.loads(resp.read().decode())
    run_id = str(started.get("run_id") or "")
    ok("Hermes run démarré", bool(run_id), run_id[:20])

    final = ""
    deadline = time.time() + 90
    req_ev = urllib.request.Request(
        f"{url}/v1/runs/{run_id}/events",
        headers={"Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req_ev, timeout=95) as resp:
        buf = b""
        while time.time() < deadline:
            chunk = resp.read(4096)
            if not chunk:
                break
            buf += chunk
            while b"\n\n" in buf:
                block, buf = buf.split(b"\n\n", 1)
                for line in block.decode("utf-8", errors="replace").splitlines():
                    if not line.startswith("data:"):
                        continue
                    try:
                        ev = json.loads(line[5:].strip())
                    except json.JSONDecodeError:
                        continue
                    if ev.get("event") in ("run.completed", "run.failed"):
                        final = str(ev.get("output") or ev.get("error") or "")[:300]
                        deadline = 0
                        break
                    if ev.get("type") == "message" and ev.get("role") == "assistant":
                        final = str(ev.get("content") or final)[:300]
    ok("Hermes chat réponse", len(final.strip()) > 5, final[:120].replace("\n", " "))
    print(f"    réponse: {final[:160]}")

    # ── 3. Home Assistant (lecture seule) ────────────────────────────────
    print("\n── Home Assistant (lecture) ──")
    hass_url = (os.environ.get("JARVIS_HASS_URL") or "http://127.0.0.1:8123").rstrip("/")
    token = os.environ.get("JARVIS_HASS_TOKEN") or ""
    ok("HASS_TOKEN present", bool(token))

    req_ha = urllib.request.Request(
        f"{hass_url}/api/",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req_ha, timeout=10) as resp:
            ha_info = json.loads(resp.read().decode())
        ok("HA API joignable", ha_info.get("message") == "API running.")
        print(f"    HA @ {hass_url}")
    except urllib.error.URLError as exc:
        ok("HA API joignable", False, str(exc)[:80])

    from jarvis_core.gateway import chat_provider_mode, assert_prod_hermes_boundary

    ok("chat provider hermes", chat_provider_mode() == "hermes")
    violations = assert_prod_hermes_boundary()
    ok("boundary Core/Hermes", not violations, str(violations)[:100])

    print("\nNUC live gateway smoke : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
