"""Smoke D2.2 — explain_live borné au contrat D2.1 via Provider (injecté).

Aucun appel réseau par défaut. Pas de Hermes, HUD, voix, HA, Memory write.

    python -m jarvis_core._smoke_architecture_llm_live
"""
from __future__ import annotations

import asyncio
import copy
import json
import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _fixture_snap(**overrides):
    snap = {
        "schema_version": "1.0.0",
        "snapshot_id": "snap-d22-fixed",
        "timestamp": "2026-08-13T08:00:00+00:00",
        "as_of": "2026-08-13T08:00:00+00:00",
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
                    {"source": "doc:JARVIS_CONTEXT", "value": "nuc", "provenance": "DOC"},
                    {"source": "doc:ecosystem-hosts", "value": "vps", "provenance": "DOC"},
                ],
                "evidence": [],
                "stale": False,
            }
        ],
        "devices": [
            {
                "id": "pc-unknown",
                "status": "UNKNOWN",
                "provenance": "UNKNOWN",
                "evidence": [],
                "stale": False,
            }
        ],
        "agents": [],
        "services": [
            {
                "id": "service:evil",
                "name": "evil",
                "status": "CONFIGURED",
                "provenance": "CODE",
                "evidence": [{"detail": "token=sk-abcdefghijklmnopqrstuvwxyz012345"}],
                "stale": False,
            }
        ],
        "tools": [],
        "llms": [
            {
                "id": "llm:openrouter",
                "provider": "openrouter",
                "status": "UNKNOWN",
                "provenance": "DOC",
                "evidence": [],
                "stale": False,
            }
        ],
        "providers": [],
        "capabilities": [
            {
                "id": "media.netflix.freebox",
                "status": "UNKNOWN",
                "provenance": "DOC",
                "evidence": [],
                "stale": False,
            }
        ],
        "connections": [],
        "depends_on": [],
        "health": {},
        "limitations": ["fixture_d22"],
        "evidence": [],
    }
    snap.update(overrides)
    return snap


def _run(coro):
    return asyncio.run(coro)


def test_skip_llm_keeps_template() -> None:
    from jarvis_core.architecture import explain_live

    async def boom(_prompt: str) -> str:
        raise AssertionError("complete must not be called when skip_llm=True")

    out = _run(
        explain_live(
            _fixture_snap(),
            "Où tourne Hermes ?",
            complete=boom,
            skip_llm=True,
        )
    )
    assert out["meta"]["llm_skipped"] is True
    assert out["meta"]["llm_used"] is False
    assert out["meta"]["contract"] == "D2.2"
    assert "conflit" in out["explanation"].lower()
    assert "d2_2_llm_not_called" in out["limitations"]
    print("  OK — skip_llm → template, complete non appelé")


def test_prompt_is_bound_payload_only() -> None:
    from jarvis_core.architecture import prompt_from_bound_payload, explain

    snap = _fixture_snap()
    draft = explain(snap, "Où tourne Hermes ?", hermes_history=[{"role": "user", "text": "secret-history"}])
    bound = draft["llm_bound_payload"]
    prompt = prompt_from_bound_payload(bound)

    assert bound["snapshot_id"] == "snap-d22-fixed"
    assert "snap-d22-fixed" in prompt
    assert bound["instruction"] in prompt or "aucune connaissance d'architecture" in prompt.lower()
    assert "secret-history" not in prompt
    assert '"hermes_history"' not in prompt
    assert "hermes_history_ignored" in prompt
    assert "sk-abcdefghijklmnopqrstuvwxyz012345" not in prompt
    assert "agent:ghost" not in prompt.lower()
    assert '"anchor"' in prompt
    assert bound["anchor"]["meta"]["contract"] == "D2.1"
    print("  OK — prompt = payload borné, pas d'historique / secret / ghost")


def test_faithful_llm_accepted() -> None:
    from jarvis_core.architecture import explain_live

    seen: list[str] = []

    async def good(prompt: str) -> str:
        seen.append(prompt)
        return (
            "(snapshot_id=snap-d22-fixed, timestamp=2026-08-13T08:00:00+00:00) "
            "Il existe un conflit documentaire sur Hermes (NUC vs VPS), resolved_by=null. "
            "Je ne choisis pas d'hôte."
        )

    out = _run(explain_live(_fixture_snap(), "Où tourne Hermes ?", complete=good))
    assert seen, "complete must be called"
    assert "snap-d22-fixed" in seen[0]
    assert out["meta"]["llm_used"] is True
    assert out["meta"]["llm_rejected"] is False
    assert "conflit" in out["explanation"].lower()
    assert "d2_2_llm_accepted" in out["limitations"]
    print("  OK — LLM fidèle accepté (provider injecté, pas de réseau)")


