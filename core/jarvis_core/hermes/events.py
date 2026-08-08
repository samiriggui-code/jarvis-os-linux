"""Mapping SSE Hermes → AgentToolEvent (P2b).

Le pont (`hermes/bridge.py`) consomme ces fonctions ; le journal WS reste
dans ``tool_events.py``.
"""
from __future__ import annotations

from typing import Any

from ..tool_events import AgentToolEvent

# Events Hermes qu'on ne relaie JAMAIS (CoT / tokens / internes).
_DROP_HERMES_EVENTS = frozenset({
    "reasoning.available",
    "message.delta",
    "approval.requested",
    "approval.responded",
})


def _call_id(raw: dict[str, Any]) -> str | None:
    for key in ("tool_call_id", "toolCallId", "call_id"):
        val = raw.get(key)
        if val:
            return str(val)
    return None


def map_hermes_run_event(
    raw: dict[str, Any],
    *,
    intent: str | None = None,
    toolset: str | None = None,
    device_id: str | None = "nuc",
) -> AgentToolEvent | None:
    """Hermes `/v1/runs/{id}/events` → AgentToolEvent, ou None si filtré."""
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("event") or "").strip()
    if not kind or kind in _DROP_HERMES_EVENTS:
        return None
    if kind.startswith("reasoning.") or kind.startswith("message."):
        return None
    if kind.startswith("subagent.") or kind.startswith("approval."):
        return None

    run_id = str(raw.get("run_id") or "") or None
    tool = raw.get("tool")
    tool_name = str(tool).strip() if tool else None
    if tool_name and tool_name.startswith("_"):
        return None

    preview = raw.get("preview")
    summary = str(preview).strip() if preview not in (None, "") else None

    if kind == "tool.started":
        return AgentToolEvent(
            event="tool.started",
            run_id=run_id,
            tool=tool_name,
            tool_call_id=_call_id(raw),
            status="running",
            summary=summary,
            device_id=device_id,
            intent=intent,
            toolset=toolset,
        )
    if kind == "tool.completed":
        is_err = bool(raw.get("error") or raw.get("is_error"))
        duration = raw.get("duration")
        duration_ms = float(duration) * 1000.0 if isinstance(duration, (int, float)) else None
        return AgentToolEvent(
            event="tool.failed" if is_err else "tool.completed",
            run_id=run_id,
            tool=tool_name,
            tool_call_id=_call_id(raw),
            status="failed" if is_err else "success",
            duration_ms=duration_ms,
            summary=summary,
            device_id=device_id,
            intent=intent,
            toolset=toolset,
        )
    if kind == "tool.failed":
        return AgentToolEvent(
            event="tool.failed",
            run_id=run_id,
            tool=tool_name,
            tool_call_id=_call_id(raw),
            status="failed",
            summary=summary or str(raw.get("error") or "") or None,
            device_id=device_id,
            intent=intent,
            toolset=toolset,
        )
    if kind == "run.completed":
        return AgentToolEvent(
            event="agent.completed",
            run_id=run_id,
            status="success",
            summary=None,
            device_id=device_id,
            intent=intent,
            toolset=toolset,
        )
    if kind in {"run.failed", "run.cancelled"}:
        return AgentToolEvent(
            event="agent.failed",
            run_id=run_id,
            status="failed",
            summary=str(raw.get("error") or kind),
            device_id=device_id,
            intent=intent,
            toolset=toolset,
        )
    return None


def map_hermes_chat_progress(
    raw: dict[str, Any],
    *,
    run_id: str | None = None,
    intent: str | None = None,
    toolset: str | None = None,
    device_id: str | None = "nuc",
) -> AgentToolEvent | None:
    """SSE `hermes.tool.progress` (chat/completions stream) → AgentToolEvent."""
    if not isinstance(raw, dict):
        return None
    tool_name = str(raw.get("tool") or "").strip()
    if not tool_name or tool_name.startswith("_"):
        return None
    status = str(raw.get("status") or "").strip().lower()
    call_id = str(raw.get("toolCallId") or raw.get("tool_call_id") or "") or None
    label = raw.get("label")
    summary = str(label).strip() if label not in (None, "") else None
    if status == "running":
        return AgentToolEvent(
            event="tool.started",
            run_id=run_id,
            tool=tool_name,
            tool_call_id=call_id,
            status="running",
            summary=summary,
            device_id=device_id,
            intent=intent,
            toolset=toolset,
        )
    if status == "completed":
        return AgentToolEvent(
            event="tool.completed",
            run_id=run_id,
            tool=tool_name,
            tool_call_id=call_id,
            status="success",
            summary=summary,
            device_id=device_id,
            intent=intent,
            toolset=toolset,
        )
    if status in {"failed", "error"}:
        return AgentToolEvent(
            event="tool.failed",
            run_id=run_id,
            tool=tool_name,
            tool_call_id=call_id,
            status="failed",
            summary=summary,
            device_id=device_id,
            intent=intent,
            toolset=toolset,
        )
    return None
