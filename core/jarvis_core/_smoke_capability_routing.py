"""Smoke — capability_routing.py (Phase 1 inventaire + Phase 2 resolver).

Niveau unitaire, sans `Orchestrator` réel : des objets minimalistes tiennent
lieu de `devices` / `hass`. Voir `_smoke_chat_capability_routing.py`
pour l'intégration bout en bout dans `ChatHandlerMixin`.

    python -m jarvis_core._smoke_capability_routing
"""
from __future__ import annotations

import asyncio
import json
import sys
from unittest.mock import patch

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


class _FakeHass:
    def __init__(self, configured: bool) -> None:
        self.configured = configured


class _FakeOrch:
    """Tient lieu d'Orchestrator pour les fonctions Phase 1 — attributs lus
    en lecture seule (`getattr(orch, ..., None)`), jamais de réseau."""

    def __init__(self, *, devices=None, hass_configured=False) -> None:
        from jarvis_core.devices import DeviceRegistry

        self.devices = devices if devices is not None else DeviceRegistry()
        self.hass = _FakeHass(hass_configured)


def _register_windows_agent(devices, *, with_metrics: bool = True) -> None:
    devices.register("pc-test", type="pc_client", runtime_kind="windows_agent")
    if with_metrics:
        devices.update_capabilities(
            "pc-test",
            [
                {
                    "name": "metrics",
                    "capability_id": "system.metrics",
                    "value": True,
                    "metadata": {"ok": True, "cpu_percent": 42},
                }
            ],
        )


def test_candidates_exclude_when_nothing_online() -> None:
    from jarvis_core.capability_routing import SEMANTIC_ROUTABLE_INTENTS, build_candidates

    orch = _FakeOrch(hass_configured=False)
    candidates = build_candidates(orch, role="user")
    intents = {c.intent for c in candidates}

    # Toujours disponibles : Core in-process, aucun état runtime externe requis.
    for always_on in (
        "system.capabilities",
        "system.introspect",
        "architecture.explain",
        "devices.list",
        "devices.topology",
        "core.mission_dev",
        "core.neural_map",
    ):
        assert always_on in intents, (always_on, intents)

    # Exclus : aucun agent Windows online, HA non configuré, Hermes non configuré.
    for excluded in ("devices.metrics", "devices.software", "home.control", "web.search"):
        assert excluded not in intents, (excluded, intents)

    assert intents <= set(SEMANTIC_ROUTABLE_INTENTS)
    print("  OK — devices/HA/Hermes hors-ligne → candidats exclus, jamais inventés")


def test_candidates_include_when_available() -> None:
    from jarvis_core.devices import DeviceRegistry
    from jarvis_core.capability_routing import build_candidates

    devices = DeviceRegistry()
    _register_windows_agent(devices, with_metrics=True)
    orch = _FakeOrch(devices=devices, hass_configured=True)

    candidates = build_candidates(orch, role="user")
    intents = {c.intent for c in candidates}
    for present in ("devices.metrics", "devices.software", "home.control"):
        assert present in intents, (present, intents)
    assert "web.search" not in intents
    print("  OK — agent Windows online + HA configuré → candidats Core présents")


def test_metrics_requires_real_capability_not_just_online_device() -> None:
    """Un agent Windows online SANS `system.metrics` ne rend pas `devices.metrics`
    disponible — « online » et « possède la capacité » sont deux faits distincts."""
    from jarvis_core.devices import DeviceRegistry
    from jarvis_core.capability_routing import build_candidates

    devices = DeviceRegistry()
    _register_windows_agent(devices, with_metrics=False)
    orch = _FakeOrch(devices=devices)

    intents = {c.intent for c in build_candidates(orch, role="user")}
    assert "devices.metrics" not in intents
    assert "devices.software" in intents  # ne dépend que de l'online, pas de la capacité
    print("  OK — device online sans system.metrics ≠ devices.metrics disponible")


def test_removed_web_capability_never_proposed() -> None:
    """La capacité web supprimée n'est proposée à aucun rôle."""
    from jarvis_core.capability_routing import build_candidates

    orch = _FakeOrch(hass_configured=True)
    guest_intents = {c.intent for c in build_candidates(orch, role="guest")}
    admin_intents = {c.intent for c in build_candidates(orch, role="admin")}
    assert "web.search" not in guest_intents
    assert "web.search" not in admin_intents
    print("  OK — web.search supprimé → jamais candidat")


