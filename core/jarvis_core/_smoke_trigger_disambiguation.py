"""Smoke — finition V1 : P.3 (« analyse » trop générique) et P.5 (« maison »
trop générique) sans casser aucune commande déterministe fiable.

Deux niveaux :
  * `match_intent()` seul — la correction est dans `capabilities.py`
    (triggers retirés/ajoutés), pas dans une nouvelle table de routage.
  * Intégration `ChatHandlerMixin` — pour P.5, prouve qu'une question
    d'observation atteint la couche sémantique plutôt que d'ouvrir
    aveuglément `home.control`.

    python -m jarvis_core._smoke_trigger_disambiguation
"""
from __future__ import annotations

import asyncio
import json
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


def test_a_analyse_sante_portable_routes_to_devices_metrics() -> None:
    from jarvis_core.capabilities import match_intent

    cap = match_intent("Analyse la santé de mon portable")
    assert cap is not None and cap.intent == "devices.metrics", cap
    print("  OK [A] — « analyse la santé de mon portable » → devices.metrics (déterministe)")


def test_b_analyse_donnees_still_routes_to_data_analyze() -> None:
    from jarvis_core.capabilities import match_intent

    cap = match_intent("analyse ces données")
    assert cap is not None and cap.intent == "data.analyze", cap
    print("  OK [B] — « analyse ces données » → data.analyze (inchangé, via trigger « données »)")


def test_a2_stabilisation_widenings() -> None:
    """Élargissements sûrs ajoutés le 2026-08-15 (post-audit) : composés
    spécifiques, jamais un mot seul — réduisent la dépendance au resolver
    sémantique pour deux phrases très fréquentes, sans toucher au reste."""
    from jarvis_core.capabilities import match_intent

    cap = match_intent("Pourquoi mon portable rame ?")
    assert cap is not None and cap.intent == "devices.metrics", cap
    cap = match_intent("mon PC rame")
    assert cap is not None and cap.intent == "devices.metrics", cap
    cap = match_intent("Qu'est-ce que tu sais faire ?")
    assert cap is not None and cap.intent == "system.introspect", cap
    print("  OK [A2] — « portable/pc rame » et « sais faire » désormais déterministes")


def test_c_maison_observation_not_home_control() -> None:
    from jarvis_core.capabilities import match_intent

    for phrase in (
        "Regarde si tout va bien à la maison",
        "Quel est l'état de la maison ?",
        "Tout va bien à la maison ?",
    ):
        cap = match_intent(phrase)
        assert cap is None, f"{phrase!r} a matché {cap} — ne doit plus matcher home.control nu"
    print("  OK [C] — questions d'observation « maison » → aucun match déterministe direct")


def test_d_allume_still_home_control() -> None:
    from jarvis_core.capabilities import match_intent

    for phrase in ("allume le salon", "allume la lumière du salon", "éteint le salon"):
        cap = match_intent(phrase)
        assert cap is not None and cap.intent == "home.control", (phrase, cap)
    print("  OK [D] — « allume/éteint » (verbes d'action) → home.control inchangé")


def test_e_mets_interstellar_still_media_video() -> None:
    from jarvis_core.capabilities import match_intent

    cap = match_intent("mets Interstellar")
    assert cap is not None and cap.intent == "media.video", cap
    print("  OK [E] — « mets Interstellar » → media.video inchangé")


def test_f_mets_toi_en_veille_still_hud_idle() -> None:
    from jarvis_core.capabilities import match_intent

    cap = match_intent("mets-toi en veille")
    assert cap is not None and cap.intent == "hud.idle", cap
    print("  OK [F] — « mets-toi en veille » → hud.idle inchangé")


def _make_orchestrator(*, role: str | None = "user"):
    from jarvis_core import Orchestrator

    orch = Orchestrator()
    orch._session_role = lambda *a, **k: role  # type: ignore[method-assign]
    orch.speak = AsyncMock(return_value={"type": "tts_skipped"})  # type: ignore[method-assign]
    return orch


def test_g_semantic_resolver_never_called_for_certain_matches() -> None:
    """A/B/D/E/F sont des matches CERTAINS — le resolver sémantique (donc
    `orch.providers.complete`) ne doit jamais être sollicité pour eux."""

    async def must_not_be_called(*args: Any, **kwargs: Any) -> str:
        raise AssertionError("match certain : le resolver sémantique n'aurait jamais dû tourner")

    for phrase in (
        "Analyse la santé de mon portable",
        "analyse ces données",
        "allume le salon",
        "mets Interstellar",
        "mets-toi en veille",
    ):
        orch = _make_orchestrator(role="admin")
        orch.providers.complete = must_not_be_called  # type: ignore[method-assign]
        ws = _Ws()
        try:
            asyncio.run(orch.handle_user_chat(ws, phrase))
        except AssertionError:
            raise
        except Exception:
            pass  # exécution réelle peut échouer (pas de vrai Hermes/HA) — seul l'ORDRE nous intéresse
    print("  OK [G] — resolver sémantique jamais appelé pour un match certain (5 phrases)")


def test_c_integration_maison_reaches_semantic_layer_not_home_control() -> None:
    """« regarde si tout va bien à la maison » ne matche plus `match_intent()`
    (test A ci-dessus) donc atteint la Phase 2 — un resolver qui respecte la
    consigne du prompt (question d'observation ≠ action write) répond
    « chat » : home.control n'est JAMAIS exécuté."""
    orch = _make_orchestrator(role="user")
    orch.hass.token = "fake-hass-token"  # home.control réellement candidat (configured=True)

    async def well_behaved_complete(prompt: str, *, call_mode=None, personality=None) -> str:
        from jarvis_core.personality import LLMCallMode

        if call_mode == LLMCallMode.STRUCTURED:
            assert "home.control" in prompt  # bien proposé comme candidat...
            return json.dumps(
                {"action": "chat", "capability": None, "confidence": 0.9,
                 "reason": "question d'observation, pas une demande d'action"}
            )
        return "Je n'ai pas de diagnostic dédié pour la maison, mais tout semble configuré normalement."

    orch.providers.complete = well_behaved_complete  # type: ignore[method-assign]

    ws = _Ws()
    asyncio.run(orch.handle_user_chat(ws, "Regarde si tout va bien à la maison"))

    home_executed = [
        m for m in ws.messages if m.get("type") == "surface_result" and m.get("intent") == "home.control"
    ]
    assert not home_executed, ws.messages
    replies = [m for m in ws.messages if m.get("type") == "chat_reply"]
    assert replies, ws.messages
    print("  OK [C-intégration] — question maison → home.control proposé mais jamais exécuté, chat en repli")


def main() -> int:
    print("=== smoke trigger disambiguation (P.3 / P.5, finition V1) ===")
    test_a_analyse_sante_portable_routes_to_devices_metrics()
    test_a2_stabilisation_widenings()
    test_b_analyse_donnees_still_routes_to_data_analyze()
    test_c_maison_observation_not_home_control()
    test_d_allume_still_home_control()
    test_e_mets_interstellar_still_media_video()
    test_f_mets_toi_en_veille_still_hud_idle()
    test_g_semantic_resolver_never_called_for_certain_matches()
    test_c_integration_maison_reaches_semantic_layer_not_home_control()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
