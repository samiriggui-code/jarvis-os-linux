"""Smoke PgAdapter — Memory V2 contrat identique à LocalJson, backend SQL.

Isole une SQLite temporaire + Alembic 005 (même migration que PG prod).
FTS natif uniquement si le dialecte est postgresql ; sinon scoring lexical.

    python -m jarvis_core._smoke_memory_pg
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

_PREV_URL = os.environ.get("JARVIS_DATABASE_URL")


def _setup(tmp: Path) -> tuple:
    from jarvis_core.db import session as db_session
    from jarvis_core.db.session import run_migrations
    from jarvis_core.memory.adapters.pg import PgAdapter
    from jarvis_core.memory.api import MemoryAPI
    from jarvis_core.memory.policy import MemoryPolicy

    tmp.mkdir(parents=True, exist_ok=True)
    db_url = f"sqlite:///{(tmp / 'memory.db').as_posix()}"
    os.environ["JARVIS_DATABASE_URL"] = db_url
    db_session.reset_engine()
    run_migrations(url=db_url)
    backend = PgAdapter(url=db_url)
    events: list = []

    def emit(kind: str, payload: dict) -> None:
        events.append((kind, payload))

    api = MemoryAPI(backend=backend, policy=MemoryPolicy(), emit=emit)
    return api, backend, events, db_url


def _restore() -> None:
    from jarvis_core.db import session as db_session
    from jarvis_core.memory import reset_memory_api_for_tests

    if _PREV_URL is None:
        os.environ.pop("JARVIS_DATABASE_URL", None)
    else:
        os.environ["JARVIS_DATABASE_URL"] = _PREV_URL
    db_session.reset_engine()
    reset_memory_api_for_tests()


def test_crud_search_isolation_policy(tmp: Path) -> None:
    from jarvis_core.memory.types import MemoryDraft, MemoryRecord, MemoryScope, MemorySource, Rejected

    api, backend, events, _url = _setup(tmp)
    assert backend.dialect in ("sqlite", "postgresql"), backend.dialect
    print(f"  dialect={backend.dialect}")

    rec = api.store(
        MemoryDraft(
            user_id="pg-u1",
            kind="note",
            title="Rappel GSMS",
            content="Continuer le brief Windows Agent demain matin.",
            tags=["gsms", "windows-agent"],
            scope=MemoryScope(wing="project:gsms", room="notes"),
            writer="user",
            source=MemorySource(type="user", ref="smoke-pg"),
        )
    )
    assert isinstance(rec, MemoryRecord), rec
    got = api.recall(rec.id, "pg-u1")
    assert got is not None and got.content == rec.content
    print("  OK — CRUD store/recall")

    hits = api.search("Windows Agent", "pg-u1")
    assert isinstance(hits, list) and len(hits) == 1
    assert hits[0].record.id == rec.id
    print("  OK — search retrouve Windows Agent")

    api.store(
        MemoryDraft(
            user_id="pg-u2",
            kind="note",
            content="Souvenir de l'autre utilisateur, Windows Agent aussi.",
            writer="user",
        )
    )
    hits_u1 = api.search("Windows Agent", "pg-u1")
    assert isinstance(hits_u1, list) and all(h.record.user_id == "pg-u1" for h in hits_u1)
    assert api.recall(rec.id, "pg-u2") is None
    listed_u2 = api.list("pg-u2")
    assert isinstance(listed_u2, list)
    assert all(r.id != rec.id for r in listed_u2)
    print("  OK — isolation user_id")

    secret = api.store(
        MemoryDraft(
            user_id="pg-u1",
            kind="note",
            content="Voici la clé api_key=sk-abcdefghijklmnopqrstuvwxyz012345",
            writer="user",
        )
    )
    assert isinstance(secret, Rejected) and secret.code == "secret_detected"
    print("  OK — policy secret_detected")

    soft = api.forget(rec.id, "pg-u1", hard=False, role="user", writer="user")
    assert soft.ok and not soft.hard
    assert api.recall(rec.id, "pg-u1") is None
    still = backend.get(rec.id, "pg-u1")
    assert still is not None and still.tombstone is True
    print("  OK — soft forget / tombstone")

    info = api.inspect("pg-u1")
    assert isinstance(info, dict) and info["backend"] == "postgres"
    print("  OK — inspect backend=postgres")


def test_verification_gate_and_idempotence(tmp: Path) -> None:
    from jarvis_core.memory.api import MemoryAPI
    from jarvis_core.memory.policy import MemoryPolicy
    from jarvis_core.memory.adapters.pg import PgAdapter
    from jarvis_core.verification import (
        Observation,
        RESULT_VALIDATED,
        VerificationPipeline,
        VerificationRequest,
    )

    api, backend, events, db_url = _setup(tmp)
    pipe = VerificationPipeline(memory_api=api, emit=lambda k, p: events.append((k, p)))

    def req(**kwargs):
        defaults = dict(
            mission_id="m-win-agent-pg",
            user_id="pg-m2",
            intent="windows.agent.install",
            proposition="Installer Windows Agent",
            action_demanded="install",
            claimed_result="ok",
            claimed_success=True,
            observe=Observation(
                observed="Windows Agent process actif ; WebSocket connected",
                success=True,
            ),
            device_id="pc-1",
            wing="pc-windows",
            room="missions",
            title="Windows Agent installé",
            importance="high",
        )
        defaults.update(kwargs)
        return VerificationRequest(**defaults)

    out = pipe.run(req())
    assert out.validated and out.stage == RESULT_VALIDATED
    assert out.memory_status == "stored"
    items = api.list("pg-m2", kinds=["mission_result"])
    assert isinstance(items, list) and len(items) == 1
    print("  OK — mission_result uniquement après RESULT_VALIDATED")

    out2 = pipe.run(req())
    assert out2.validated
    items2 = api.list("pg-m2", kinds=["mission_result"])
    assert isinstance(items2, list) and len(items2) == 1
    print("  OK — replay/idempotence (1 record)")

    from jarvis_core.memory.types import MemoryDraft, MemoryEvidence, Rejected

    denied = api.store(
        MemoryDraft(
            user_id="pg-m2",
            kind="mission_result",
            content="fake",
            writer="hermes",
            evidence=MemoryEvidence(observed="x", validated=True),
        )
    )
    assert isinstance(denied, Rejected) and denied.code == "denied_kind"
    print("  OK — Hermes ne store pas mission_result")

    # Même contrat MemoryAPI : factory avec backend explicite
    api2 = MemoryAPI(backend=PgAdapter(url=db_url), policy=MemoryPolicy())
    hits = api2.search("Windows Agent", "pg-m2", kinds=["mission_result"])
    assert isinstance(hits, list) and len(hits) == 1
    print("  OK — compatibilité MemoryAPI (backend injecté)")


def test_migrate_json_to_pg(tmp: Path) -> None:
    from jarvis_core.memory.adapters.local_json import LocalJsonAdapter
    from jarvis_core.memory.adapters.pg import PgAdapter
    from jarvis_core.memory.migrate_json import migrate_local_json_to_pg
    from jarvis_core.memory.types import MemoryDraft, MemoryRecord
    from jarvis_core.memory.api import MemoryAPI
    from jarvis_core.memory.policy import MemoryPolicy

    json_root = tmp / "json"
    src = LocalJsonAdapter(root=json_root)
    json_api = MemoryAPI(backend=src, policy=MemoryPolicy())
    stored = json_api.store(
        MemoryDraft(
            user_id="mig-u1",
            kind="note",
            content="Note migrée depuis JSON vers PG — Windows Agent.",
            writer="user",
        )
    )
    assert isinstance(stored, MemoryRecord)

    api, dest, _events, _url = _setup(tmp / "pg")
    out = migrate_local_json_to_pg(src=src, dest=dest, user_ids=["mig-u1"])
    assert out["ok"] and out["total"] >= 1
    hits = api.search("Windows Agent", "mig-u1")
    assert isinstance(hits, list) and any("migrée" in h.record.content for h in hits)
    assert (json_root / "mig-u1" / "memories.json").is_file()
    print("  OK — migration JSON→PG (JSON conservé)")


def main() -> int:
    print("=== smoke memory PgAdapter ===")
    tmpdir = tempfile.TemporaryDirectory()
    try:
        root = Path(tmpdir.name)
        test_crud_search_isolation_policy(root / "a")
        test_verification_gate_and_idempotence(root / "b")
        test_migrate_json_to_pg(root / "c")
        print("=== ALL OK ===")
        return 0
    finally:
        _restore()
        try:
            tmpdir.cleanup()
        except OSError:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
