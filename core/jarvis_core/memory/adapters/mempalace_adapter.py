"""MemPalaceAdapter — spike M3 (docs/architecture/JARVIS-Memory-V2.md).

Backend Memory V2 identique en contrat à `LocalJsonAdapter` (mêmes 6
méthodes : upsert/get/list/search/delete/health), mais appuyé sur le
stockage MemPalace (ChromaDB) au lieu d'un fichier JSON par utilisateur.

Ce que ce spike prouve : `MemoryAPI` peut consommer un backend MemPalace
sans le moindre changement à `api.py`, `policy.py`, `types.py`, ni au
pipeline Verification.

Ce que ce spike n'exploite PAS (hors scope M3, décision volontaire) :
mining, entity detection, knowledge graph, AAAK/dialect, recherche
sémantique par embeddings. Uniquement le contrat de stockage bas niveau
(`mempalace.backends.base`) + la recherche lexicale BM25
(`ChromaCollection.lexical_search`, capacité `supports_lexical_search`),
qui ne dépend d'aucun vecteur.

Un embedding factice (vecteur nul) est fourni explicitement à chaque
écriture pour ne jamais déclencher le téléchargement du modèle
d'embedding réel de MemPalace — la recherche du spike ne passe que par
`lexical_search`, indépendant des vecteurs.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..types import MemoryRecord, SearchHit

logger = logging.getLogger("jarvis.memory.mempalace")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemPalaceAdapter:
    """Spike M3 — backend Memory V2 sur MemPalace (ChromaDB), lecture/écriture."""

    name = "mempalace"

    _EMBED_DIM = 8  # arbitraire : jamais interrogé vectoriellement dans ce spike

    def __init__(self, *, root: Path | None = None, collection_name: str = "jarvis_memory") -> None:
        from mempalace.backends.base import PalaceRef
        from mempalace.backends.chroma import ChromaBackend

        self._root = root or (Path.home() / ".cache" / "jarvis-mempalace-spike")
        self._collection_name = collection_name
        self._backend = ChromaBackend()
        self._PalaceRef = PalaceRef
        self._collections: dict[str, Any] = {}

    def _collection(self, user_id: str):
        uid = (user_id or "local").strip() or "local"
        if uid in self._collections:
            return self._collections[uid]
        palace_dir = self._root / uid
        ref = self._PalaceRef(id=f"jarvis-{uid}", local_path=str(palace_dir))
        col = self._backend.get_collection(
            palace=ref, collection_name=self._collection_name, create=True,
        )
        self._collections[uid] = col
        return col

    @staticmethod
    def _fake_embedding() -> list[float]:
        return [0.0] * MemPalaceAdapter._EMBED_DIM

    @staticmethod
    def _to_metadata(record: MemoryRecord) -> dict[str, Any]:
        # Chroma metadata = scalaires seulement -> aplati, imbriqué en JSON.
        return {
            "user_id": record.user_id,
            "kind": record.kind,
            "title": record.title or "",
            "summary": record.summary or "",
            "wing": record.scope.wing or "",
            "room": record.scope.room or "",
            "device_id": record.scope.device_id or "",
            "mission_id": record.scope.mission_id or "",
            "session_id": record.scope.session_id or "",
            "tags": json.dumps(record.tags),
            "source": json.dumps(record.source.to_dict()),
            "evidence": json.dumps(record.evidence.to_dict()) if record.evidence else "",
            "created_at": record.created_at,
            "updated_at": record.updated_at,
            "importance": record.importance,
            "ttl_days": record.ttl_days if record.ttl_days is not None else -1,
            "tombstone": record.tombstone,
            "synced": record.synced,
        }

    @staticmethod
    def _from_row(
        record_id: str, document: str, meta: dict[str, Any], *, default_user_id: str
    ) -> MemoryRecord:
        raw = {
            "id": record_id,
            "user_id": meta.get("user_id") or default_user_id,
            "kind": meta.get("kind") or "note",
            "content": document or "",
            "title": meta.get("title") or None,
            "summary": meta.get("summary") or None,
            "scope": {
                "wing": meta.get("wing") or None,
                "room": meta.get("room") or None,
                "device_id": meta.get("device_id") or None,
                "mission_id": meta.get("mission_id") or None,
                "session_id": meta.get("session_id") or None,
            },
            "tags": json.loads(meta.get("tags") or "[]"),
            "source": json.loads(meta.get("source") or "{}"),
            "evidence": json.loads(meta["evidence"]) if meta.get("evidence") else None,
            "created_at": meta.get("created_at") or "",
            "updated_at": meta.get("updated_at") or "",
            "importance": meta.get("importance") or "normal",
            "ttl_days": meta.get("ttl_days") if meta.get("ttl_days", -1) != -1 else None,
            "tombstone": bool(meta.get("tombstone")),
            "synced": bool(meta.get("synced", True)),
        }
        return MemoryRecord.from_dict(raw, default_user_id=default_user_id)

    # ── contrat backend (identique à LocalJsonAdapter) ──────────────────

    def upsert(self, record: MemoryRecord) -> str:
        col = self._collection(record.user_id)
        now = _utc_now()
        record.updated_at = now
        if not record.created_at:
            record.created_at = now
        col.upsert(
            documents=[record.content],
            ids=[record.id],
            metadatas=[self._to_metadata(record)],
            embeddings=[self._fake_embedding()],
        )
        return record.id

    def get(self, memory_id: str, user_id: str) -> MemoryRecord | None:
        col = self._collection(user_id)
        res = col.get(ids=[memory_id], include=["documents", "metadatas"])
        if not res.ids:
            return None
        return self._from_row(
            res.ids[0], res.documents[0], res.metadatas[0] or {}, default_user_id=user_id
        )

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
        col = self._collection(user_id)
        res = col.get(include=["documents", "metadatas"], limit=10_000, offset=0)
        out: list[MemoryRecord] = []
        for rid, doc, meta in zip(res.ids, res.documents, res.metadatas or []):
            rec = self._from_row(rid, doc, meta or {}, default_user_id=user_id)
            if not include_tombstones and rec.tombstone:
                continue
            if kinds and rec.kind not in set(kinds):
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
        col = self._collection(user_id)
        result = col.lexical_search(query=query, n_results=max(limit * 3, limit))
        hits: list[SearchHit] = []
        for h in result.hits:
            meta = h.metadata or {}
            rec = self._from_row(h.id, h.document, meta, default_user_id=user_id)
            if not include_tombstones and rec.tombstone:
                continue
            if kinds and rec.kind not in set(kinds):
                continue
            if wing and (rec.scope.wing or "") != wing:
                continue
            if room and (rec.scope.room or "") != room:
                continue
            if since and rec.created_at and rec.created_at < since:
                continue
            hits.append(SearchHit(record=rec, score=h.score, snippet=(rec.content or "")[:240]))
            if len(hits) >= limit:
                break
        return hits

    def delete(self, memory_id: str, user_id: str, *, hard: bool = False) -> bool:
        col = self._collection(user_id)
        existing = self.get(memory_id, user_id)
        if existing is None:
            return False
        if hard:
            col.delete(ids=[memory_id])
            return True
        existing.tombstone = True
        existing.updated_at = _utc_now()
        col.update(ids=[memory_id], metadatas=[self._to_metadata(existing)])
        return True

    def health(self, user_id: str | None = None) -> dict[str, Any]:
        if user_id is None:
            return {"ok": True, "backend": self.name, "stats": {}}
        col = self._collection(user_id)
        return {"ok": True, "backend": self.name, "stats": {"items": col.count()}}

    def close(self) -> None:
        """Libère les handles ChromaDB (verrous SQLite/HNSW).

        Windows ne relâche pas ces verrous à la sortie de process comme
        Unix — un appelant qui nettoie un répertoire temporaire juste après
        (tests, smoke) doit appeler ceci avant, sous peine de
        PermissionError sur le fichier `data_level0.bin`.
        """
        self._backend.close()
        self._collections.clear()
