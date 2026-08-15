"""Smoke M1 — MemoryAPI + MemoryPolicy + LocalJsonAdapter.

Sans MemPalace, sans Hermes, sans HUD, sans NUC, sans Verification (M2).

    python -m jarvis_core._smoke_memory
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _api(root: Path, store: list | None = None):
    from jarvis_core.memory import build_memory_api

    emit = None
    if store is not None:

        def emit(kind: str, payload: dict) -> None:
            store.append((kind, payload))

    return build_memory_api(root=root, emit=emit)


def test_store_note_and_search() -> None:
    from jarvis_core.memory import MemoryDraft, MemoryRecord, MemoryScope, MemorySource

    with tempfile.TemporaryDirectory() as tmp:
        events: list = []
        api = _api(Path(tmp), events)
        out = api.store(
            MemoryDraft(
                user_id="smoke-u1",
                kind="note",
                title="Rappel GSMS",
                content="Continuer le brief Windows Agent demain matin.",
                tags=["gsms", "windows-agent"],
                scope=MemoryScope(wing="project:gsms", room="notes"),
                writer="user",
                source=MemorySource(type="user", ref="smoke"),
            )
        )
        assert isinstance(out, MemoryRecord), out
        assert out.kind == "note"
        assert any(k == "MEMORY_STORED" for k, _ in events)

        hits = api.search("Windows Agent", "smoke-u1")
        assert not isinstance(hits, type(out)) or True
        assert isinstance(hits, list) and len(hits) >= 1
        assert "Windows Agent" in hits[0].record.content or "Windows Agent" in (
            hits[0].record.title or ""
        ) or any("windows" in t for t in hits[0].record.tags)
        assert hits[0].snippet  # verbatim snippet
        print("  OK — store note + search lexical")


def test_reject_mission_without_evidence() -> None:
    from jarvis_core.memory import MemoryDraft, Rejected

    with tempfile.TemporaryDirectory() as tmp:
        events: list = []
        api = _api(Path(tmp), events)
        out = api.store(
            MemoryDraft(
                user_id="smoke-u1",
                kind="mission_result",
                content="Install Windows Agent OK",
                writer="verification",
            )
        )
        assert isinstance(out, Rejected), out
        assert out.code == "no_evidence"
        assert any(k == "MEMORY_REJECTED" for k, _ in events)
        print("  OK — mission_result sans evidence → Rejected(no_evidence)")


def test_accept_mission_with_evidence() -> None:
    from jarvis_core.memory import MemoryDraft, MemoryEvidence, MemoryRecord, MemoryScope

    with tempfile.TemporaryDirectory() as tmp:
        api = _api(Path(tmp))
        out = api.store(
            MemoryDraft(
                user_id="smoke-u1",
                kind="mission_result",
                title="Windows Agent installé",
                content=(
                    "2026-08-12 · Windows Agent installé sur PC. "
                    "WebSocket Core connecté. Capabilities smoke OK. Processus actif."
                ),
                scope=MemoryScope(wing="pc-windows", room="missions"),
                writer="verification",
                evidence=MemoryEvidence(
                    observed="processus actif + ws connected",
                    validated=True,
                    validator="core.verify",
                ),
                importance="high",
            )
        )
        assert isinstance(out, MemoryRecord), out
        hits = api.search("Windows Agent installé", "smoke-u1", kinds=["mission_result"])
        assert isinstance(hits, list) and len(hits) == 1
        assert hits[0].record.evidence and hits[0].record.evidence.validated
        print("  OK — mission_result + evidence.validated → store + search")


def test_reject_secret() -> None:
    from jarvis_core.memory import MemoryDraft, Rejected

    with tempfile.TemporaryDirectory() as tmp:
        api = _api(Path(tmp))
        out = api.store(
            MemoryDraft(
                user_id="smoke-u1",
                kind="note",
                content="Voici la clé api_key=sk-abcdefghijklmnopqrstuvwxyz012345",
                writer="user",
            )
        )
        assert isinstance(out, Rejected), out
        assert out.code == "secret_detected"

        # P1 : secret uniquement dans summary (content/title propres)
        out_sum = api.store(
            MemoryDraft(
                user_id="smoke-u1",
                kind="note",
                content="Note sans secret dans le corps",
                summary="backup password=SuperSecret99",
                writer="user",
            )
        )
        assert isinstance(out_sum, Rejected), out_sum
        assert out_sum.code == "secret_detected"
        print("  OK — secret_detected (content + summary)")


def test_hermes_cannot_store_mission_or_forget() -> None:
    from jarvis_core.memory import MemoryDraft, MemoryEvidence, Rejected

    with tempfile.TemporaryDirectory() as tmp:
        api = _api(Path(tmp))
        # Hermes ne store pas mission_result
        out = api.store(
            MemoryDraft(
                user_id="smoke-u1",
                kind="mission_result",
                content="fake success",
                writer="hermes",
                evidence=MemoryEvidence(observed="x", validated=True),
            )
        )
        assert isinstance(out, Rejected) and out.code == "denied_kind"

        # Prépare une note puis forget hermes → denied
        note = api.store(
            MemoryDraft(user_id="smoke-u1", kind="note", content="note hermes test", writer="user")
        )
        assert not isinstance(note, Rejected)
        fr = api.forget(note.id, "smoke-u1", writer="hermes", role="user")
        assert fr.denied and not fr.ok
        print("  OK — hermes denied mission_result + forget")


def test_child_cannot_read() -> None:
    from jarvis_core.memory import MemoryDraft, Rejected

    with tempfile.TemporaryDirectory() as tmp:
        api = _api(Path(tmp))
        api.store(MemoryDraft(user_id="smoke-u1", kind="note", content="secret foyer", writer="user"))
        denied = api.list("smoke-u1", role="child")
        assert isinstance(denied, Rejected) and denied.code == "denied_role"
        denied_s = api.search("foyer", "smoke-u1", role="child")
        assert isinstance(denied_s, Rejected)
        print("  OK — child memory.read denied")


def test_soft_forget_and_hard_admin() -> None:
    from jarvis_core.memory import MemoryDraft

    with tempfile.TemporaryDirectory() as tmp:
        api = _api(Path(tmp))
        rec = api.store(
            MemoryDraft(user_id="smoke-u1", kind="note", content="à oublier", writer="user")
        )
        assert not isinstance(rec, type(None))
        mid = rec.id  # type: ignore[union-attr]
        soft = api.forget(mid, "smoke-u1", hard=False, role="user", writer="user")
        assert soft.ok and not soft.hard
        assert api.recall(mid, "smoke-u1") is None
        hard_denied = api.forget(mid, "smoke-u1", hard=True, role="user", writer="user")
        assert hard_denied.denied
        hard_ok = api.forget(mid, "smoke-u1", hard=True, role="admin", writer="user")
        assert hard_ok.ok and hard_ok.hard
        print("  OK — soft forget + hard admin only")


def test_seed_policy_search() -> None:
    """« Pourquoi Policy avant root ? » retrouve le seed decision verbatim."""
    with tempfile.TemporaryDirectory() as tmp:
        api = _api(Path(tmp))
        # seed créé au premier list/load
        items = api.list("smoke-u1")
        assert isinstance(items, list) and any(i.id == "seed-policy" for i in items)
        hits = api.search("Jamais IA → root", "smoke-u1", kinds=["decision"])
        assert isinstance(hits, list) and len(hits) >= 1
        assert "Jamais IA → root" in hits[0].record.content
        print("  OK — seed Policy Engine searchable verbatim")


def test_inspect_backend() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        api = _api(Path(tmp))
        api.list("smoke-u1")
        info = api.inspect("smoke-u1")
        assert isinstance(info, dict)
        assert info["backend"] == "local_json"
        assert info["counts"]["active"] >= 3
        print("  OK — inspect local_json")


def test_v1_compat_shim() -> None:
    """WS historique : list_items / add_item / delete_item / load_memories."""
    import jarvis_core.memory as mem
    from jarvis_core.memory import build_memory_api, reset_memory_api_for_tests

    with tempfile.TemporaryDirectory() as tmp:
        reset_memory_api_for_tests()
        mem._default_api = build_memory_api(root=Path(tmp))  # noqa: SLF001
        try:
            item = mem.add_item("smoke-v1", title="V1", content="note via shim", tags=["notes"])
            assert item["id"] and item["content"] == "note via shim"
            listed = mem.list_items("smoke-v1")
            assert any(i["id"] == item["id"] for i in listed)
            blob = mem.load_memories("smoke-v1")
            assert blob["user_id"] == "smoke-v1"
            assert any(i["id"] == item["id"] for i in blob["items"])
            assert mem.delete_item("smoke-v1", item["id"]) is True
            assert all(i["id"] != item["id"] for i in mem.list_items("smoke-v1"))
        finally:
            reset_memory_api_for_tests()
        print("  OK — V1 shim list/add/delete/load_memories")


def test_bind_emit_on_singleton() -> None:
    """Runtime : get_memory_api(emit=…) raccroche le bus après construction."""
    import jarvis_core.memory as mem
    from jarvis_core.memory import MemoryDraft, MemorySource, reset_memory_api_for_tests

    with tempfile.TemporaryDirectory() as tmp:
        reset_memory_api_for_tests()
        mem._default_api = mem.build_memory_api(root=Path(tmp))  # noqa: SLF001
        events: list = []

        def emit(kind: str, payload: dict) -> None:
            events.append((kind, payload))

        try:
            api = mem.get_memory_api(emit=emit)
            api.store(
                MemoryDraft(
                    user_id="smoke-emit",
                    kind="note",
                    content="bus Memory branché au runtime",
                    writer="user",
                    source=MemorySource(type="user", ref="smoke"),
                )
            )
            assert any(k == "MEMORY_STORED" for k, _ in events)
        finally:
            reset_memory_api_for_tests()
        print("  OK — bind_emit singleton → MEMORY_STORED")


def main() -> int:
    print("=== smoke memory M1 ===")
    test_store_note_and_search()
    test_reject_mission_without_evidence()
    test_accept_mission_with_evidence()
    test_reject_secret()
    test_hermes_cannot_store_mission_or_forget()
    test_child_cannot_read()
    test_soft_forget_and_hard_admin()
    test_seed_policy_search()
    test_inspect_backend()
    test_v1_compat_shim()
    test_bind_emit_on_singleton()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
