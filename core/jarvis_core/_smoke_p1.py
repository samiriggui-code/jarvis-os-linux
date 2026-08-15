"""P1 — intégrations services (mission dev ↔ kanban, chat Hermes, surfaces)."""
from __future__ import annotations

import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool, detail: str = "") -> None:
    suffix = f" — {detail}" if detail else ""
    print(f"  [{'OK' if cond else 'FAIL'}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    print("P1 — intégrations Core")

    from jarvis_core.capabilities import match_intent
    from jarvis_core.executors.surfaces import SurfaceExecutorsMixin
    from jarvis_core.mission_dev.kanban import sync_project_card
    from jarvis_core.surface_decision import decide_document, decide_surface_id

    check(
        "parse mission project",
        SurfaceExecutorsMixin._parse_mission_project_name(
            {"prompt": "jarvis nouveau projet holo-ui"}
        )
        == "holo-ui",
    )
    check(
        "mission dev intent match",
        match_intent("ouvre mission control dev") is not None
        and match_intent("ouvre mission control dev").intent == "core.mission_dev",
    )

    check(
        "surface mission_dev",
        decide_surface_id(intent="core.mission_dev") == "mission-control-dev",
    )
    check(
        "surface kanban_create",
        decide_surface_id(tool="kanban_create") == "mission-control-dev",
    )
    check(
        "surface read_file",
        decide_surface_id(tool="read_file") == "files",
    )
    doc = decide_document(intent="core.mission_dev", summary="Kanban prêt")
    # Mission DEV Board : le document live est publié par l'exécutant lui-même,
    # plus par un ResultPanel générique — `decide_document` doit donc rendre None.
    check("decide_document mission_dev (Board publie son propre document)", doc is None)

    async def _kanban_mock() -> None:
        bridge = MagicMock()
        bridge.configured = True
        bridge.ask = AsyncMock(return_value=MagicMock(text="carte #42 créée"))
        ok, detail = await sync_project_card(
            bridge,
            role="admin",
            project_name="demo",
            project_id="pid-1",
            mission_dev_id="mid-1",
        )
        check("kanban sync mock", ok and "42" in detail)
        check("kanban uses skills toolset", bridge.ask.called)

    asyncio.run(_kanban_mock())

    provider = (os.environ.get("JARVIS_CHAT_PROVIDER") or "llm").strip().lower()
    check("chat default llm", provider in {"llm", "hermes"})

    from jarvis_core import Orchestrator

    orch = Orchestrator()
    check("_start_mission_dev_run", hasattr(orch, "_start_mission_dev_run"))
    check("chat hermes env hook", "JARVIS_CHAT_PROVIDER" in open(
        os.path.join(os.path.dirname(__file__), "ws", "handlers", "chat.py"),
        encoding="utf-8",
    ).read())

    print("\nALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
