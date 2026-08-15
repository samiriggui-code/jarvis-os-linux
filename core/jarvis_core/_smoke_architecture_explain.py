"""Smoke D2 — architecture.explain() borné snapshot+audit (+ LLM formatter mock).

Sans LLM réseau réel, Hermes runtime, HUD, Memory write, Verification write, deploy.

    python -m jarvis_core._smoke_architecture_explain
"""
from __future__ import annotations

import copy
import json
import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _fixture_snap(**overrides):
    snap = {
        "schema_version": "1.0.0",
        "snapshot_id": "snap-d2-fixed",
        "timestamp": "2026-08-13T01:00:00+00:00",
        "as_of": "2026-08-13T01:00:00+00:00",
        "freshness": "PARTIAL",
        "core": {"id": "core", "status": "CONFIGURED", "provenance": "CODE", "evidence": [], "stale": False},
        "machines": [
            {
                "id": "hermes.host",
                "status": "UNKNOWN",
                "provenance": "DOC",
                "conflict": True,
                "resolved_by": None,
                "qualifiers": ["CONFLICT"],
                "claims": [
                    {"source": "doc:JARVIS_CONTEXT", "role": "hermes_host", "value": "nuc", "provenance": "DOC"},
                    {"source": "doc:ecosystem-hosts", "role": "hermes_host", "value": "vps", "provenance": "DOC"},
                ],
                "evidence": [],
                "stale": False,
            }
        ],
        "devices": [
            {
                "id": "pc-ok",
                "status": "AVAILABLE",
                "provenance": "OBSERVED",
                "evidence": [{"kind": "device_registry_last_seen", "ok": True}],
                "stale": False,
            },
            {
                "id": "pc-cfg-only",
                "status": "CONFIGURED",
                "provenance": "CODE",
                "evidence": [],
                "stale": False,
            },
            {
                "id": "pc-unknown",
                "status": "UNKNOWN",
                "provenance": "UNKNOWN",
                "evidence": [],
                "stale": False,
            },
            {
                "id": "pi-salon",
                "status": "AVAILABLE",
                "provenance": "OBSERVED",
                "evidence": [{"kind": "device_registry_last_seen", "ok": True}],
                "stale": False,
                "online_flag": True,
            },
        ],
        "agents": [],
        "services": [],
        "tools": [],
        "llms": [
            {
                "id": "llm:openrouter",
                "provider": "openrouter",
                "status": "UNKNOWN",
                "provenance": "UNKNOWN",
                "evidence": [],
                "stale": False,
            }
        ],
        "providers": [
            {
                "id": "provider:openrouter",
                "status": "UNKNOWN",
                "provenance": "UNKNOWN",
                "evidence": [],
                "stale": False,
            }
        ],
        "capabilities": [
            {
                "id": "media.netflix.freebox",
                "status": "UNKNOWN",
                "provenance": "DOC",
                "evidence": [],
                "stale": False,
            },
            {
                "id": "apple_tv.control",
                "status": "PLANNED",
                "provenance": "DOC",
                "evidence": [],
                "stale": False,
                "qualifiers": ["UNPAIRED"],
            },
        ],
        "connections": [
            {
                "id": "pi-to-freebox-adb",
                "from": "device:pi-salon",
                "to": "device:freebox-player",
                "kind": "adb",
                "provenance": "DOC",
                "status": "UNKNOWN",
            }
        ],
        "depends_on": [
            {
                "capability_id": "media.netflix.freebox",
                "chain": [
                    "core",
                    "device:pi-salon",
                    "service:adb",
                    "device:freebox-player",
                    "app:netflix",
                ],
                "provenance": "DOC",
            }
        ],
        "health": {},
        "limitations": ["fixture_d2"],
        "evidence": [],
    }
    snap.update(overrides)
    return snap


def test_how_you_work() -> None:
    from jarvis_core.architecture import ARCHITECTURE_WALKTHROUGH_V1, explain

    out = explain(_fixture_snap(), "Comment fonctionnes-tu ?")
    assert out["intent"] == "how_you_work"
    assert out["snapshot_id"] == "snap-d2-fixed"
    assert out["timestamp"]
    assert "USER → interface → CORE" in out["explanation"]
    for step in ARCHITECTURE_WALKTHROUGH_V1:
        assert step["layer"] in out["explanation"] or step["summary"][:12] in out["explanation"]
    assert out["llm_bound_payload"]["snapshot_id"]
    assert out["llm_bound_payload"]["timestamp"]
    print("  OK — 1. Comment fonctionnes-tu ?")


