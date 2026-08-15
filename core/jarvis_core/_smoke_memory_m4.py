"""Smoke M4 — Hermes → Core MemoryAPI (jamais PG / JSON / MemPalace).

    python -m jarvis_core._smoke_memory_m4
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _api(root: Path):
    from jarvis_core.memory.api import build_memory_api

    return build_memory_api(root=root)


def test_search_recall_store_note() -> None:
    from jarvis_core.memory.service import (
        jarvis_memory_recall,
        jarvis_memory_search,
        jarvis_memory_store_note,
    )
    from jarvis_core.memory.types import MemoryDraft

    with tempfile.TemporaryDirectory() as tmp:
        api = _api(Path(tmp))
        stored = jarvis_memory_store_note(
            {"user_id": "m4-u1", "content": "Note Hermes sur Windows Agent.", "title": "WA"},
            api=api,
            writer="hermes",
        )
        assert stored.get("ok") is True, stored
        assert stored.get("non_executable") is True
        mid = stored["record"]["id"]

        hits = jarvis_memory_search(
            {"user_id": "m4-u1", "query": "Windows Agent", "role": "user"},
            api=api,
        )
        assert hits.get("ok") is True
        assert hits.get("non_executable") is True
        assert "non exécutoires" in hits.get("notice", "")
        assert any(h["id"] == mid for h in hits["hits"])

        rec = jarvis_memory_recall({"user_id": "m4-u1", "id": mid, "role": "user"}, api=api)
        assert rec.get("ok") is True
        assert rec["record"]["content"].startswith("Note Hermes")
        print("  OK — search / recall / store_note via MemoryAPI")


def test_hermes_cannot_mission_or_forget() -> None:
    from jarvis_core.memory.http import handle_http
    from jarvis_core.memory.service import jarvis_memory_store_note
    from jarvis_core.memory.types import MemoryDraft, MemoryEvidence, Rejected

    with tempfile.TemporaryDirectory() as tmp:
        api = _api(Path(tmp))
        # store_note force kind=note même si le payload ment
        out = jarvis_memory_store_note(
            {
                "user_id": "m4-u1",
                "kind": "mission_result",
                "content": "faux succès mission",
            },
            api=api,
            writer="hermes",
        )
        assert out.get("ok") is True
        assert out["record"]["kind"] == "note"

        denied = api.store(
            MemoryDraft(
                user_id="m4-u1",
                kind="mission_result",
                content="direct",
                writer="hermes",
                evidence=MemoryEvidence(observed="x", validated=True),
            )
        )
        assert isinstance(denied, Rejected) and denied.code == "denied_kind"

        note = api.store(MemoryDraft(user_id="m4-u1", kind="note", content="x", writer="user"))
        assert not isinstance(note, Rejected)
        fr = api.forget(note.id, "m4-u1", writer="hermes", role="user")
        assert fr.denied

        missing = handle_http("POST", "/v1/memory/forget", {"id": note.id, "user_id": "m4-u1"})
        assert missing.get("ok") is False
        print("  OK — mission_result et forget interdits à Hermes")


def test_http_dispatch_and_child_denied() -> None:
    from jarvis_core.memory.http import handle_http
    from jarvis_core.memory import reset_memory_api_for_tests
    from jarvis_core.memory.api import build_memory_api
    import jarvis_core.memory as mem

    with tempfile.TemporaryDirectory() as tmp:
        reset_memory_api_for_tests()
        mem._default_api = build_memory_api(root=Path(tmp))  # noqa: SLF001
        try:
            stored = handle_http(
                "POST",
                "/v1/memory/store_note",
                {"user_id": "m4-u1", "content": "via HTTP Windows Agent"},
            )
            assert stored.get("ok") is True, stored
            hits = handle_http(
                "POST",
                "/v1/memory/search",
                {"user_id": "m4-u1", "query": "Windows Agent", "role": "user"},
            )
            assert hits.get("ok") is True and hits.get("hits")
            child = handle_http(
                "POST",
                "/v1/memory/search",
                {"user_id": "m4-u1", "query": "Windows", "role": "child"},
            )
            assert child.get("ok") is False and child.get("code") == "denied_role"
            get = handle_http("GET", "/v1/memory/search", {})
            assert get.get("ok") is False
        finally:
            reset_memory_api_for_tests()
        print("  OK — HTTP loopback + child denied")


def test_capabilities_core_owned() -> None:
    from jarvis_core.capabilities import CAPABILITIES, Owner, for_intent

    for intent in ("memory.search", "memory.recall", "memory.store_note"):
        cap = for_intent(intent)
        assert cap is not None and cap.owner is Owner.CORE
        assert cap.toolset is None
    assert "memory-search" in CAPABILITIES
    print("  OK — intents Memory M4 = Owner.CORE, pas de toolset Hermes")


def main() -> int:
    print("=== smoke memory M4 Hermes → Core ===")
    test_search_recall_store_note()
    test_hermes_cannot_mission_or_forget()
    test_http_dispatch_and_child_denied()
    test_capabilities_core_owned()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
