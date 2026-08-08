"""P2b — split admission + hermes/events (offline).

    python -m jarvis_core._smoke_p2b
"""
from __future__ import annotations

import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    print("P2b — contrat HUD Core (segmentation)")

    from jarvis_core.surfaces.admission import validate_document, SurfaceCatalog
    from jarvis_core.surface import SurfaceBroadcaster, validate_document as vd_shim
    from jarvis_core.hermes.events import map_hermes_run_event

    check("admission module", validate_document is vd_shim)
    check("broadcaster + admission", SurfaceBroadcaster is not None)
    check("hermes events direct", map_hermes_run_event({"event": "run.completed"}) is not None)

    from jarvis_core.surface_decision import decide_surface_id

    check("skills tool → skills", decide_surface_id(tool="skills") == "skills")
    check("agent.tools → outils", decide_surface_id(intent="agent.tools") == "outils")
    check("agent.cron → crons", decide_surface_id(intent="agent.cron") == "crons")

    cat = SurfaceCatalog()
    doc = {
        "surfaces": {
            "main": {
                "root": ["c1"],
                "components": {
                    "c1": {"name": "SystemMonitor", "state": "idle", "props": {}},
                },
            }
        }
    }
    try:
        validate_document(doc, cat, permissions={"system.read"}, context=set())
        check("validate_document via admission", True)
    except Exception as exc:  # noqa: BLE001
        check("validate_document via admission", False)
        print(f"    {exc}")

    print("\nP2b smokes : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
