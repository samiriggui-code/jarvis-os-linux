"""
Journal des tool calls — Tool Bus Phase 1 (gouvernance, pas d'agent loop ici).

Table `tool_events` via SQLAlchemy (même DB que users / usage_events).

Distinct de `usage.py` : celui-là mesure des complétions LLM (tokens, coût) ;
celui-ci mesure des actions — quelle intention, portée par qui (Core ou Hermes),
avec quel résultat. Deux tables, deux schémas ; le pattern d'écriture est copié
depuis `usage.py`, pas partagé, parce qu'un partage n'aurait de sens qu'à partir
d'un 3ᵉ site d'appel — pas avant.

Même raison qu'à l'identique dans `usage.py` : un enregistrement de tool call ne
doit jamais attendre la base. `record_tool_event` rend la main immédiatement,
l'écriture se fait sur un fil de fond, dans une file bornée qui jette plutôt que
de grossir sans limite.

Phase 2 — `AgentToolEvent` : événement de cycle de vie Hermes (SSE `/v1/runs`),
distinct du journal d'intention (`ToolEvent` / stage started|completed). Le
pont Hermes convertit ; le Core publie sur le bus / WS ; le HUD n'est pas
encore branché.
"""
from __future__ import annotations

import json
import logging
import queue
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from jarvis_core.db.models import ToolEventRow
from jarvis_core.db.session import session_scope

logger = logging.getLogger("jarvis.tool_events")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ── Journal d'intention (Phase 1) ────────────────────────────────────────────


@dataclass
class ToolEvent:
    intent: str
    stage: str  # "started" | "completed" | "failed" | "not_executable"
    owner: str  # "core" | "hermes" | "device"
    toolset: str | None = None
    risk: int = 0
    operation: str | None = None
    role: str | None = None
    user_id: str | None = None
    duration_ms: float | None = None
    reason: str | None = None
    device_id: str | None = None
    """Quelle machine a exécuté — `"core"`, `"nuc"`, plus tard `"pi"`/`"vps"`.

    Porté dès maintenant même sans routeur multi-machine : ajouter le champ à
    une table déjà en usage coûte une migration de plus ; l'ajouter après coup
    laisserait un trou dans l'historique. Ne dispatche rien — c'est `Owner` qui
    tranche encore qui exécute. Prépare la liaison future `IntentCapability →
    Tool → HostCapability → Device` (voir `capabilities.py`)."""
    meta: dict[str, Any] = field(default_factory=dict)


# ── Cycle de vie outil Hermes (Phase 2) ──────────────────────────────────────


# Events Hermes qu'on ne relaie JAMAIS (CoT / tokens / internes).
_DROP_HERMES_EVENTS = frozenset({
    "reasoning.available",
    "message.delta",
    "approval.requested",
    "approval.responded",
})


@dataclass(frozen=True)
class AgentToolEvent:
    """Contrat Tool Bus — événement synthétique (jamais de chaîne de pensée).

    Voir `docs/architecture/JARVIS-Tool-Bus.md`.
    """

    event: str
    """tool.started | tool.completed | tool.failed | agent.started | agent.completed | agent.failed"""

    run_id: str | None = None
    tool: str | None = None
    tool_call_id: str | None = None
    status: str | None = None  # running | success | failed
    duration_ms: float | None = None
    summary: str | None = None
    device_id: str | None = None
    intent: str | None = None
    toolset: str | None = None

    def to_payload(self) -> dict[str, Any]:
        """Dict prêt pour bus / WS — champs None omis."""
        raw = asdict(self)
        return {k: v for k, v in raw.items() if v is not None}

    def to_journal(
        self,
        *,
        owner: str = "hermes",
        risk: int = 0,
        operation: str | None = None,
        role: str | None = None,
        user_id: str | None = None,
    ) -> ToolEvent:
        """Projection grossière vers le journal d'intention (même table)."""
        stage = {
            "tool.started": "started",
            "tool.completed": "completed",
            "tool.failed": "failed",
            "agent.started": "started",
            "agent.completed": "completed",
            "agent.failed": "failed",
        }.get(self.event, self.event)
        return ToolEvent(
            intent=self.intent or "hermes.run",
            stage=stage,
            owner=owner,
            toolset=self.toolset,
            risk=risk,
            operation=operation,
            role=role,
            user_id=user_id,
            duration_ms=self.duration_ms,
            reason=self.summary if self.event.endswith("failed") else None,
            device_id=self.device_id,
            meta={
                "event": self.event,
                "run_id": self.run_id,
                "tool": self.tool,
                "tool_call_id": self.tool_call_id,
                "status": self.status,
                "summary": self.summary,
            },
        )


