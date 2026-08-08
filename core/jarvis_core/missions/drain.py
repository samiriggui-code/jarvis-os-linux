"""Drain loop — mission = chaîne d'étapes reviewables (pattern agent-swarm).

Une entrée (ticket, objectif dev…) devient une séquence d'étapes corrélées aux
tool_events. Reprise après reboot via ``missions.json``.
"""

from __future__ import annotations

import uuid
from typing import Any

MISSION_OPEN = "open"
MISSION_RUNNING = "running"
MISSION_BLOCKED = "blocked_hitl"
MISSION_DONE = "done"
MISSION_FAILED = "failed"

STEP_PENDING = "pending"
STEP_RUNNING = "running"
STEP_DONE = "done"
STEP_FAILED = "failed"
STEP_BLOCKED = "blocked"


def new_step(
    *,
    kind: str,
    capability_id: str = "",
    summary: str = "",
    depends_on: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex[:10],
        "kind": kind,
        "capability_id": capability_id,
        "summary": summary,
        "status": STEP_PENDING,
        "depends_on": list(depends_on or []),
        "tool_event_id": "",
    }


def runnable_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    done = {s.get("id") for s in steps if s.get("status") == STEP_DONE}
    out: list[dict[str, Any]] = []
    for step in steps:
        if step.get("status") != STEP_PENDING:
            continue
        deps = step.get("depends_on") if isinstance(step.get("depends_on"), list) else []
        if all(str(d) in done for d in deps):
            out.append(step)
    return out


def advance_step(steps: list[dict[str, Any]], step_id: str, *, status: str, **patch: Any) -> bool:
    for step in steps:
        if step.get("id") != step_id:
            continue
        step["status"] = status
        for key, val in patch.items():
            step[key] = val
        return True
    return False


def mission_progress(steps: list[dict[str, Any]]) -> dict[str, int]:
    total = len(steps)
    done = sum(1 for s in steps if s.get("status") == STEP_DONE)
    failed = sum(1 for s in steps if s.get("status") in (STEP_FAILED, STEP_BLOCKED))
    return {"total": total, "done": done, "failed": failed, "pending": total - done - failed}