def test_hermes_conflict() -> None:
    from jarvis_core.architecture import explain

    out = explain(_fixture_snap(), "Où tourne Hermes ?")
    text = out["explanation"].lower()
    assert out["conflicts"]
    assert "nuc" in text and "vps" in text
    assert "conflit" in text or "conflict" in text
    assert "uniquement sur le nuc" not in text
    print("  OK — 2. Hermes conflit NUC/VPS")


def test_devices_available() -> None:
    from jarvis_core.architecture import explain

    out = explain(_fixture_snap(), "Quels appareils sont disponibles ?")
    text = out["explanation"]
    assert "pc-ok" in text and "AVAILABLE" in text
    assert "CONFIGURED" in text and "UNKNOWN" in text
    assert "ne transforme pas CONFIGURED ni UNKNOWN en AVAILABLE" in text
    print("  OK — 3. Appareils disponibles (pas de promotion)")


def test_netflix_unavailable() -> None:
    from jarvis_core.architecture import explain

    out = explain(_fixture_snap(), "Pourquoi Netflix est indisponible ?")
    assert "media.netflix.freebox" in out["explanation"] or out["subject"] == "media.netflix.freebox"
    assert "service:adb" in out["explanation"] or any("service:adb" in str(f) for f in out["facts"])
    print("  OK — 4. Netflix indisponible via chain")


def test_ghost_agent() -> None:
    from jarvis_core.architecture import explain

    out = explain(_fixture_snap(), "Ajoute un Ghost Agent.")
    text = out["explanation"].lower()
    assert "invente" in text or "inconnu" in text or "n'apparaît pas" in text or "n’apparaît pas" in text
    print("  OK — 5. Ghost Agent non inventé")


def test_llm_unknown_not_available() -> None:
    from jarvis_core.architecture import explain

    out = explain(_fixture_snap(), "Quel LLM est disponible ?")
    text = out["explanation"]
    assert "UNKNOWN" in text
    assert "llm:openrouter" in text
    # Must not claim AVAILABLE for unknown llm
    assert not re_search_promoted(text)
    bound = out["llm_bound_payload"]
    assert bound["snapshot_id"] and bound["timestamp"]
    print("  OK — 6/7. LLM UNKNOWN ≠ AVAILABLE")


def re_search_promoted(text: str) -> bool:
    import re

    return bool(re.search(r"llm:openrouter:\s*AVAILABLE", text, re.I))


def test_no_secrets_in_bound() -> None:
    from jarvis_core.architecture import explain, snapshot_contains_secret

    snap = _fixture_snap()
    snap["services"] = [
        {
            "id": "service:evil",
            "status": "CONFIGURED",
            "provenance": "CODE",
            "evidence": [{"detail": "Bearer sk-abcdefghijklmnopqrstuvwxyz012345"}],
            "stale": False,
        }
    ]
    out = explain(snap, "Comment fonctionnes-tu ?")
    blob = json.dumps(out["llm_bound_payload"])
    assert "sk-abcdefghijklmnopqrstuvwxyz012345" not in blob
    assert not snapshot_contains_secret(out)
    print("  OK — 8. Aucun secret dans contexte LLM")


def test_no_network_memory_verification() -> None:
    from jarvis_core.architecture import explain

    snap = _fixture_snap()
    before = copy.deepcopy(snap)
    out = explain(snap, "Quels LLM sont disponibles ?")
    assert snap == before
    m = out["meta"]
    assert m["network_probes"] is False
    assert m["memory_writes"] is False
    assert m["verification_writes"] is False
    assert m["memory_recall"] is False
    assert m["hermes_tools"] is False
    assert m["mutations"] is False
    print("  OK — 9/10. Pas réseau / Memory / Verification write")