def test_parse_routing_decision_rejects_invented_capability() -> None:
    from jarvis_core.capability_routing import RoutingCandidate, parse_routing_decision

    candidates = [RoutingCandidate(intent="web.search", app_id="reach", note="", operation="read", risk="INFO")]
    raw = json.dumps({"action": "use_capability", "capability": "shell.exec", "confidence": 0.95, "reason": "x"})
    decision = parse_routing_decision(raw, candidates)
    assert decision.action == "chat"
    assert decision.capability is None
    assert "hors liste" in decision.reason
    print("  OK — capacité hors liste (halluciné) → jamais exécutée, replie sur chat")


def test_parse_routing_decision_valid_pick() -> None:
    from jarvis_core.capability_routing import RoutingCandidate, parse_routing_decision

    candidates = [RoutingCandidate(intent="devices.metrics", app_id="connexions", note="", operation="read", risk="INFO")]
    raw = "```json\n" + json.dumps(
        {"action": "use_capability", "capability": "devices.metrics", "confidence": 0.9, "reason": "diagnostic pc"}
    ) + "\n```"
    decision = parse_routing_decision(raw, candidates)
    assert decision.action == "use_capability"
    assert decision.capability == "devices.metrics"
    assert decision.confidence == 0.9
    print("  OK — JSON valide (fenced) → décision structurée correctement extraite")


def test_parse_routing_decision_malformed_falls_back() -> None:
    from jarvis_core.capability_routing import RoutingRejected, parse_routing_decision

    try:
        parse_routing_decision("ceci n'est pas du JSON", [])
        raise AssertionError("devait lever RoutingRejected")
    except RoutingRejected:
        pass
    print("  OK — réponse illisible → RoutingRejected, jamais un crash silencieux ailleurs")


def test_resolve_semantic_route_confidence_floor() -> None:
    from jarvis_core.capability_routing import resolve_semantic_route
    from jarvis_core.devices import DeviceRegistry

    devices = DeviceRegistry()
    _register_windows_agent(devices, with_metrics=True)
    orch = _FakeOrch(devices=devices)

    async def fake_complete(prompt: str) -> str:
        return json.dumps(
            {"action": "use_capability", "capability": "devices.metrics", "confidence": 0.3, "reason": "pas sûr"}
        )

    decision = asyncio.run(
        resolve_semantic_route("un truc vague", orch=orch, role="user", complete_fn=fake_complete)
    )
    assert decision.action == "chat"
    assert "plancher" in decision.reason
    print("  OK — confiance sous le plancher (0.6) → replie sur chat, n'exécute pas")


def test_resolve_semantic_route_picks_available_capability() -> None:
    from jarvis_core.capability_routing import resolve_semantic_route
    from jarvis_core.devices import DeviceRegistry

    devices = DeviceRegistry()
    _register_windows_agent(devices, with_metrics=True)
    orch = _FakeOrch(devices=devices)

    async def fake_complete(prompt: str) -> str:
        assert "devices.metrics" in prompt  # le candidat a bien atteint le prompt
        return json.dumps(
            {"action": "use_capability", "capability": "devices.metrics", "confidence": 0.92, "reason": "diag pc"}
        )

    decision = asyncio.run(
        resolve_semantic_route("pourquoi mon portable rame", orch=orch, role="user", complete_fn=fake_complete)
    )
    assert decision.action == "use_capability"
    assert decision.capability == "devices.metrics"
    print("  OK — paraphrase (via resolver injecté) → bonne capability sélectionnée")


def test_resolve_semantic_route_offline_capability_never_selected() -> None:
    """Même si le resolver (mal informé / adversarial) réclame une capacité
    hors-ligne, elle n'est jamais dans la liste des candidats → rejet structurel,
    pas une question de discipline du prompt seul."""
    from jarvis_core.capability_routing import resolve_semantic_route

    orch = _FakeOrch()  # aucun device Windows online

    async def fake_complete(prompt: str) -> str:
        assert "devices.metrics" not in prompt  # jamais proposé au resolver
        return json.dumps(
            {"action": "use_capability", "capability": "devices.metrics", "confidence": 0.99, "reason": "insiste"}
        )

    decision = asyncio.run(
        resolve_semantic_route("pourquoi mon portable rame", orch=orch, role="user", complete_fn=fake_complete)
    )
    assert decision.action == "chat"
    assert "hors liste" in decision.reason
    print("  OK — capacité hors-ligne jamais candidate → sélection adversariale rejetée")


