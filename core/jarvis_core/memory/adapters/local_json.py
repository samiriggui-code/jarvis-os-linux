"""LocalJsonAdapter — memories.json par user (compat V1)."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ...auth.db import ensure_user_profile_dir
from ...auth.profiles import resolve_user_id
from ..types import MemoryRecord, SearchHit

logger = logging.getLogger("jarvis.memory.local_json")

SEED_RECORDS: list[dict[str, Any]] = [
    {
        "id": "seed-protocol-vocal",
        "kind": "decision",
        "title": "Protocole vocal JARVIS",
        "content": (
            "Veille → wake « Jarvis » → commande « Jarvis … » → réflexion → réponse → micro repos. "
            "Ignorer TV / autres voix. Test micro = niveau orbe seul."
        ),
        "tags": ["voice", "system"],
        "scope": {"wing": "jarvis-os", "room": "preferences"},
        "source": {"type": "system", "ref": "seed"},
        "importance": "high",
        "synced": True,
    },
    {
        "id": "seed-foyer",
        "kind": "relation",
        "title": "Foyer & rôles",
        "content": (
            "ADMIN seul = Dashboard. USER/CHILD = HUD. Au verrouillage : auth → profil. "
            "Enrollment via Settings → Foyer ou skill Hermes family-enroll."
        ),
        "tags": ["system", "préférences"],
        "scope": {"wing": "foyer", "room": "preferences"},
        "source": {"type": "system", "ref": "seed"},
        "importance": "normal",
        "synced": True,
    },
    {
        "id": "seed-policy",
        "kind": "decision",
        "title": "Policy Engine",
        "content": "IA → Proposition → Policy → Autorisation → Exécution. Jamais IA → root.",
        "tags": ["system", "config"],
        "scope": {"wing": "jarvis-os", "room": "decisions"},
        "source": {"type": "system", "ref": "seed"},
        "importance": "critical",
        "synced": True,
    },
]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class LocalJsonAdapter:
    """Backend fichier JSON. Search = score lexical simple (pas d'embeddings)."""

    name = "local_json"

    def __init__(self, *, root: Path | None = None) -> None:
        """Si `root` est fourni (smoke), stocke sous root/<user_id>/memories.json."""
        self._root = root

    def _path(self, user_id: str) -> Path:
        uid = resolve_user_id(user_id)
        if self._root is not None:
            d = self._root / uid
            d.mkdir(parents=True, exist_ok=True)
            return d / "memories.json"
        return ensure_user_profile_dir(uid) / "memories.json"

    def _default_store(self, user_id: str) -> dict[str, Any]:
        now = _utc_now()
        items: list[dict[str, Any]] = []
        for seed in SEED_RECORDS:
            rec = MemoryRecord.from_dict({**seed, "user_id": user_id, "created_at": now, "updated_at": now})
            items.append(rec.to_dict())
        return {"user_id": user_id, "schema": "memory_v2", "items": items, "updated_at": now}

    def _load(self, user_id: str) -> dict[str, Any]:
        uid = resolve_user_id(user_id)
        path = self._path(uid)
        if not path.exists():
            store = self._default_store(uid)
            self._write(path, store)
            logger.info("memories.json seedé · user=%s · backend=local_json", uid)
            return store
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or not isinstance(data.get("items"), list):
                store = self._default_store(uid)
                self._write(path, store)
                return store
            data["user_id"] = uid
            # Migration douce : items V1 sans kind → note
            migrated = False
            new_items: list[dict[str, Any]] = []
            for raw in data["items"]:
                if not isinstance(raw, dict):
                    continue
                if "kind" not in raw:
                    raw = {**raw, "kind": "note", "user_id": uid}
                    migrated = True
                new_items.append(MemoryRecord.from_dict(raw, default_user_id=uid).to_dict())
            data["items"] = new_items
            data.setdefault("schema", "memory_v2")
            if migrated:
                self._write(path, data)
            return data
        except json.JSONDecodeError:
            store = self._default_store(uid)
            self._write(path, store)
            return store

    @staticmethod
    def _write(path: Path, store: dict[str, Any]) -> None:
        path.write_text(json.dumps(store, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def upsert(self, record: MemoryRecord) -> str:
        uid = resolve_user_id(record.user_id)
        store = self._load(uid)
        items = list(store.get("items") or [])
        now = _utc_now()
        record.user_id = uid
        record.updated_at = now
        if not record.created_at:
            record.created_at = now
        found = False
        for i, raw in enumerate(items):
            if isinstance(raw, dict) and raw.get("id") == record.id:
                items[i] = record.to_dict()
                found = True
                break
        if not found:
            items.insert(0, record.to_dict())
        store["items"] = items
        store["updated_at"] = now
        store["user_id"] = uid
        self._write(self._path(uid), store)
        return record.id

    def get(self, memory_id: str, user_id: str) -> MemoryRecord | None:
        uid = resolve_user_id(user_id)
        for raw in self._load(uid).get("items") or []:
            if isinstance(raw, dict) and raw.get("id") == memory_id:
                rec = MemoryRecord.from_dict(raw, default_user_id=uid)
                return rec
        return None

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
        kind_set = set(kinds) if kinds else None
        out: list[MemoryRecord] = []
        for raw in self._load(uid).get("items") or []:
            if not isinstance(raw, dict):
                continue
            rec = MemoryRecord.from_dict(raw, default_user_id=uid)
            if not include_tombstones and rec.tombstone:
                continue
            if kind_set is not None and rec.kind not in kind_set:
                continue
            if wing and (rec.scope.wing or "") != wing:
                continue
            if room and (rec.scope.room or "") != room:
                continue
            out.append(rec)
        return out[offset : offset + max(0, limit)]

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
        q = (query or "").strip().lower()
        tokens = [t for t in re.split(r"\s+", q) if t]
        records = self.list(
            user_id,
            kinds=kinds,
            wing=wing,
            room=room,
            limit=10_000,
            offset=0,
            include_tombstones=include_tombstones,
        )
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
            snippet = (rec.content or "")[:240]
            hits.append(SearchHit(record=rec, score=score, snippet=snippet))
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[: max(0, limit)]

    def delete(self, memory_id: str, user_id: str, *, hard: bool = False) -> bool:
        uid = resolve_user_id(user_id)
        store = self._load(uid)
        items = list(store.get("items") or [])
        now = _utc_now()
        if hard:
            new_items = [i for i in items if not (isinstance(i, dict) and i.get("id") == memory_id)]
            if len(new_items) == len(items):
                return False
            store["items"] = new_items
        else:
            found = False
            for i, raw in enumerate(items):
                if isinstance(raw, dict) and raw.get("id") == memory_id:
                    rec = MemoryRecord.from_dict(raw, default_user_id=uid)
                    if rec.tombstone:
                        return True
                    rec.tombstone = True
                    rec.updated_at = now
                    items[i] = rec.to_dict()
                    found = True
                    break
            if not found:
                return False
            store["items"] = items
        store["updated_at"] = now
        self._write(self._path(uid), store)
        return True

    def health(self, user_id: str | None = None) -> dict[str, Any]:
        if user_id is None:
            return {"ok": True, "backend": self.name, "stats": {}}
        uid = resolve_user_id(user_id)
        items = self._load(uid).get("items") or []
        active = sum(1 for i in items if isinstance(i, dict) and not i.get("tombstone"))
        tombs = sum(1 for i in items if isinstance(i, dict) and i.get("tombstone"))
        return {
            "ok": True,
            "backend": self.name,
            "stats": {"items": len(items), "active": active, "tombstones": tombs},
        }