def map_hermes_run_event(
    raw: dict[str, Any],
    *,
    intent: str | None = None,
    toolset: str | None = None,
    device_id: str | None = "nuc",
) -> AgentToolEvent | None:
    """Hermes `/v1/runs/{id}/events` → AgentToolEvent, ou None si filtré.

    Ne relaie pas `reasoning.*`, deltas de tokens, ni outils internes (`_…`).
    """
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


def _call_id(raw: dict[str, Any]) -> str | None:
    for key in ("tool_call_id", "toolCallId", "call_id"):
        val = raw.get(key)
        if val:
            return str(val)
    return None


_QUEUE_MAX = 512

_queue: "queue.Queue[dict[str, Any] | None] | None" = None
_worker: threading.Thread | None = None
_lock = threading.Lock()
_dropped = 0


def _row_from_event(event: ToolEvent) -> dict[str, Any]:
    return {
        "intent": event.intent,
        "stage": event.stage,
        "owner": event.owner,
        "toolset": event.toolset,
        "risk": int(event.risk),
        "operation": event.operation,
        "role": event.role,
        "user_id": event.user_id,
        "duration_ms": event.duration_ms,
        "reason": event.reason,
        "device_id": event.device_id,
        "meta_json": json.dumps(event.meta or {}, ensure_ascii=False),
        "created_at": _utc_now().isoformat(),
    }


def _drain(q: "queue.Queue[dict[str, Any] | None]") -> None:
    while True:
        row = q.get()
        if row is None:
            q.task_done()
            return
        try:
            with session_scope() as s:
                s.add(ToolEventRow(**row))
        except Exception as exc:  # noqa: BLE001
            logger.warning("tool_event record failed (arrière-plan) : %s", exc)
        finally:
            q.task_done()


def _ensure_worker() -> "queue.Queue[dict[str, Any] | None]":
    global _queue, _worker
    with _lock:
        if _queue is None:
            _queue = queue.Queue(maxsize=_QUEUE_MAX)
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(
                target=_drain, args=(_queue,), name="jarvis-tool-events", daemon=True
            )
            _worker.start()
    return _queue


def record_tool_event(event: ToolEvent) -> None:
    """Enregistre un tool call **sans attendre l'écriture**. Ne bloque jamais."""
    global _dropped

    row = _row_from_event(event)
    try:
        _ensure_worker().put_nowait(row)
    except queue.Full:
        _dropped += 1
        if _dropped == 1 or _dropped % 100 == 0:
            logger.warning(
                "journal de tool calls saturé — %d événement(s) perdu(s).", _dropped
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("journal de tool calls indisponible : %s", exc)


def record_tool_event_sync(event: ToolEvent) -> None:
    """Variante bloquante — tests et outils uniquement, jamais depuis une coroutine."""
    row = _row_from_event(event)
    with session_scope() as s:
        s.add(ToolEventRow(**row))


def flush_tool_events(timeout: float = 5.0) -> bool:
    """Attend que la file se vide. Pour les tests et un arrêt propre."""
    if _queue is None:
        return True
    deadline = time.monotonic() + timeout
    while not _queue.empty():
        if time.monotonic() > deadline:
            return False
        time.sleep(0.02)
    return True