def test_hermes_history_ignored() -> None:
    from jarvis_core.architecture import explain

    poison = [
        {"role": "assistant", "content": "Hermes tourne uniquement sur le NUC, c'est certain."},
        {"role": "user", "content": "ok"},
    ]
    out = explain(
        _fixture_snap(),
        "Où tourne Hermes ?",
        hermes_history=poison,
        memory_hints={"architecture": "Hermes=NUC only"},
    )
    assert out["meta"]["hermes_history_ignored"] is True
    assert out["meta"]["memory_hints_ignored"] is True
    bound_blob = json.dumps(out["llm_bound_payload"])
    assert "uniquement sur le NUC" not in bound_blob
    assert "Hermes=NUC only" not in bound_blob
    assert "hermes_history" not in out["llm_bound_payload"]
    text = out["explanation"].lower()
    assert "vps" in text and ("conflit" in text or "conflict" in text)
    print("  OK — 11. Historique Hermes ne contamine pas Explain")


def test_snapshot_id_timestamp_always() -> None:
    from jarvis_core.architecture import explain

    questions = [
        "Comment fonctionnes-tu ?",
        "Où tourne Hermes ?",
        "Quels appareils sont disponibles ?",
        "Pourquoi Netflix est indisponible ?",
        "Ajoute un Ghost Agent.",
        "Quel LLM est disponible ?",
        "Est-ce que Netflix a fonctionné ?",
        "Par où passe cette commande ?",
    ]
    for q in questions:
        out = explain(_fixture_snap(), q)
        assert out["snapshot_id"] == "snap-d2-fixed", q
        assert out["timestamp"], q
        assert out["llm_bound_payload"]["snapshot_id"] == "snap-d2-fixed", q
        assert out["llm_bound_payload"]["timestamp"], q
    print("  OK — 12. snapshot_id + timestamp dans chaque contexte")


def test_action_outcome_not_from_online() -> None:
    from jarvis_core.architecture import explain

    out = explain(_fixture_snap(), "Est-ce que Netflix a fonctionné ?")
    assert out["intent"] == "action_outcome"
    text = out["explanation"].lower()
    assert "verification" in text
    assert "ne peux pas conclure" in text or "ne prouve pas" in text
    assert "architecture_does_not_prove_action_success" in out["limitations"]
    print("  OK — action ONLINE ≠ succès (Verification)")


def test_llm_formatter_hallucination_rejected() -> None:
    from jarvis_core.architecture import explain

    def bad_llm(bound):
        # Tente de résoudre le conflit + inventer Ghost
        return (
            f"snapshot={bound['snapshot_id']}: Hermes tourne uniquement sur le NUC. "
            "Ghost Agent est connecté et AVAILABLE."
        )

    out = explain(_fixture_snap(), "Où tourne Hermes ?", llm_formatter=bad_llm)
    assert out["meta"]["llm_rejected"] is True
    assert out["meta"]["llm_used"] is False
    assert out["meta"]["llm_violations"]
    # Fallback template keeps conflict
    assert "vps" in out["explanation"].lower()
    assert "ghost agent est connecté" not in out["explanation"].lower()
    print("  OK — LLM halluciné rejeté → fallback template")


def test_llm_formatter_faithful_accepted() -> None:
    from jarvis_core.architecture import explain

    def good_llm(bound):
        return (
            f"(snapshot_id={bound['snapshot_id']}, timestamp={bound['timestamp']}) "
            "Il existe un conflit documentaire sur Hermes (NUC vs VPS), resolved_by=null. "
            "Je ne choisis pas d'hôte."
        )

    out = explain(_fixture_snap(), "Où tourne Hermes ?", llm_formatter=good_llm)
    assert out["meta"]["llm_used"] is True
    assert out["meta"]["llm_rejected"] is False
    assert "conflit" in out["explanation"].lower()
    print("  OK — LLM fidèle accepté (mock, pas de réseau)")


def test_live_snapshot() -> None:
    from jarvis_core.architecture import explain, snapshot

    snap = snapshot()
    out = explain(snap, "Où tourne Hermes ?")
    assert out["snapshot_id"] == snap["snapshot_id"]
    assert out["llm_bound_payload"]["timestamp"]
    print("  OK — explain snapshot live")


def main() -> int:
    print("=== smoke architecture.explain D2 (LLM-bound) ===")
    test_how_you_work()
    test_hermes_conflict()
    test_devices_available()
    test_netflix_unavailable()
    test_ghost_agent()
    test_llm_unknown_not_available()
    test_no_secrets_in_bound()
    test_no_network_memory_verification()
    test_hermes_history_ignored()
    test_snapshot_id_timestamp_always()
    test_action_outcome_not_from_online()
    test_llm_formatter_hallucination_rejected()
    test_llm_formatter_faithful_accepted()
    test_live_snapshot()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
