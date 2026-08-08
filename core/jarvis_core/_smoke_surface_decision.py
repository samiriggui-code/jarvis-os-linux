"""Preuve Surface Decision — monitor → SystemMonitor (sans réseau / sans HUD).

    python -m jarvis_core._smoke_surface_decision
"""
from __future__ import annotations

from .surface import SurfaceCatalog, validate_document
from .surface_decision import (
    MONITOR_COMPONENT,
    MONITOR_SURFACE_ID,
    decide_surface_id,
    monitor_document,
)


def check(label: str, cond: bool) -> None:
    status = "OK" if cond else "FAIL"
    print(f"  [{status}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> None:
    print("\n1. decide_surface_id")
    check("core.monitor -> monitor", decide_surface_id(intent="core.monitor") == MONITOR_SURFACE_ID)
    check("system.cpu -> monitor", decide_surface_id(tool="system.cpu") == MONITOR_SURFACE_ID)
    check("core.holomat -> vision", decide_surface_id(intent="core.holomat") == "vision")
    check("web.search -> reach", decide_surface_id(intent="web.search") == "reach")
    check("terminal tool -> terminal", decide_surface_id(tool="terminal") == "terminal")
    check("kanban_create -> mission-control-dev", decide_surface_id(tool="kanban_create") == "mission-control-dev")
    check("core.mission_dev -> mission-control-dev", decide_surface_id(intent="core.mission_dev") == "mission-control-dev")

    print("\n2. document + validate catalogue")
    doc = monitor_document()
    check("surfaces.monitor present", MONITOR_SURFACE_ID in doc.get("surfaces", {}))
    surf = doc["surfaces"][MONITOR_SURFACE_ID]
    cid = surf["root"][0]
    check("composant SystemMonitor", surf["components"][cid]["name"] == MONITOR_COMPONENT)

    catalog = SurfaceCatalog()
    validated = validate_document(
        doc,
        catalog,
        permissions={"system.read"},
        context=set(),
        bindings=None,
    )
    check("validate_document OK", MONITOR_SURFACE_ID in validated["surfaces"])
    print("\nOK — surface decision monitor")


if __name__ == "__main__":
    main()
