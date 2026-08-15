"""Migration one-shot LocalJson → PgAdapter.

Ne supprime pas les fichiers JSON. Idempotent (upsert par id+user_id).

    python -m jarvis_core.memory.migrate_json
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from ..auth.db import default_data_dir
from .adapters.local_json import LocalJsonAdapter
from .adapters.pg import PgAdapter
from .types import MemoryRecord

logger = logging.getLogger("jarvis.memory.migrate")


def migrate_user(
    user_id: str,
    *,
    src: LocalJsonAdapter,
    dest: PgAdapter,
) -> dict[str, Any]:
    records = src.list(user_id, include_tombstones=True, limit=10_000, offset=0)
    n = 0
    for rec in records:
        if not isinstance(rec, MemoryRecord):
            continue
        dest.upsert(rec)
        n += 1
    return {"user_id": user_id, "upserted": n}


def discover_json_user_ids(data_dir: Path | None = None) -> list[str]:
    root = (data_dir or default_data_dir()) / "users"
    if not root.is_dir():
        return []
    found: list[str] = []
    for child in sorted(root.iterdir()):
        if child.is_dir() and (child / "memories.json").is_file():
            found.append(child.name)
    return found


def migrate_local_json_to_pg(
    *,
    src: LocalJsonAdapter | None = None,
    dest: PgAdapter | None = None,
    user_ids: list[str] | None = None,
    data_dir: Path | None = None,
) -> dict[str, Any]:
    """Copie memories.json → table memories. JSON conservé."""
    source = src or LocalJsonAdapter()
    target = dest or PgAdapter()
    ids = list(user_ids) if user_ids is not None else discover_json_user_ids(data_dir)
    results = [migrate_user(uid, src=source, dest=target) for uid in ids]
    total = sum(r["upserted"] for r in results)
    logger.info("migrate json→pg · users=%s · records=%s", len(results), total)
    return {"ok": True, "users": results, "total": total}


def main() -> int:
    import json
    import sys

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    out = migrate_local_json_to_pg()
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
