"""MemoryAPI — façade Core. MEMORY ≠ POLICY ≠ EXECUTION."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .adapters.local_json import LocalJsonAdapter
from .policy import MemoryPolicy
from .types import (
    ForgetResult,
    MemoryDraft,
    MemoryEvidence,
    MemoryRecord,
    MemoryScope,
    MemorySource,
    Rejected,
    SearchHit,
)

logger = logging.getLogger("jarvis.memory.api")

EmitFn = Callable[[str, dict[str, Any]], None]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemoryAPI:
    """
    store / recall / search / list / forget / inspect.

    Les callers importent cette API — jamais un backend MemPalace directement.
    """

    def __init__(
        self,
        backend: Any | None = None,
        policy: MemoryPolicy | None = None,
        emit: EmitFn | None = None,
    ) -> None:
        self.backend = backend or LocalJsonAdapter()
        self.policy = policy or MemoryPolicy()
        self._emit = emit

    def bind_emit(self, emit: EmitFn | None) -> None:
        """Raccord runtime (Orchestrator.emit) — sans recréer l'API."""
        self._emit = emit

    def store(self, draft: MemoryDraft) -> MemoryRecord | Rejected:
        rejected = self.policy.admit(draft)
        if rejected is not None:
            self._fire(
                "MEMORY_REJECTED",
                {"code": rejected.code, "kind": draft.kind, "reason": rejected.reason},
            )
            return rejected

        now = _utc_now()
        mid = (draft.id or "").strip() or str(uuid.uuid4())
        source = draft.source or MemorySource(type=draft.writer or "user")
        if not source.type:
            source = MemorySource(type=draft.writer or "user", ref=source.ref)

        evidence = draft.evidence
        if evidence is not None and evidence.at is None:
            evidence = MemoryEvidence(
                observed=evidence.observed,
                validated=evidence.validated,
                validator=evidence.validator,
                at=now,
                details=dict(evidence.details or {}),
                reviews=list(evidence.reviews or []),
            )

        record = MemoryRecord(
            id=mid,
            user_id=draft.user_id,
            kind=draft.kind,
            content=(draft.content or "").strip()[:8000],
            title=((draft.title or "").strip()[:120] or None),
            summary=((draft.summary or "").strip()[:500] or None) if draft.summary else None,
            scope=draft.scope or MemoryScope(),
            tags=[str(t).strip() for t in (draft.tags or []) if t and str(t).strip()][:8],
            source=source,
            evidence=evidence,
            created_at=now,
            updated_at=now,
            importance=draft.importance or "normal",
            ttl_days=draft.ttl_days,
            tombstone=False,
            synced=True,
        )
        self.backend.upsert(record)
        self._fire(
            "MEMORY_STORED",
            {
                "id": record.id,
                "kind": record.kind,
                "wing": record.scope.wing,
                "room": record.scope.room,
                "user_id": record.user_id,
            },
        )
        logger.info(
            "memory store · user=%s · kind=%s · id=%s",
            record.user_id,
            record.kind,
            record.id,
        )
        return record

    def recall(
        self,
        memory_id: str,
        user_id: str,
        *,
        role: str | None = "user",
    ) -> MemoryRecord | None | Rejected:
        if not self.policy.can_read(role):
            return Rejected("denied_role", "memory.read refuse pour ce rôle")
        rec = self.backend.get(memory_id, user_id)
        if rec is None or rec.tombstone:
            return None
        return rec

    def search(
        self,
        query: str,
        user_id: str,
        *,
        role: str | None = "user",
        kinds: list[str] | None = None,
        wing: str | None = None,
        room: str | None = None,
        limit: int = 20,
        since: str | None = None,
    ) -> list[SearchHit] | Rejected:
        if not self.policy.can_read(role):
            return Rejected("denied_role", "memory.read refuse pour ce rôle")
        hits = self.backend.search(
            query,
            user_id,
            kinds=kinds,
            wing=wing,
            room=room,
            limit=limit,
            since=since,
            include_tombstones=False,
        )
        self._fire(
            "MEMORY_RECALLED",
            {"user_id": user_id, "hit_count": len(hits), "query_len": len(query or "")},
        )
        return hits

    def list(
        self,
        user_id: str,
        *,
        role: str | None = "user",
        kinds: list[str] | None = None,
        wing: str | None = None,
        room: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MemoryRecord] | Rejected:
        if not self.policy.can_read(role):
            return Rejected("denied_role", "memory.read refuse pour ce rôle")
        return self.backend.list(
            user_id,
            kinds=kinds,
            wing=wing,
            room=room,
            limit=limit,
            offset=offset,
            include_tombstones=False,
        )

    def forget(
        self,
        memory_id: str,
        user_id: str,
        *,
        hard: bool = False,
        role: str | None = "user",
        writer: str | None = "user",
    ) -> ForgetResult:
        if not self.policy.can_forget_as_writer(writer):
            return ForgetResult(ok=False, denied=True, reason="writer hermes ne peut pas forget", hard=hard)
        if hard and not self.policy.can_hard_forget(role):
            return ForgetResult(ok=False, denied=True, reason="hard forget réservé admin", hard=True)
        ok = self.backend.delete(memory_id, user_id, hard=hard)
        if ok:
            self._fire(
                "MEMORY_FORGOTTEN",
                {"id": memory_id, "hard": hard, "user_id": user_id},
            )
        return ForgetResult(ok=ok, denied=False, reason=None if ok else "introuvable", hard=hard)

    def inspect(self, user_id: str, *, role: str | None = "user") -> dict[str, Any] | Rejected:
        if not self.policy.can_read(role):
            return Rejected("denied_role", "memory.read refuse pour ce rôle")
        records = self.backend.list(user_id, limit=10_000, include_tombstones=True)
        wings: dict[str, int] = {}
        rooms: dict[str, int] = {}
        kinds: dict[str, int] = {}
        active = 0
        for r in records:
            if not r.tombstone:
                active += 1
            kinds[r.kind] = kinds.get(r.kind, 0) + 1
            if r.scope.wing:
                wings[r.scope.wing] = wings.get(r.scope.wing, 0) + 1
            if r.scope.room:
                rooms[r.scope.room] = rooms.get(r.scope.room, 0) + 1
        health = self.backend.health(user_id)
        return {
            "backend": getattr(self.backend, "name", "unknown"),
            "health": health,
            "counts": {
                "total": len(records),
                "active": active,
                "tombstones": len(records) - active,
                "by_kind": kinds,
            },
            "wings": wings,
            "rooms": rooms,
        }

    def _fire(self, kind: str, payload: dict[str, Any]) -> None:
        if self._emit is None:
            return
        try:
            self._emit(kind, payload)
        except Exception:  # noqa: BLE001 — bus optionnel, jamais bloquer Memory
            logger.exception("memory emit failed · kind=%s", kind)


def build_memory_api(
    *,
    root: Path | None = None,
    emit: EmitFn | None = None,
    backend: Any | None = None,
    url: str | None = None,
) -> MemoryAPI:
    """Factory — `root` force LocalJson (smokes). Sans root : PG si DSN, sinon JSON."""
    if backend is not None:
        return MemoryAPI(backend=backend, emit=emit)
    if root is not None:
        return MemoryAPI(backend=LocalJsonAdapter(root=root), emit=emit)
    from ..db.config import describe_backend

    info = describe_backend(url)
    if info["backend"] == "postgresql":
        from .adapters.pg import PgAdapter

        return MemoryAPI(backend=PgAdapter(url=url), emit=emit)
    return MemoryAPI(backend=LocalJsonAdapter(), emit=emit)