def test_hallucination_rejected_fallback() -> None:
    from jarvis_core.architecture import explain_live

    async def bad(_prompt: str) -> str:
        return (
            "Hermes tourne uniquement sur le NUC. "
            "Ghost Agent est connecté et AVAILABLE."
        )

    out = _run(explain_live(_fixture_snap(), "Où tourne Hermes ?", complete=bad))
    assert out["meta"]["llm_rejected"] is True
    assert out["meta"]["llm_used"] is False
    assert out["meta"]["llm_violations"]
    assert "vps" in out["explanation"].lower()
    assert "ghost agent est connecté" not in out["explanation"].lower()
    assert "d2_2_llm_output_rejected_anti_hallucination" in out["limitations"]
    print("  OK — hallucination rejetée → fallback template")


def test_unknown_not_promoted() -> None:
    from jarvis_core.architecture import explain_live

    async def promo(_prompt: str) -> str:
        return "llm:openrouter est AVAILABLE et pc-unknown est disponible."

    out = _run(explain_live(_fixture_snap(), "Quels LLM sont disponibles ?", complete=promo))
    assert out["meta"]["llm_rejected"] is True
    text = out["explanation"].lower()
    assert "je ne le déclare pas" in text or "≠ available" in text or "unknown" in text
    print("  OK — promotion UNKNOWN→AVAILABLE rejetée")


def test_llm_error_fallback() -> None:
    from jarvis_core.architecture import explain_live

    async def boom(_prompt: str) -> str:
        raise RuntimeError("provider down")

    out = _run(explain_live(_fixture_snap(), "Où tourne Hermes ?", complete=boom))
    assert out["meta"]["llm_error"] is True
    assert out["meta"]["llm_used"] is False
    assert "conflit" in out["explanation"].lower()
    assert "d2_2_llm_error_fallback_template" in out["limitations"]
    print("  OK — erreur provider → fallback template")


def test_no_mutation_no_ha_no_hermes() -> None:
    from jarvis_core.architecture import explain_live
    import jarvis_core.architecture.llm_live as live

    src = open(live.__file__, encoding="utf-8").read()
    for banned in (
        "homeassistant",
        "salon_player",
        "hermes.bridge",
        "voicebox",
        "elevenlabs",
    ):
        assert banned not in src, banned

    snap = _fixture_snap()
    before = copy.deepcopy(snap)

    async def echo(prompt: str) -> str:
        return (
            f"(snapshot_id=snap-d22-fixed) conflit documentaire Hermes NUC vs VPS, "
            f"resolved_by=null. prompt_len={len(prompt)}"
        )

    out = _run(explain_live(snap, "Où tourne Hermes ?", complete=echo))
    assert snap == before
    assert out["meta"]["memory_writes"] is False
    assert out["meta"]["verification_writes"] is False
    assert out["meta"]["hermes_tools"] is False
    assert out["meta"]["network_probes"] is False
    blob = json.dumps(out)
    assert "sk-abcdefghijklmnopqrstuvwxyz012345" not in blob
    print("  OK — pas mutation / HA / Hermes / voix / secret")


def test_system_mode_skips_without_injected_complete() -> None:
    import os

    from jarvis_core.architecture import explain_live

    prev = os.environ.get("JARVIS_FORCE_SYSTEM")
    os.environ["JARVIS_FORCE_SYSTEM"] = "1"
    # Purge un manager déjà instancié n'existe pas — AIProviderManager lit l'env à l'init.
    try:
        out = _run(explain_live(_fixture_snap(), "Comment tu fonctionnes ?"))
        assert out["meta"]["llm_skipped"] is True
        assert out["meta"]["llm_used"] is False
        assert out["meta"].get("provider_mode") == "system"
        assert "USER → interface → CORE" in out["explanation"] or "parcours" in out["explanation"].lower()
        print("  OK — mode SYSTEM → pas d'appel LLM, template")
    finally:
        if prev is None:
            os.environ.pop("JARVIS_FORCE_SYSTEM", None)
        else:
            os.environ["JARVIS_FORCE_SYSTEM"] = prev


def test_anchor_d21_in_bound() -> None:
    from jarvis_core.architecture import explain

    out = explain(_fixture_snap(), "Où tourne Hermes ?")
    bound = out["llm_bound_payload"]
    assert bound.get("anchor")
    assert bound["anchor"]["snapshot_id"] == "snap-d22-fixed"
    assert bound["anchor"]["meta"]["contract"] == "D2.1"
    assert bound["anchor"]["meta"]["llm_called"] is False
    print("  OK — ancre D2.1 toujours dans le bound payload explain")


def main() -> int:
    print("=== smoke architecture.explain_live D2.2 ===")
    test_skip_llm_keeps_template()
    test_prompt_is_bound_payload_only()
    test_faithful_llm_accepted()
    test_hallucination_rejected_fallback()
    test_unknown_not_promoted()
    test_llm_error_fallback()
    test_no_mutation_no_ha_no_hermes()
    test_system_mode_skips_without_injected_complete()
    test_anchor_d21_in_bound()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
