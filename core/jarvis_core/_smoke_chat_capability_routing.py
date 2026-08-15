"""Smoke — intégration capability-aware semantic routing dans ChatHandlerMixin
(chantier « Orchestration conversationnelle V1 »).

Bout en bout via un `Orchestrator()` réel : `handle_user_chat` → match_intent
→ (NOUVEAU) routage sémantique borné → `_open_intent` → Policy → executor →
résultat. Aucun appel OpenRouter payant : `orch.providers.complete` est
toujours simulé (`AsyncMock`) ou neutralisé (`JARVIS_FORCE_SYSTEM=1`).

    python -m jarvis_core._smoke_chat_capability_routing
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any
from unittest.mock import AsyncMock

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


class _Ws:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def send(self, raw: str) -> None:
        self.messages.append(json.loads(raw))


def _routing_json(capability: str, *, confidence: float = 0.9, reason: str = "test") -> str:
    return json.dumps(
        {"action": "use_capability", "capability": capability, "confidence": confidence, "reason": reason}
    )


_CHAT_JSON_ACTION = json.dumps({"action": "chat", "capability": None, "confidence": 0.95, "reason": "hors sujet"})


def _make_orchestrator(*, role: str | None = "user"):
    from jarvis_core import Orchestrator
    from jarvis_core.policy import Decision

    orch = Orchestrator()
    orch._session_role = lambda *a, **k: role  # type: ignore[method-assign]
    orch.speak = AsyncMock(return_value={"type": "tts_skipped"})  # type: ignore[method-assign]

    policy_calls: list[dict[str, Any]] = []
    real_evaluate = orch.policy.evaluate

    def spy_evaluate(**kwargs: Any) -> Decision:
        policy_calls.append(kwargs)
        return real_evaluate(**kwargs)

    orch.policy.evaluate = spy_evaluate  # type: ignore[method-assign]
    return orch, policy_calls


def _register_windows_agent(orch, *, with_metrics: bool = True) -> None:
    orch.devices.register("pc-test", type="pc_client", runtime_kind="windows_agent")
    if with_metrics:
        orch.devices.update_capabilities(
            "pc-test",
            [
                {
                    "name": "metrics",
                    "capability_id": "system.metrics",
                    "value": True,
                    "metadata": {"ok": True, "cpu_percent": 91, "ram_percent": 60, "disk_percent": 40, "process_count": 210},
                }
            ],
        )


def test_deterministic_intent_priority_no_semantic_llm_call() -> None:
    """Un trigger exact (« où tourne hermes » → architecture.explain) ne doit
    JAMAIS déclencher le resolver sémantique — priorité intent intacte."""
    prev = os.environ.get("JARVIS_FORCE_SYSTEM")
    os.environ["JARVIS_FORCE_SYSTEM"] = "1"  # sécurité : le LLM interne d'architecture.explain reste hors-réseau
    try:
        orch, policy_calls = _make_orchestrator(role="user")

        async def must_not_be_called(*args: Any, **kwargs: Any) -> str:
            raise AssertionError(
                "resolve_semantic_route n'aurait jamais dû appeler orch.providers.complete "
                "quand match_intent() a déjà résolu la phrase"
            )

        orch.providers.complete = must_not_be_called  # type: ignore[method-assign]

        ws = _Ws()
        asyncio.run(orch.handle_user_chat(ws, "où tourne hermes"))

        replies = [m for m in ws.messages if m.get("type") == "chat_reply"]
        assert replies and replies[0].get("intent") == "architecture.explain", ws.messages
        assert any(c.get("action") == "architecture.explain" for c in policy_calls), policy_calls
        print("  OK — trigger exact → aucun appel au resolver sémantique, pipeline déterministe inchangé")
    finally:
        if prev is None:
            os.environ.pop("JARVIS_FORCE_SYSTEM", None)
        else:
            os.environ["JARVIS_FORCE_SYSTEM"] = prev


def test_paraphrase_routes_to_available_capability() -> None:
    """« Mon ordinateur portable semble ralenti » ne matche aucun trigger
    déterministe (vérifié — « portable rame » est désormais un trigger exact
    depuis la stabilisation post-audit du 2026-08-15, cette paraphrase-ci ne
    l'est volontairement pas) — doit atteindre devices.metrics via le
    resolver sémantique, exécuter le VRAI executor, et passer par la VRAIE
    Policy."""
    orch, policy_calls = _make_orchestrator(role="user")
    _register_windows_agent(orch, with_metrics=True)

    async def fake_complete(prompt: str, *, call_mode=None, personality=None) -> str:
        from jarvis_core.personality import LLMCallMode

        assert call_mode == LLMCallMode.STRUCTURED
        assert "devices.metrics" in prompt
        return _routing_json("devices.metrics", confidence=0.93)

    orch.providers.complete = fake_complete  # type: ignore[method-assign]

    ws = _Ws()
    asyncio.run(orch.handle_user_chat(ws, "Mon ordinateur portable semble ralenti"))

    results = [m for m in ws.messages if m.get("type") == "surface_result"]
    assert results, ws.messages
    assert results[-1].get("intent") == "devices.metrics"
    assert results[-1].get("ok") is True
    assert any(c.get("action") == "devices.metrics" for c in policy_calls), policy_calls
    orch.speak.assert_called()
    print("  OK — paraphrase → devices.metrics réellement exécuté (Policy + executor réels)")


def test_offline_capability_never_selected_falls_back_to_chat() -> None:
    """Même paraphrase, mais AUCUN agent Windows online : devices.metrics ne
    peut pas être candidat, même si le resolver (simulé, adversarial) insiste
    — doit retomber en chat, jamais exécuter."""
    orch, _ = _make_orchestrator(role="user")  # pas d'agent Windows enregistré

    async def adversarial_complete(prompt: str, *, call_mode=None, personality=None) -> str:
        from jarvis_core.personality import LLMCallMode

        if call_mode == LLMCallMode.STRUCTURED:
            assert "devices.metrics" not in prompt
            return _routing_json("devices.metrics", confidence=0.99)
        return "Je ne sais pas dire pourquoi ton PC rame sans plus d'informations."

    orch.providers.complete = adversarial_complete  # type: ignore[method-assign]

    ws = _Ws()
    asyncio.run(orch.handle_user_chat(ws, "Mon ordinateur portable semble ralenti"))

    results = [m for m in ws.messages if m.get("type") == "surface_result" and m.get("intent") == "devices.metrics"]
    assert not results, ws.messages
    replies = [m for m in ws.messages if m.get("type") == "chat_reply"]
    assert replies, ws.messages
    print("  OK — capacité hors-ligne jamais candidate → resolver adversarial rejeté, chat en repli")


def test_invented_capability_never_executed() -> None:
    """Le resolver simulé nomme une capacité qui n'existe pas du tout dans le
    catalogue — jamais exécutée, jamais un crash, replie sur chat."""
    orch, _ = _make_orchestrator(role="admin")
    _register_windows_agent(orch, with_metrics=True)

    async def fake_complete(prompt: str, *, call_mode=None, personality=None) -> str:
        from jarvis_core.personality import LLMCallMode

        if call_mode == LLMCallMode.STRUCTURED:
            return _routing_json("shell.exec_arbitrary")
        return "Je n'ai pas de fonction dédiée pour ça."

    orch.providers.complete = fake_complete  # type: ignore[method-assign]

    ws = _Ws()
    asyncio.run(orch.handle_user_chat(ws, "fais un truc bizarre sur mon pc"))

    executed = [m for m in ws.messages if m.get("type") == "surface_result"]
    assert not executed, ws.messages
    replies = [m for m in ws.messages if m.get("type") == "chat_reply"]
    assert replies, ws.messages
    print("  OK — capacité inventée (hors catalogue) → jamais exécutée")


def test_general_question_goes_to_chat_with_context_note() -> None:
    """« Pourquoi le ciel est bleu ? » → aucune capability, chat direct, et le
    prompt du fallback porte la note « outils déjà évalués » (Phase 4)."""
    orch, _ = _make_orchestrator(role="user")
    _register_windows_agent(orch, with_metrics=True)

    seen_prompts: list[str] = []

    async def fake_complete(prompt: str, *, call_mode=None, personality=None) -> str:
        from jarvis_core.personality import LLMCallMode

        if call_mode == LLMCallMode.STRUCTURED:
            return _CHAT_JSON_ACTION
        seen_prompts.append(prompt)
        return "Diffusion de Rayleigh : le bleu diffuse plus que le rouge."

    orch.providers.complete = fake_complete  # type: ignore[method-assign]

    ws = _Ws()
    asyncio.run(orch.handle_user_chat(ws, "Pourquoi le ciel est bleu ?"))

    assert seen_prompts, "le chat libre n'a jamais été appelé"
    assert "déjà été évaluées" in seen_prompts[0]
    replies = [m for m in ws.messages if m.get("type") == "chat_reply"]
    assert replies and "Rayleigh" in replies[0].get("text", "")
    print("  OK — question générale → chat, avec contexte « outils déjà évalués » injecté")


def test_hermes_toolset_denied_by_role_falls_back_to_chat() -> None:
    """« Give me a news briefing » (aucun trigger FR web.search) — rôle guest
    n'a pas le toolset `web` délégable : web.search jamais candidat."""
    orch, _ = _make_orchestrator(role="guest")
    orch.hermes.key = "fake-hermes-key"  # configured=True, mais rôle guest sans toolset

    async def adversarial_complete(prompt: str, *, call_mode=None, personality=None) -> str:
        from jarvis_core.personality import LLMCallMode

        if call_mode == LLMCallMode.STRUCTURED:
            assert "web.search" not in prompt
            return _routing_json("web.search", confidence=0.99)
        return "Je n'ai pas accès à la recherche web pour ce profil."

    orch.providers.complete = adversarial_complete  # type: ignore[method-assign]

    ws = _Ws()
    asyncio.run(orch.handle_user_chat(ws, "Give me a news briefing"))

    executed = [m for m in ws.messages if m.get("type") == "surface_result" and m.get("intent") == "web.search"]
    assert not executed, ws.messages
    print("  OK — rôle sans toolset Hermes délégué → web.search jamais candidat, jamais exécuté")


def test_semantic_routing_never_bypasses_deterministic_research_filet() -> None:
    """« cherche les dernières nouvelles » matche déjà le filet recherche
    déterministe (mots-clés) — le resolver sémantique ne doit jamais être
    sollicité dans ce cas non plus (ordre de priorité intact)."""
    orch, _ = _make_orchestrator(role="admin")
    orch.hermes.key = "fake-hermes-key"

    async def must_not_be_called(*args: Any, **kwargs: Any) -> str:
        raise AssertionError("le filet recherche déterministe doit intercepter avant le resolver sémantique")

    orch.providers.complete = must_not_be_called  # type: ignore[method-assign]

    ws = _Ws()
    # `_open_intent` route ensuite vers Hermes (HermesIntentDelegate.execute),
    # qui échouera (pas de vrai Hermes local) — seul l'ORDRE nous intéresse ici,
    # pas le résultat de la délégation elle-même.
    try:
        asyncio.run(orch.handle_user_chat(ws, "cherche les dernières nouvelles du monde"))
    except AssertionError:
        raise
    except Exception:
        pass
    print("  OK — filet recherche déterministe prioritaire, resolver sémantique jamais atteint")


def main() -> int:
    print("=== smoke chat capability-aware semantic routing (intégration) ===")
    test_deterministic_intent_priority_no_semantic_llm_call()
    test_paraphrase_routes_to_available_capability()
    test_offline_capability_never_selected_falls_back_to_chat()
    test_invented_capability_never_executed()
    test_general_question_goes_to_chat_with_context_note()
    test_hermes_toolset_denied_by_role_falls_back_to_chat()
    test_semantic_routing_never_bypasses_deterministic_research_filet()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
