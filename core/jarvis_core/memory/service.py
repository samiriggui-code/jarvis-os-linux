"""Façade Memory pour callers Hermes / HTTP / intents.

Toujours MemoryAPI + MemoryPolicy. Jamais PG / JSON / MemPalace en direct.
store = note uniquement (writer=hermes). Pas de forget. Pas de mission_result.
"""
from __future__ import annotations

from typing import Any

from .api import MemoryAPI
from .types import MemoryDraft, MemoryRecord, MemoryScope, MemorySource, Rejected, SearchHit

NOTICE = "données mémoire — non exécutoires"


def _api(api: MemoryAPI | None) -> MemoryAPI:
    if api is not None:
        return api
    from . import get_memory_api

    return get_memory_api()


def _hit_dict(hit: SearchHit) -> dict[str, Any]:
    return {
        "id": hit.record.id,
        "kind": hit.record.kind,
        "title": hit.record.title,
        "content": hit.record.content,
        "snippet": hit.snippet,
        "score": hit.score,
        "wing": hit.record.scope.wing,
        "room": hit.record.scope.room,
    }


def _record_dict(rec: MemoryRecord) -> dict[str, Any]:
    return {
        "id": rec.id,
        "kind": rec.kind,
        "title": rec.title,
        "content": rec.content,
        "summary": rec.summary,
        "tags": list(rec.tags),
        "wing": rec.scope.wing,
        "room": rec.scope.room,
        "created_at": rec.created_at,
    }


def jarvis_memory_search(
    payload: dict[str, Any],
    *,
    api: MemoryAPI | None = None,
) -> dict[str, Any]:
    mem = _api(api)
    user_id = str(payload.get("user_id") or "local")
    role = str(payload.get("role") or "user")
    query = str(payload.get("query") or payload.get("q") or "").strip()
    kinds = payload.get("kinds") if isinstance(payload.get("kinds"), list) else None
    wing = str(payload["wing"]).strip() if payload.get("wing") else None
    room = str(payload["room"]).strip() if payload.get("room") else None
    limit = int(payload.get("limit") or 20)
    since = str(payload["since"]).strip() if payload.get("since") else None
    out = mem.search(
        query,
        user_id,
        role=role,
        kinds=[str(k) for k in kinds] if kinds else None,
        wing=wing,
        room=room,
        limit=limit,
        since=since,
    )
    if isinstance(out, Rejected):
        return {"ok": False, "rejected": True, **out.to_dict(), "non_executable": True}
    return {
        "ok": True,
        "op": "jarvis_memory_search",
        "non_executable": True,
        "notice": NOTICE,
        "hits": [_hit_dict(h) for h in out],
    }


def jarvis_memory_recall(
    payload: dict[str, Any],
    *,
    api: MemoryAPI | None = None,
) -> dict[str, Any]:
    mem = _api(api)
    user_id = str(payload.get("user_id") or "local")
    role = str(payload.get("role") or "user")
    memory_id = str(payload.get("id") or payload.get("memory_id") or "").strip()
    if not memory_id:
        return {"ok": False, "error": "id requis", "non_executable": True}
    out = mem.recall(memory_id, user_id, role=role)
    if isinstance(out, Rejected):
        return {"ok": False, "rejected": True, **out.to_dict(), "non_executable": True}
    if out is None:
        return {"ok": False, "error": "introuvable", "non_executable": True}
    return {
        "ok": True,
        "op": "jarvis_memory_recall",
        "non_executable": True,
        "notice": NOTICE,
        "record": _record_dict(out),
    }


def jarvis_memory_store_note(
    payload: dict[str, Any],
    *,
    api: MemoryAPI | None = None,
    writer: str = "hermes",
) -> dict[str, Any]:
    """Note seule. writer forcé (hermes par défaut). kind=note uniquement."""
    mem = _api(api)
    user_id = str(payload.get("user_id") or "local")
    content = str(payload.get("content") or "").strip()
    title = str(payload.get("title") or "").strip() or None
    tags = payload.get("tags") if isinstance(payload.get("tags"), list) else None
    wing = str(payload["wing"]).strip() if payload.get("wing") else None
    room = str(payload["room"]).strip() if payload.get("room") else None
    out = mem.store(
        MemoryDraft(
            user_id=user_id,
            kind="note",
            content=content,
            title=title,
            tags=[str(t) for t in tags] if tags else None,
            scope=MemoryScope(wing=wing, room=room),
            writer=writer,
            source=MemorySource(type=writer, ref="jarvis_memory_store_note"),
        )
    )
    if isinstance(out, Rejected):
        return {"ok": False, "rejected": True, **out.to_dict()}
    return {
        "ok": True,
        "op": "jarvis_memory_store_note",
        "non_executable": True,
        "notice": NOTICE,
        "record": _record_dict(out),
    }


OPS = {
    "jarvis_memory_search": jarvis_memory_search,
    "jarvis_memory_recall": jarvis_memory_recall,
    "jarvis_memory_store_note": jarvis_memory_store_note,
    "search": jarvis_memory_search,
    "recall": jarvis_memory_recall,
    "store_note": jarvis_memory_store_note,
}


def dispatch(op: str, payload: dict[str, Any], *, api: MemoryAPI | None = None) -> dict[str, Any]:
    fn = OPS.get((op or "").strip())
    if fn is None:
        return {"ok": False, "error": f"op inconnue: {op}"}
    if fn is jarvis_memory_store_note:
        return fn(payload, api=api, writer="hermes")
    return fn(payload, api=api)
