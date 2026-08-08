"""Smoke — mission drain loop (DAG steps + tool_event correlation)."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from jarvis_core.missions.drain import MISSION_DONE, MISSION_BLOCKED, new_step, runnable_steps
from jarvis_core.missions.store import MissionStore


def check(label: str, ok: bool) -> None:
    print(f"  [{'OK' if ok else 'FAIL'}] {label}")
    if not ok:
        raise SystemExit(1)


def main() -> int:
    print("SMOKE drain — mission DAG")
    with tempfile.TemporaryDirectory() as tmp:
        store = MissionStore(path=Path(tmp) / "missions.json")
        s1 = new_step(kind="agent", capability_id="agent.skills", summary="plan")
        s2 = new_step(
            kind="device",
            capability_id="device.app_launch",
            summary="launch",
            depends_on=[s1["id"]],
        )
        mission = store.start_drain("drain smoke", [s1, s2])
        check("mission running", mission.status == "running")
        check("only root step runnable", len(runnable_steps(mission.steps or [])) == 1)
        check("begin step", store.begin_step(mission.id, s1["id"]))
        result = store.finish_step(mission.id, s1["id"], ok=True, tool_event_id="te-smoke-1")
        check("step 1 done", result is not None and result["progress"]["done"] == 1)
        check("step 2 unlocked", len(result["runnable"]) == 1)
        store.finish_step(mission.id, s2["id"], ok=True, tool_event_id="te-smoke-2")
        done = store.list_missions(include_done=True)[0]
        check("mission done", done.status == MISSION_DONE)

        blocked = store.start_drain("blocked smoke", [new_step(kind="approval", summary="hitl")])
        check("block hitl", store.block(blocked.id, "approbation requise"))
        row = store.list_missions(include_done=True)[-1]
        check("status blocked_hitl", row.status == MISSION_BLOCKED)

    print("ALL PASS — drain")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
