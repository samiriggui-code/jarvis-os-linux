"""Smoke P2 HUD — timeline + surface decision étendue (offline)."""
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
    print("P2 HUD — Core contract (offline)")

    from jarvis_core.surface_decision import (
        decide_document,
        decide_surface_id,
        MONITOR_SURFACE_ID,
    )
    from jarvis_core.tool_events import (
        ToolEvent,
        timeline_payload,
    )

    check("monitor intent", decide_surface_id(intent="core.monitor") == MONITOR_SURFACE_ID)
    check("web.search app", decide_surface_id(intent="web.search") == "reach")
    check("holomat app", decide_surface_id(intent="core.holomat") == "vision")
    check("terminal tool", decide_surface_id(tool="terminal") == "terminal")

    doc = decide_document(intent="web.search", tool="web_search", summary="Résultats")
    check("decide_document web", doc is not None and doc[0] == "reach")

    tp = timeline_payload(
        ToolEvent(intent="home.control", stage="completed", owner="core", device_id="nuc-main"),
        route={"host_route_reason": "core_in_process"},
    )
    check("timeline intent event", tp["event"] == "intent.completed")
    check("timeline route", tp.get("route", {}).get("host_route_reason") == "core_in_process")

    from jarvis_core import Orchestrator

    orch = Orchestrator()
    check("handle_tool_timeline", hasattr(orch, "handle_tool_timeline"))

    print("\nP2 HUD Core contract : PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