def test_resolve_semantic_route_no_candidates_skips_llm_call() -> None:
    """Aucun candidat → pas d'appel LLM du tout (coût zéro), pas seulement un
    résultat « chat » après un aller-retour inutile."""
    from jarvis_core import capability_routing as mod

    orch = _FakeOrch()

    async def must_not_be_called(prompt: str) -> str:
        raise AssertionError("le resolver n'aurait jamais dû être appelé")

    with patch.object(mod, "build_candidates", return_value=[]):
        decision = asyncio.run(
            mod.resolve_semantic_route("bonjour", orch=orch, role="user", complete_fn=must_not_be_called)
        )
    assert decision.action == "chat"
    print("  OK — zéro candidat → zéro appel LLM (court-circuit coût)")


def test_resolve_semantic_route_llm_failure_fails_safe() -> None:
    from jarvis_core.capability_routing import resolve_semantic_route
    from jarvis_core.devices import DeviceRegistry

    devices = DeviceRegistry()
    _register_windows_agent(devices, with_metrics=True)
    orch = _FakeOrch(devices=devices)

    async def broken_complete(prompt: str) -> str:
        raise RuntimeError("OpenRouter indisponible")

    decision = asyncio.run(
        resolve_semantic_route("pourquoi mon portable rame", orch=orch, role="user", complete_fn=broken_complete)
    )
    assert decision.action == "chat"
    assert "indisponible" in decision.reason
    print("  OK — resolver LLM en panne → replie sur chat, ne bloque jamais la conversation")


def test_general_question_no_candidate_topically_relevant() -> None:
    """« Pourquoi le ciel est bleu ? » — le resolver simulé se comporte comme le
    prompt le lui demande (aucune capacité pertinente → chat)."""
    from jarvis_core.capability_routing import resolve_semantic_route
    from jarvis_core.devices import DeviceRegistry

    devices = DeviceRegistry()
    _register_windows_agent(devices, with_metrics=True)
    orch = _FakeOrch(devices=devices, hass_configured=True)

    async def fake_complete(prompt: str) -> str:
        return json.dumps({"action": "chat", "capability": None, "confidence": 0.98, "reason": "hors sujet"})

    decision = asyncio.run(
        resolve_semantic_route("Pourquoi le ciel est bleu ?", orch=orch, role="user", complete_fn=fake_complete)
    )
    assert decision.action == "chat"
    print("  OK — question générale → chat, aucune capacité forcée")


def test_incident_2026_08_15_neural_map_now_a_real_candidate() -> None:
    """Régression — incident live : « montre-moi ton fonctionnement »
    n'atteignait QUE `architecture.explain` (texte, jamais de surface HUD)
    parce que `core.neural_map` (la carte 3D) n'était pas dans la liste des
    candidats. Le resolver ne pouvait donc pas choisir la bonne capacité —
    ce n'était pas un mauvais jugement du LLM, c'était une liste incomplète."""
    from jarvis_core.capability_routing import build_candidates

    orch = _FakeOrch()  # aucun état runtime particulier requis : Owner.CORE, toujours dispo
    intents = {c.intent for c in build_candidates(orch, role="user")}
    assert "core.neural_map" in intents, intents
    assert "architecture.explain" in intents, intents
    print("  OK — incident 2026-08-15 : core.neural_map ET architecture.explain sont candidats")


def main() -> int:
    print("=== smoke capability_routing (Phase 1 + Phase 2) ===")
    test_candidates_exclude_when_nothing_online()
    test_candidates_include_when_available()
    test_incident_2026_08_15_neural_map_now_a_real_candidate()
    test_metrics_requires_real_capability_not_just_online_device()
    test_removed_web_capability_never_proposed()
    test_parse_routing_decision_rejects_invented_capability()
    test_parse_routing_decision_valid_pick()
    test_parse_routing_decision_malformed_falls_back()
    test_resolve_semantic_route_confidence_floor()
    test_resolve_semantic_route_picks_available_capability()
    test_resolve_semantic_route_offline_capability_never_selected()
    test_resolve_semantic_route_no_candidates_skips_llm_call()
    test_resolve_semantic_route_llm_failure_fails_safe()
    test_general_question_no_candidate_topically_relevant()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
