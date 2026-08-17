"""P3 — tuiles restantes : missions, vps.code, HA parsing, Spotify gate."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    print("P3 — tuiles Core restantes")

    from jarvis_core import Orchestrator
    from jarvis_core.capabilities import CAPABILITIES
    from jarvis_core.homeassistant import _action_of, _domain_of, _fold
    from jarvis_core.missions import MissionStore
    from jarvis_core.surface_decision import decide_surface_id

    orch = Orchestrator()
    check("core.missions registered", "core.missions" in orch.intents.actions)
    check("vps.code registered", "vps.code" in orch.intents.actions)
    check("core.missions available", CAPABILITIES["objectifs"].available)
    check("vps.code available", CAPABILITIES["code"].available)
    check("media.music absent (Spotify retiré)", "music" not in CAPABILITIES)

    with tempfile.TemporaryDirectory() as tmp:
        store = MissionStore(path=Path(tmp) / "missions.json")
        m1 = store.add("Finir P3", user_id="u1")
        m2 = store.add("Tester NUC", user_id="u1")
        check("missions add", m1.status == "open")
        open_list = store.list_missions(user_id="u1", include_done=False)
        check("missions list open", len(open_list) == 2)
        done = store.complete("Finir", user_id="u1")
        check("missions complete", done is not None and done.status == "done")
        check("missions one open left", len(store.list_missions(user_id="u1", include_done=False)) == 1)

    check("HA fold accent", "sejour" in _fold("Séjour"))
    check("HA domain light", _domain_of(_fold("allume la lumière du salon")) == "light")
    check("HA action on", _action_of(_fold("allume le salon")) == "on")

    check("surface missions", decide_surface_id(intent="core.missions") == "objectifs")
    check("surface vps.code", decide_surface_id(intent="vps.code") == "code")

    print("\nP3 smokes : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
