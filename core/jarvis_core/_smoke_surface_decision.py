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
    check("autre intent -> None", decide_surface_id(intent="core.holomat") is None)
    check("autre tool -> None", decide_surface_id(tool="terminal") is None)

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
