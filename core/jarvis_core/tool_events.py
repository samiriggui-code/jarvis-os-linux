"""
Journal des tool calls — Tool Bus Phase 1 (gouvernance, pas d'agent loop ici).

Table `tool_events` via SQLAlchemy (même DB que users / usage_events).

Distinct de `usage.py` : celui-là mesure des complétions LLM (tokens, coût) ;
celui-ci mesure des actions — quelle intention, portée par qui (Core ou Device),
avec quel résultat. Deux tables, deux schémas ; le pattern d'écriture est copié
depuis `usage.py`, pas partagé, parce qu'un partage n'aurait de sens qu'à partir
d'un 3ᵉ site d'appel — pas avant.

Même raison qu'à l'identique dans `usage.py` : un enregistrement de tool call ne
doit jamais attendre la base. `record_tool_event` rend la main immédiatement,
l'écriture se fait sur un fil de fond, dans une file bornée qui jette plutôt que
de grossir sans limite.

Le contrat conservé est générique : `ToolEvent` décrit le cycle de vie des
intentions Core et Device.
"""
from __future__ import annotations

import json
import logging
import queue
import threading
import time
from dataclasses import dataclass, field
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


# ── Timeline HUD (P2) — payload WS unifié ────────────────────────────────────

_STAGE_TO_EVENT = {
    "started": "intent.started",
    "completed": "intent.completed",
    "failed": "intent.failed",
    "not_executable": "intent.failed",
}

_STAGE_TO_STATUS = {
    "started": "running",
    "completed": "success",
    "failed": "failed",
    "not_executable": "failed",
}


def timeline_payload(
    event: ToolEvent,
    *,
    route: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Format unique Core → HUD pour la timeline (`type: tool_event`)."""
    out: dict[str, Any] = {
        "type": "tool_event",
        "event": _STAGE_TO_EVENT.get(event.stage, f"intent.{event.stage}"),
        "intent": event.intent,
        "stage": event.stage,
        "owner": event.owner,
        "status": _STAGE_TO_STATUS.get(event.stage, event.stage),
    }
    if event.toolset:
        out["toolset"] = event.toolset
    if event.duration_ms is not None:
        out["duration_ms"] = event.duration_ms
    if event.reason:
        out["summary"] = event.reason[:500]
    if event.device_id:
        out["device_id"] = event.device_id
    if event.user_id:
        out["user_id"] = event.user_id
    if event.role:
        out["role"] = event.role
    if route:
        out["route"] = route
    if event.meta:
        for key in ("event", "run_id", "tool", "tool_call_id", "status", "summary"):
            if key in event.meta and event.meta[key] is not None:
                out[key] = event.meta[key]
    return out


def row_to_timeline(row: ToolEventRow) -> dict[str, Any]:
    """Rejoue une ligne journal → payload timeline."""
    meta: dict[str, Any] = {}
    if row.meta_json:
        try:
            parsed = json.loads(row.meta_json)
            if isinstance(parsed, dict):
                meta = parsed
        except json.JSONDecodeError:
            meta = {}

    if meta.get("event"):
        out: dict[str, Any] = {
            "type": "tool_event",
            "intent": row.intent,
            "owner": row.owner,
        }
        for key in (
            "event",
            "run_id",
            "tool",
            "tool_call_id",
            "status",
            "summary",
            "toolset",
        ):
            if meta.get(key) is not None:
                out[key] = meta[key]
        if row.duration_ms is not None:
            out["duration_ms"] = row.duration_ms
        if row.device_id:
            out["device_id"] = row.device_id
        if row.reason and "summary" not in out:
            out["summary"] = row.reason[:500]
        return out

    ev = ToolEvent(
        intent=row.intent,
        stage=row.stage,
        owner=row.owner,
        toolset=row.toolset,
        risk=int(row.risk or 0),
        operation=row.operation,
        role=row.role,
        user_id=row.user_id,
        duration_ms=row.duration_ms,
        reason=row.reason,
        device_id=row.device_id,
        meta=meta,
    )
    return timeline_payload(ev)


def fetch_recent_timeline(limit: int = 50) -> list[dict[str, Any]]:
    """Derniers événements pour bootstrap HUD / GET /v1/tool-events."""
    limit = max(1, min(int(limit), 200))
    try:
        from sqlalchemy import desc, select

        with session_scope() as s:
            rows = list(
                s.scalars(
                    select(ToolEventRow)
                    .order_by(desc(ToolEventRow.id))
                    .limit(limit)
                ).all()
            )
        rows.reverse()
        return [row_to_timeline(r) for r in rows]
    except Exception as exc:  # noqa: BLE001
        logger.debug("timeline fetch indisponible · %s", exc)
        return []


def timeline_snapshot_payload(limit: int = 50) -> dict[str, Any]:
    return {
        "type": "tool_timeline_snapshot",
        "events": fetch_recent_timeline(limit),
    }


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
