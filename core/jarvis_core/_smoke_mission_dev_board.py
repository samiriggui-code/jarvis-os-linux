"""Smoke Mission DEV Board — kanban local + WS mission_board.

    python -m jarvis_core._smoke_mission_dev_board
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


async def _run_all() -> None:
    from jarvis_core.db import session as db_session
    from jarvis_core.db.base import Base
    from jarvis_core.db.session import get_engine, run_migrations
    from jarvis_core.dev_agent.registry import DevRunRegistry
    from jarvis_core.mission_dev.board import BoardColumn, MissionDevBoardService

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "board_smoke.db"
        url = f"sqlite:///{db_path.as_posix()}"
        os.environ["JARVIS_DATABASE_URL"] = url
        db_session.reset_engine()
        get_engine(url=url)
        run_migrations(url=url)
        Base.metadata.create_all(get_engine(url=url))

        svc = MissionDevBoardService()
        created = svc.create_issue(title="Fix routing", body="P1 trigger")
        issue = created["issue"]
        check("create issue", bool(issue.get("id")), issue.get("title", ""))

        moved = svc.move_issue(issue_id=issue["id"], column=BoardColumn.TODO.value)
        check("move todo", moved["issue"]["column"] == "todo")

        assigned = svc.assign_issue(issue_id=issue["id"], agent="cursor", workspace_id="jarvis-main")
        check("assign cursor", assigned["issue"]["assignee_agent"] == "cursor")
        check("assign → doing", assigned["issue"]["column"] == "doing")

        blocked = svc.block_issue(issue_id=issue["id"], reason="review humaine")
        check("block", blocked["issue"]["status"] == "blocked")

        inbox = svc.inbox()
        check("inbox blocked", len(inbox["blocked"]) >= 1)

        svc.add_comment(issue_id=issue["id"], author="smoke", body="LGTM pending")
        detail = svc.get_issue_detail(issue_id=issue["id"])
        check("comments", len(detail["comments"]) == 1)

        runs = DevRunRegistry()
        rec = runs.create_pending(
            request_id="req-smoke",
            device_id="pc-test",
            workspace_id="jarvis-main",
            agent="cursor",
            timeout_s=60.0,
        )
        svc.link_run(issue_id=issue["id"], run_id=rec.run_id)
        replay = svc.get_run_replay(run_id=rec.run_id, dev_runs=runs)
        check("replay run_id", replay["run_id"] == rec.run_id)
        check("replay status", replay["run"] is not None)

        board = svc.list_board()
        check("columns", len(board["columns"]) == 5)
        check("issues persisted", len(board["issues"]) >= 1)

        # Handler WS (sans serveur — évite le bruit boot/handshake)
        class _FakeWs:
            def __init__(self) -> None:
                self.messages: list[dict] = []

            async def send(self, raw: str) -> None:
                self.messages.append(json.loads(raw))

        os.environ["JARVIS_DATABASE_URL"] = url
        db_session.reset_engine()
        from jarvis_core import Orchestrator

        orch = Orchestrator()
        fake = _FakeWs()
        await orch.handle_mission_board(fake, {"action": "list"})
        msg = fake.messages[-1]
        check("handler list ok", msg.get("ok") is True and msg.get("type") == "mission_board_result")
        check("handler columns", isinstance(msg.get("columns"), list))

        await orch.handle_mission_board(fake, {"action": "create", "title": "Via handler"})
        msg2 = fake.messages[-1]
        check("handler create ok", msg2.get("ok") is True and msg2.get("issue", {}).get("title") == "Via handler")

        db_session.reset_engine()

    print("\nMission DEV Board smoke — PASS")


def main() -> None:
    asyncio.run(_run_all())


if __name__ == "__main__":
    main()
