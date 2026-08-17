"""P1 — intégrations services Core, chat Provider Manager, surfaces."""
from __future__ import annotations

import os
import sys

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

    from jarvis_core.gateway import chat_provider_mode

    os.environ.pop("JARVIS_CHAT_PROVIDER", None)
    check("chat default llm", chat_provider_mode() == "llm")
    os.environ["JARVIS_CHAT_PROVIDER"] = "hermes"
    check("chat remains llm", chat_provider_mode() == "llm")
    os.environ.pop("JARVIS_CHAT_PROVIDER", None)

    from jarvis_core import Orchestrator

    orch = Orchestrator()
    check("_start_mission_dev_run", hasattr(orch, "_start_mission_dev_run"))
    check("chat uses gateway module", "from ...gateway import" in open(
        os.path.join(os.path.dirname(__file__), "ws", "handlers", "chat.py"),
        encoding="utf-8",
    ).read())

    print("\nALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
