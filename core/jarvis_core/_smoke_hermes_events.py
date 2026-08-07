"""Preuve Tool Bus Phase 2 — mapping Hermes SSE → AgentToolEvent (sans réseau).

    python -m jarvis_core._smoke_hermes_events
"""
from __future__ import annotations

from .tool_events import (
    AgentToolEvent,
    map_hermes_chat_progress,
    map_hermes_run_event,
)


def check(label: str, cond: bool) -> None:
    status = "OK" if cond else "FAIL"
    print(f"  [{status}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> None:
    print("\n1. map_hermes_run_event - tool lifecycle")
    started = map_hermes_run_event(
        {"event": "tool.started", "run_id": "run_1", "tool": "terminal", "preview": "ls"},
        intent="system.shell",
        toolset="terminal",
    )
    check("tool.started -> AgentToolEvent", started is not None and started.event == "tool.started")
    assert started is not None
    check("status=running", started.status == "running")
    check("device_id=nuc", started.device_id == "nuc")

    done = map_hermes_run_event(
        {
            "event": "tool.completed",
            "run_id": "run_1",
            "tool": "terminal",
            "duration": 1.5,
            "error": False,
        },
        intent="system.shell",
        toolset="terminal",
    )
    check("tool.completed", done is not None and done.event == "tool.completed")
    assert done is not None
    check("duration_ms=1500", done.duration_ms == 1500.0)

    failed = map_hermes_run_event(
        {"event": "tool.completed", "run_id": "run_1", "tool": "terminal", "error": True},
    )
    check("tool.completed+error -> tool.failed", failed is not None and failed.event == "tool.failed")

    print("\n2. filtres CoT / internes")
    check(
        "reasoning.available droppe",
        map_hermes_run_event({"event": "reasoning.available", "text": "secret"}) is None,
    )
    check(
        "message.delta droppe",
        map_hermes_run_event({"event": "message.delta", "delta": "tok"}) is None,
    )
    check(
        "outil _thinking droppe",
        map_hermes_run_event({"event": "tool.started", "tool": "_thinking"}) is None,
    )

    print("\n3. agent run + chat progress")
    agent_done = map_hermes_run_event(
        {"event": "run.completed", "run_id": "run_1", "output": "ok"},
        intent="web.search",
    )
    check("run.completed -> agent.completed", agent_done is not None and agent_done.event == "agent.completed")

    prog = map_hermes_chat_progress(
        {"tool": "web_search", "toolCallId": "c1", "status": "running", "label": "q"},
        intent="web.search",
        toolset="web",
    )
    check("chat progress running", prog is not None and prog.event == "tool.started")
    assert prog is not None
    check("toolCallId preserve", prog.tool_call_id == "c1")

    print("\n4. journal projection")
    row = AgentToolEvent(
        event="tool.completed",
        run_id="run_1",
        tool="terminal",
        status="success",
        intent="system.shell",
        toolset="terminal",
        device_id="nuc",
    ).to_journal(owner="hermes", risk=5, operation="EXECUTE")
    check("journal stage=completed", row.stage == "completed")
    check("meta.tool present", row.meta.get("tool") == "terminal")

    print("\nPhase 2 mapping - OK\n")


if __name__ == "__main__":
    main()
