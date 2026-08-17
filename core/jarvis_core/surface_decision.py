"""Surface Decision — ToolEvent / intent → SURFACE_SNAPSHOT (Phase 6 / P2 HUD)."""
from __future__ import annotations

from typing import Any

MONITOR_SURFACE_ID = "monitor"
MONITOR_COMPONENT = "SystemMonitor"
MONITOR_INTENT = "core.monitor"
MONITOR_TOOLS = frozenset({
    "system.cpu",
    "system.memory",
    "system.disk",
    "system.processes",
})

# Hermes tools → surface agentic (app_id catalogue HUD).
TOOL_SURFACE_APP: dict[str, str] = {
    "web_search": "reach",
    "web_extract": "reach",
    "browser.navigate": "browser",
    "browser.screenshot": "browser",
    "terminal": "terminal",
    "read_file": "files",
    "write_file": "files",
    "patch": "files",
    "search_files": "files",
    "execute_code": "analyze",
    "kanban_list": "mission-control-dev",
    "kanban_show": "mission-control-dev",
    "kanban_create": "mission-control-dev",
    "kanban_complete": "mission-control-dev",
    "kanban_comment": "mission-control-dev",
    "skills": "skills",
    "skill": "skills",
    "cronjob": "crons",
    "cron": "crons",
    "list_dir": "files",
    "grep": "files",
}

INTENT_SURFACE_APP: dict[str, str] = {
    MONITOR_INTENT: MONITOR_SURFACE_ID,
    "web.search": "reach",
    "web.browse": "browser",
    "system.shell": "terminal",
    "files.browse": "files",
    "data.analyze": "analyze",
    "agent.skills": "skills",
    "home.control": "home",
    # home.camera_view / home.camera_snapshot : PAS ici, volontairement.
    # Ces deux exécuteurs publient déjà leur propre surface "salon-camera"
    # (ImageViewer) directement. Les enregistrer ici réactive le mécanisme
    # générique `_maybe_publish_surface_decision` (executors_routing.py) qui
    # écrase la surface caméra avec un ResultPanel "résultat Hermes" vide —
    # bug constaté en test réel, cf. handoff caméra. Ne pas les réajouter
    # sans revoir ce mécanisme générique en même temps.
    "media.video": "video",
    "core.holomat": "vision",
    "vision.analyze": "vision",
    "vision.scene": "vision",
    "core.mission_dev": "mission-control-dev",
    "agent.tools": "outils",
    "agent.cron": "crons",
    "media.streaming": "video",
    "core.cursor": "cursor",
    "core.missions": "objectifs",
    "vps.code": "code",
}


def decide_surface_id(*, intent: str | None = None, tool: str | None = None) -> str | None:
    """Retourne un `surface_id` (= app_id) ou None si aucune règle ne match.

    Les outils Hermes explicites (web_search, browser…) priment sur l'intent :
    sinon un chat ``agent.skills`` qui appelle ``web_search`` ouvrirait la tuile
    skills au lieu de reach (bug constaté NUC 2026-08-16).
    """
    tool_name = str(tool or "").strip()
    if tool_name in MONITOR_TOOLS:
        return MONITOR_SURFACE_ID
    if tool_name in TOOL_SURFACE_APP:
        return TOOL_SURFACE_APP[tool_name]
    if intent and str(intent).strip() in INTENT_SURFACE_APP:
        return INTENT_SURFACE_APP[str(intent).strip()]
    if intent and str(intent).strip() == MONITOR_INTENT:
        return MONITOR_SURFACE_ID
    return None


def monitor_document() -> dict[str, Any]:
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


def result_panel_document(
    surface_id: str,
    *,
    title: str,
    body: str,
    source: str = "",
    items: list[str] | None = None,
) -> dict[str, Any]:
    """Document ResultPanel pour une surface app."""
    cid = "tool-result"
    return {
        "surfaces": {
            surface_id: {
                "root": [cid],
                "components": {
                    cid: {
                        "name": "ResultPanel",
                        "props": {
                            "title": (title or surface_id)[:120],
                            "body": (body or "")[:8000],
                            "source": (source or "")[:80],
                            "items": list(items or [])[:40],
                        },
                        "state": "idle",
                    }
                },
            }
        }
    }


def decide_document(
    *,
    intent: str | None = None,
    tool: str | None = None,
    summary: str | None = None,
) -> tuple[str, dict[str, Any]] | None:
    """Règle intent/tool → (surface_id, document). None si pas de surface auto."""
    surface_id = decide_surface_id(intent=intent, tool=tool)
    if surface_id is None:
        return None
    if surface_id == MONITOR_SURFACE_ID:
        return surface_id, monitor_document()

    tool_name = str(tool or "").strip()

    # Board Mission DEV — document live publié par l'exécutant (pas ResultPanel).
    if intent == "core.mission_dev" and surface_id == "mission-control-dev":
        return None
    if tool_name.startswith("kanban_") and surface_id == "mission-control-dev":
        return None

    title = tool_name.replace("_", " ").title() if tool_name else (intent or "Résultat")
    body = (summary or "").strip() or f"Outil {tool_name or intent} — résultat Hermes."
    source = intent or tool_name or "hermes.tool"
    return surface_id, result_panel_document(
        surface_id,
        title=title,
        body=body,
        source=source,
    )
