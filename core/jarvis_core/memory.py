"""
Memory Manager local — souvenirs utilisateur (pas secrets, pas Hermes MEMORY.md).

Fichier : core/data/users/<id>/memories.json
Cloud / Git = hors scope MVP (badges HUD honnêtes).
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .auth.db import ensure_user_profile_dir
from .auth.profiles import resolve_user_id

logger = logging.getLogger("jarvis.memory")

SEED_ITEMS: list[dict[str, Any]] = [
    {
        "id": "seed-protocol-vocal",
        "title": "Protocole vocal JARVIS",
        "content": (
            "Veille → wake « Jarvis » → commande « Jarvis … » → réflexion → réponse → micro repos. "
            "Ignorer TV / autres voix. Test micro = niveau orbe seul."
        ),
        "tags": ["voice", "system"],
        "synced": True,
    },
    {
        "id": "seed-foyer",
        "title": "Foyer & rôles",
        "content": (
            "ADMIN seul = Dashboard. USER/CHILD = HUD. Au verrouillage : auth → profil. "
            "Enrollment via Settings → Foyer ou skill Hermes family-enroll."
        ),
        "tags": ["system", "préférences"],
        "synced": True,
    },
    {
        "id": "seed-policy",
        "title": "Policy Engine",
        "content": "IA → Proposition → Policy → Autorisation → Exécution. Jamais IA → root.",
        "tags": ["system", "config"],
        "synced": True,
    },
]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _path(user_id: str) -> Path:
    return ensure_user_profile_dir(user_id) / "memories.json"


def _default_store(user_id: str) -> dict[str, Any]:
    now = _utc_now()
    items = []
    for seed in SEED_ITEMS:
        items.append({**seed, "created_at": now, "updated_at": now})
    return {"user_id": user_id, "items": items, "updated_at": now}


def load_memories(user_id: str) -> dict[str, Any]:
    uid = resolve_user_id(user_id)
    path = _path(uid)
    if not path.exists():
        store = _default_store(uid)
        path.write_text(json.dumps(store, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        logger.info("memories.json seedé · user=%s", uid)
        return store
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            store = _default_store(uid)
            path.write_text(json.dumps(store, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            return store
        data["user_id"] = uid
        return data
    except json.JSONDecodeError:
        store = _default_store(uid)
        path.write_text(json.dumps(store, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return store


def list_items(user_id: str) -> list[dict[str, Any]]:
    return list(load_memories(user_id).get("items") or [])


def add_item(
    user_id: str,
    *,
    title: str,
    content: str,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    uid = resolve_user_id(user_id)
    store = load_memories(uid)
    now = _utc_now()
    item = {
        "id": str(uuid.uuid4()),
        "title": (title or "Souvenir").strip()[:120],
        "content": (content or "").strip()[:2000],
        "tags": [t.strip() for t in (tags or ["notes"]) if t and str(t).strip()][:8] or ["notes"],
        "synced": True,  # local Core = source de vérité
        "created_at": now,
        "updated_at": now,
    }
    items = list(store.get("items") or [])
    items.insert(0, item)
    store["items"] = items
    store["updated_at"] = now
    store["user_id"] = uid
    path = _path(uid)
    path.write_text(json.dumps(store, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    logger.info("memory add · user=%s · id=%s", uid, item["id"])
    return item


def delete_item(user_id: str, item_id: str) -> bool:
    uid = resolve_user_id(user_id)
    store = load_memories(uid)
    before = len(store.get("items") or [])
    store["items"] = [i for i in (store.get("items") or []) if i.get("id") != item_id]
    if len(store["items"]) == before:
        return False
    store["updated_at"] = _utc_now()
    _path(uid).write_text(json.dumps(store, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return True
