"""
Memory Manager V2 — souvenirs utilisateur (pas secrets, pas Hermes MEMORY.md).

Package : jarvis_core.memory
Prod : PgAdapter (PostgreSQL) via build_memory_api() si DSN PG.
Fallback / tests : LocalJsonAdapter (root= ou DSN absent).

Compat V1 (WS handle_memory) : list_items / add_item / delete_item / load_memories.
"""
from __future__ import annotations

from typing import Any

from .adapters.local_json import SEED_RECORDS
from .api import MemoryAPI, build_memory_api
from .events import (
    MEMORY_FORGOTTEN,
    MEMORY_KINDS,
    MEMORY_RECALLED,
    MEMORY_REJECTED,
    MEMORY_STORE_REJECTED,
    MEMORY_STORED,
)
from .policy import MemoryPolicy, draft_from_mapping
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

# Seeds exposés pour smoke / migration (forme dict legacy-friendly).
SEED_ITEMS: list[dict[str, Any]] = [
    {
        "id": s["id"],
        "title": s["title"],
        "content": s["content"],
        "tags": list(s.get("tags") or []),
        "synced": True,
    }
    for s in SEED_RECORDS
]

_default_api: MemoryAPI | None = None


def get_memory_api(*, emit: Any | None = None) -> MemoryAPI:
    """Singleton runtime. `emit` raccroche le bus Core au premier appel ou après."""
    global _default_api
    if _default_api is None:
        _default_api = build_memory_api(emit=emit)
    elif emit is not None:
        _default_api.bind_emit(emit)
    return _default_api


def reset_memory_api_for_tests() -> None:
    """Uniquement pour smokes — ne pas appeler en prod."""
    global _default_api
    _default_api = None


# --- Compat V1 (WS) ---------------------------------------------------------


def load_memories(user_id: str) -> dict[str, Any]:
    """Compat V1 — passe par MemoryAPI (PG ou JSON), jamais un adapter direct."""
    api = get_memory_api()
    result = api.list(user_id, role="user")
    items = [] if isinstance(result, Rejected) else [r.to_legacy_item() for r in result]
    return {"user_id": user_id, "items": items}


def list_items(user_id: str) -> list[dict[str, Any]]:
    api = get_memory_api()
    result = api.list(user_id, role="user")
    if isinstance(result, Rejected):
        return []
    return [r.to_legacy_item() for r in result]


def add_item(
    user_id: str,
    *,
    title: str,
    content: str,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    api = get_memory_api()
    out = api.store(
        MemoryDraft(
            user_id=user_id,
            kind="note",
            content=content,
            title=title,
            tags=tags or ["notes"],
            writer="user",
            source=MemorySource(type="user", ref="ws:memory.add"),
        )
    )
    if isinstance(out, Rejected):
        raise ValueError(f"{out.code}: {out.reason}")
    return out.to_legacy_item()


def delete_item(user_id: str, item_id: str) -> bool:
    """Compat V1 : suppression hard (comportement historique WS)."""
    api = get_memory_api()
    result = api.forget(item_id, user_id, hard=True, role="admin", writer="user")
    return result.ok


__all__ = [
    "ForgetResult",
    "MEMORY_FORGOTTEN",
    "MEMORY_KINDS",
    "MEMORY_RECALLED",
    "MEMORY_REJECTED",
    "MEMORY_STORE_REJECTED",
    "MEMORY_STORED",
    "MemoryAPI",
    "MemoryDraft",
    "MemoryEvidence",
    "MemoryPolicy",
    "MemoryRecord",
    "MemoryScope",
    "MemorySource",
    "Rejected",
    "SEED_ITEMS",
    "SearchHit",
    "add_item",
    "build_memory_api",
    "delete_item",
    "draft_from_mapping",
    "get_memory_api",
    "list_items",
    "load_memories",
    "reset_memory_api_for_tests",
]
