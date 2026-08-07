"""Surface Decision — preuve verticale ToolEvent → SURFACE_SNAPSHOT.

Une seule règle pour l'instant :

    intent == core.monitor  OU  tool ∈ {system.cpu, system.memory, system.disk}
        → surface_id = "monitor"
        → composant catalogue SystemMonitor

Pas de nouveau protocole WS : le Core réutilise `SurfaceBroadcaster.snapshot`
et `hud_command open_space`, comme `_publish_result_surface` / camera view.

Le HUD (`AgentSurface`) n'est pas modifié : il écoute déjà SURFACE_SNAPSHOT
sur `surface_id == app.id` (`monitor` dans le catalogue).
"""

from __future__ import annotations

from typing import Any

# app_id catalogue HUD / Capability.app_id — pas "system.monitor".
MONITOR_SURFACE_ID = "monitor"
MONITOR_COMPONENT = "SystemMonitor"

MONITOR_INTENT = "core.monitor"
MONITOR_TOOLS = frozenset({
    "system.cpu",
    "system.memory",
    "system.disk",
    "system.processes",
})


def decide_surface_id(*, intent: str | None = None, tool: str | None = None) -> str | None:
    """Retourne un `surface_id` (= app_id) ou None si aucune règle ne match."""
    if intent and str(intent).strip() == MONITOR_INTENT:
        return MONITOR_SURFACE_ID
    tool_name = str(tool or "").strip()
    if tool_name in MONITOR_TOOLS:
        return MONITOR_SURFACE_ID
    return None


def monitor_document() -> dict[str, Any]:
    """Document de surface admissible — SystemMonitor (props vides, lit ses bindings)."""
    cid = "mon-main"
    return {
        "surfaces": {
            MONITOR_SURFACE_ID: {
                "root": [cid],
                "components": {
                    cid: {
                        "name": MONITOR_COMPONENT,
                        "props": {},
                        "state": "idle",
                    }
                },
            }
        }
    }
