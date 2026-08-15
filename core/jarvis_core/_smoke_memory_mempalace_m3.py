"""Smoke M3 — MemPalaceAdapter (spike, docs/architecture/JARVIS-Memory-V2.md).

Prouve que MemoryAPI fonctionne, sans modification, avec MemPalace comme
backend au lieu de LocalJsonAdapter — et qu'une recherche « Windows Agent »
retrouve le bon record via la recherche lexicale MemPalace (BM25, pas
d'embeddings).

Hors scope de ce smoke (hors scope M3) : MemPalaceAdapter comme backend par
défaut, mining, entity detection, knowledge graph, recherche sémantique,
Hermes, HUD, NUC.

    python -m jarvis_core._smoke_memory_mempalace_m3
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _api(root: Path, backend, store: list | None = None):
    from jarvis_core.memory.api import MemoryAPI
    from jarvis_core.memory.policy import MemoryPolicy

    emit = None
    if store is not None:

        def emit(kind: str, payload: dict) -> None:
            store.append((kind, payload))

    return MemoryAPI(backend=backend, policy=MemoryPolicy(), emit=emit)


def run() -> None:
    from jarvis_core.memory.adapters.mempalace_adapter import MemPalaceAdapter
    from jarvis_core.memory.types import MemoryDraft, MemoryRecord, MemoryScope, MemorySource
    from jarvis_core.memory.policy import MemoryPolicy

    with tempfile.TemporaryDirectory() as tmp:
        backend = MemPalaceAdapter(root=Path(tmp))
        try:
            events: list = []
            api = _api(Path(tmp), backend, events)

            # 1. store + recherche « Windows Agent » — l'objectif explicite du spike M3.
            rec = api.store(
                MemoryDraft(
                    user_id="smoke-m3",
                    kind="note",
                    title="Rappel GSMS",
                    content="Continuer le brief Windows Agent demain matin.",
                    tags=["gsms", "windows-agent"],
                    scope=MemoryScope(wing="project:gsms", room="notes"),
                    writer="user",
                    source=MemorySource(type="user", ref="smoke-m3"),
                )
            )
            assert isinstance(rec, MemoryRecord), rec
            assert any(k == "MEMORY_STORED" for k, _ in events)
            print("  OK — store note (backend=mempalace)")

            hits = api.search("Windows Agent", "smoke-m3")
            assert isinstance(hits, list)
            assert len(hits) == 1, hits
            assert hits[0].record.id == rec.id
            assert "Windows Agent" in hits[0].record.content
            print("  OK — recherche « Windows Agent » retrouve le record")

            # 2. bruit : un autre record qui ne doit PAS matcher.
            other = api.store(
                MemoryDraft(
                    user_id="smoke-m3",
                    kind="note",
                    title="Sans rapport",
                    content="Racheter du café pour la maison.",
                    writer="user",
                )
            )
            assert isinstance(other, MemoryRecord), other
            hits2 = api.search("Windows Agent", "smoke-m3")
            ids2 = {h.record.id for h in hits2}
            assert rec.id in ids2 and other.id not in ids2
            print("  OK — bruit non pertinent absent des résultats")

            # 3. get direct.
            fetched = api.recall(rec.id, "smoke-m3")
            assert isinstance(fetched, MemoryRecord) and fetched.id == rec.id
            print("  OK — recall par id")

            # 4. list + filtre par wing.
            listed = api.list("smoke-m3", wing="project:gsms")
            assert isinstance(listed, list) and any(r.id == rec.id for r in listed)
            listed_other_wing = api.list("smoke-m3", wing="autre-wing")
            assert not any(r.id == rec.id for r in listed_other_wing)
            print("  OK — list filtré par wing")

            # 5. policy inchangée : secret toujours refusé (même Policy, backend différent).
            secret = api.store(
                MemoryDraft(
                    user_id="smoke-m3",
                    kind="note",
                    content="password: hunter2",
                    writer="user",
                )
            )
            from jarvis_core.memory.types import Rejected

            assert isinstance(secret, Rejected) and secret.code == "secret_detected", secret
            print("  OK — Policy secret_detected inchangée sur backend mempalace")

            # 6. forget (soft) puis vérif tombstone.
            forgot = api.forget(rec.id, "smoke-m3")
            assert forgot.ok and not forgot.hard
            gone = api.recall(rec.id, "smoke-m3")
            assert gone is None
            print("  OK — soft forget masque le record")

            # 7. health.
            h = api.inspect("smoke-m3")
            assert h["backend"] == "mempalace", h
            print(f"  OK — inspect backend=mempalace, counts={h['counts']}")

        finally:
            backend.close()  # libère les verrous ChromaDB avant le cleanup du tmp Windows

    print("=== smoke memory mempalace M3 (spike) ===")
    print("=== ALL OK ===")


if __name__ == "__main__":
    run()
