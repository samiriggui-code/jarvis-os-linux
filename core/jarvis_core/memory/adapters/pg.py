"""PgAdapter — backend Memory V2 sur PostgreSQL (SQLAlchemy).

Même contrat que LocalJsonAdapter (6 méthodes). Callers : MemoryAPI seulement.
FTS PostgreSQL (`search_tsv` + `plainto_tsquery('simple')`). Sur SQLite
(tests / DSN absent côté factory) : scoring lexical identique à LocalJson.

Pas de pgvector. Pas de MemPalace. Isolation = WHERE user_id.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.engine import Engine

from ...auth.profiles import resolve_user_id
from ...db.models import MemoryRow
from ...db.session import get_engine, session_scope
from ..types import MemoryRecord, SearchHit
from .local_json import SEED_RECORDS

logger = logging.getLogger("jarvis.memory.pg")


class PgAdapter:
    """Backend SQL Memory V2. Production = PostgreSQL ; smokes = SQLite isolé."""

    name = "postgres"

    def __init__(self, *, url: str | None = None, engine: Engine | None = None) -> None:
        self._url = url
        if engine is not None:
            self._engine = engine
        else:
            self._engine = get_engine(url=url)
        self._seeded: set[str] = set()

    @property
    def dialect(self) -> str:
        return self._engine.dialect.name

    def _scope(self):
        return session_scope(url=self._url)

    def _ensure_seeded(self, user_id: str) -> None:
        uid = resolve_user_id(user_id)
        if uid in self._seeded:
            return
        with self._scope() as s:
            n = s.scalar(select(MemoryRow.id).where(MemoryRow.user_id == uid).limit(1))
            if n is not None:
                self._seeded.add(uid)
                return
        now_src = SEED_RECORDS
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        for seed in now_src:
            rec = MemoryRecord.from_dict(
                {**seed, "user_id": uid, "created_at": now, "updated_at": now},
                default_user_id=uid,
            )
            self.upsert(rec)
        self._seeded.add(uid)
        logger.info("memories seedées · user=%s · backend=postgres", uid)

    @staticmethod
    def _row_to_record(row: MemoryRow) -> MemoryRecord:
        tags = json.loads(row.tags_json or "[]")
        source = json.loads(row.source_json or "{}")
        evidence = json.loads(row.evidence_json) if row.evidence_json else None
        return MemoryRecord.from_dict(
            {
                "id": row.id,
                "user_id": row.user_id,
                "kind": row.kind,
                "content": row.content,
                "title": row.title,
                "summary": row.summary,
                "scope": {
                    "wing": row.wing,
                    "room": row.room,
                    "device_id": row.device_id,
                    "mission_id": row.mission_id,
                    "session_id": row.session_id,
                },
                "tags": tags if isinstance(tags, list) else [],
                "source": source if isinstance(source, dict) else {},
                "evidence": evidence,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
                "importance": row.importance,
                "ttl_days": row.ttl_days,
                "tombstone": row.tombstone,
                "synced": row.synced,
            },
            default_user_id=row.user_id,
        )

    @staticmethod
    def _apply_record(row: MemoryRow, record: MemoryRecord) -> None:
        row.user_id = record.user_id
        row.kind = record.kind
        row.content = record.content
        row.title = record.title
        row.summary = record.summary
        row.wing = record.scope.wing
        row.room = record.scope.room
        row.device_id = record.scope.device_id
        row.mission_id = record.scope.mission_id
        row.session_id = record.scope.session_id
        row.tags_json = json.dumps(list(record.tags), ensure_ascii=False)
        row.source_json = json.dumps(record.source.to_dict(), ensure_ascii=False)
        row.evidence_json = (
            json.dumps(record.evidence.to_dict(), ensure_ascii=False) if record.evidence else None
        )
        row.created_at = record.created_at
        row.updated_at = record.updated_at
        row.importance = record.importance
        row.ttl_days = record.ttl_days
        row.tombstone = record.tombstone
        row.synced = record.synced

    def upsert(self, record: MemoryRecord) -> str:
        uid = resolve_user_id(record.user_id)
        record.user_id = uid
        with self._scope() as s:
            row = s.get(MemoryRow, (record.id, uid))
            if row is None:
                row = MemoryRow(id=record.id, user_id=uid)
                s.add(row)
            elif not record.created_at:
                record.created_at = row.created_at
            self._apply_record(row, record)
        return record.id

    def get(self, memory_id: str, user_id: str) -> MemoryRecord | None:
        uid = resolve_user_id(user_id)
        with self._scope() as s:
            row = s.get(MemoryRow, (memory_id, uid))
            if row is None:
                return None
            return self._row_to_record(row)

    def list(
        self,
        user_id: str,
        *,
        kinds: list[str] | None = None,
        wing: str | None = None,
        room: str | None = None,
        limit: int = 100,
        offset: int = 0,
        include_tombstones: bool = False,
    ) -> list[MemoryRecord]:
        uid = resolve_user_id(user_id)
        self._ensure_seeded(uid)
        stmt = select(MemoryRow).where(MemoryRow.user_id == uid)
        if not include_tombstones:
            stmt = stmt.where(MemoryRow.tombstone.is_(False))
        if kinds:
            stmt = stmt.where(MemoryRow.kind.in_(list(kinds)))
        if wing:
            stmt = stmt.where(MemoryRow.wing == wing)
        if room:
            stmt = stmt.where(MemoryRow.room == room)
        stmt = stmt.order_by(MemoryRow.updated_at.desc())
        stmt = stmt.offset(max(0, offset)).limit(max(0, limit))
        with self._scope() as s:
            rows = list(s.scalars(stmt).all())
            return [self._row_to_record(r) for r in rows]

    def search(
        self,
        query: str,
        user_id: str,
        *,
        kinds: list[str] | None = None,
        wing: str | None = None,
        room: str | None = None,
        limit: int = 20,
        since: str | None = None,
        include_tombstones: bool = False,
    ) -> list[SearchHit]:
        uid = resolve_user_id(user_id)
        self._ensure_seeded(uid)
        q = (query or "").strip()
        if self.dialect == "postgresql" and q:
            hits = self._search_fts(
                q,
                uid,
                kinds=kinds,
                wing=wing,
                room=room,
                limit=limit,
                since=since,
                include_tombstones=include_tombstones,
            )
            if hits:
                return hits
        return self._search_lexical(
            q,
            uid,
            kinds=kinds,
            wing=wing,
            room=room,
            limit=limit,
            since=since,
            include_tombstones=include_tombstones,
        )

    def _search_fts(
        self,
        query: str,
        uid: str,
        *,
        kinds: list[str] | None,
        wing: str | None,
        room: str | None,
        limit: int,
        since: str | None,
        include_tombstones: bool,
    ) -> list[SearchHit]:
        where = ["user_id = :uid", "search_tsv @@ plainto_tsquery('simple', :q)"]
        params: dict[str, Any] = {"uid": uid, "q": query, "lim": max(0, limit)}
        if not include_tombstones:
            where.append("tombstone = false")
        if kinds:
            placeholders = []
            for i, k in enumerate(kinds):
                key = f"kind_{i}"
                placeholders.append(f":{key}")
                params[key] = k
            where.append(f"kind IN ({', '.join(placeholders)})")
        if wing:
            where.append("wing = :wing")
            params["wing"] = wing
        if room:
            where.append("room = :room")
            params["room"] = room
        if since:
            where.append("created_at >= :since")
            params["since"] = since
        sql = text(
            "SELECT id, ts_rank(search_tsv, plainto_tsquery('simple', :q)) AS rank "
            "FROM memories WHERE "
            + " AND ".join(where)
            + " ORDER BY rank DESC LIMIT :lim"
        )
        with self._scope() as s:
            ranked = list(s.execute(sql, params).mappings())
            if not ranked:
                return []
            ids = [r["id"] for r in ranked]
            rows = {
                row.id: row
                for row in s.scalars(
                    select(MemoryRow).where(
                        MemoryRow.user_id == uid, MemoryRow.id.in_(ids)
                    )
                ).all()
            }
            hits: list[SearchHit] = []
            for item in ranked:
                row = rows.get(item["id"])
                if row is None:
                    continue
                rec = self._row_to_record(row)
                hits.append(
                    SearchHit(
                        record=rec,
                        score=float(item["rank"] or 0.0),
                        snippet=(rec.content or "")[:240],
                    )
                )
            return hits

    def _search_lexical(
        self,
        query: str,
        uid: str,
        *,
        kinds: list[str] | None,
        wing: str | None,
        room: str | None,
        limit: int,
        since: str | None,
        include_tombstones: bool,
    ) -> list[SearchHit]:
        records = self.list(
            uid,
            kinds=kinds,
            wing=wing,
            room=room,
            limit=10_000,
            offset=0,
            include_tombstones=include_tombstones,
        )
        q = query.lower()
        tokens = [t for t in re.split(r"\s+", q) if t]
        hits: list[SearchHit] = []
        for rec in records:
            if since and rec.created_at and rec.created_at < since:
                continue
            blob = " ".join(
                [
                    rec.title or "",
                    rec.content,
                    rec.summary or "",
                    " ".join(rec.tags),
                    rec.scope.wing or "",
                    rec.scope.room or "",
                ]
            ).lower()
            if not tokens:
                score = 0.0
            else:
                score = sum(1.0 for t in tokens if t in blob) / len(tokens)
                if q and q in blob:
                    score += 0.5
            if tokens and score <= 0:
                continue
            hits.append(SearchHit(record=rec, score=score, snippet=(rec.content or "")[:240]))
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[: max(0, limit)]

    def delete(self, memory_id: str, user_id: str, *, hard: bool = False) -> bool:
        uid = resolve_user_id(user_id)
        with self._scope() as s:
            row = s.get(MemoryRow, (memory_id, uid))
            if row is None:
                return False
            if hard:
                s.delete(row)
                return True
            if row.tombstone:
                return True
            row.tombstone = True
            from datetime import datetime, timezone

            row.updated_at = datetime.now(timezone.utc).isoformat()
            return True

    def health(self, user_id: str | None = None) -> dict[str, Any]:
        base = {
            "ok": True,
            "backend": self.name,
            "dialect": self.dialect,
            "stats": {},
        }
        if user_id is None:
            return base
        uid = resolve_user_id(user_id)
        self._ensure_seeded(uid)
        with self._scope() as s:
            rows = list(s.scalars(select(MemoryRow).where(MemoryRow.user_id == uid)).all())
            active = sum(1 for r in rows if not r.tombstone)
            tombs = len(rows) - active
        base["stats"] = {"items": len(rows), "active": active, "tombstones": tombs}
        return base
