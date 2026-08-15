"""Smoke — garde écho micro générique (incident live 2026-08-15).

Le HUD n'a pas d'annulation d'écho acoustique matérielle : le micro peut
réentendre N'IMPORTE QUELLE parole de JARVIS (annonces de boot comprises) et
la re-transcrire comme une commande utilisateur — ce qui a interrompu une
séquence de boot en production. Ce smoke prouve que `is_echo_of_recent_speech`
généralise correctement le garde existant (qui ne couvrait que lock/veille)
sans liste de phrases codée en dur, et sans bloquer une vraie commande.

    python -m jarvis_core._smoke_echo_guard
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


def test_incident_boot_announcement_flagged_as_echo() -> None:
    """Reproduit exactement l'incident : deux annonces de boot parlées coup
    sur coup, puis le micro « réentend » leur concaténation légèrement
    déformée par la STT — doit être reconnue comme écho."""
    from jarvis_core.orchestrator_speech import OrchestratorSpeechMixin

    class _T(OrchestratorSpeechMixin):
        pass

    t = _T()
    t._remember_spoken("Noyau cognitif en ligne.")
    t._remember_spoken("Synthèse vocale opérationnelle.")
    assert t.is_echo_of_recent_speech("noyau cognitif en ligne synthèse vocale opératio")
    print("  OK — annonce de boot réentendue (déformée par la STT) → reconnue comme écho")


def test_normal_command_never_flagged() -> None:
    from jarvis_core.orchestrator_speech import OrchestratorSpeechMixin

    class _T(OrchestratorSpeechMixin):
        pass

    t = _T()
    t._remember_spoken("Noyau cognitif en ligne.")
    assert not t.is_echo_of_recent_speech("pourquoi mon portable rame")
    assert not t.is_echo_of_recent_speech("montre-moi ta map neural")
    print("  OK — commandes réelles sans rapport avec la parole récente → jamais bloquées")


def test_short_utterance_never_flagged() -> None:
    """Une phrase trop courte (2 mots) ne doit jamais être jugée écho — sinon
    n'importe quel mot commun ('oui', 'ok') deviendrait injustifiable à
    prononcer après que JARVIS a parlé."""
    from jarvis_core.orchestrator_speech import OrchestratorSpeechMixin

    class _T(OrchestratorSpeechMixin):
        pass

    t = _T()
    t._remember_spoken("Voici l'état de ton PC.")
    assert not t.is_echo_of_recent_speech("ok merci")
    print("  OK — énoncé court jamais bloqué (pas de faux positif sur un mot commun)")


def test_echo_expires_after_window() -> None:
    from jarvis_core.orchestrator_speech import OrchestratorSpeechMixin, RECENT_SPOKEN_WINDOW_S

    class _T(OrchestratorSpeechMixin):
        pass

    t = _T()
    # Simule une parole "ancienne" en manipulant directement le buffer —
    # jamais de vrai sleep dans un smoke.
    t._recent_spoken = [(0.0, "Noyau cognitif en ligne.")]
    import time

    # Le buffer n'est purgé que par `_remember_spoken` ; on vérifie que la
    # fenêtre elle-même est bornée dans le temps, pas indéfinie.
    assert time.monotonic() - 0.0 > RECENT_SPOKEN_WINDOW_S
    assert not t.is_echo_of_recent_speech("noyau cognitif en ligne")
    print("  OK — parole hors fenêtre (12 s) → plus considérée comme écho")


def test_lock_veille_hardcoded_guard_still_works() -> None:
    """Non-régression : l'ancien garde lock/veille (liste de phrases en dur)
    reste intact — le nouveau garde générique s'ajoute, ne remplace rien."""
    from jarvis_core import Orchestrator

    orch = Orchestrator()
    orch.providers.complete = AsyncMock(  # type: ignore[method-assign]
        side_effect=AssertionError("écho lock/veille aurait dû être filtré avant tout appel LLM")
    )
    ws = _Ws()
    asyncio.run(orch.handle_user_chat(ws, "Verrouillage automatique. Mise en veille des systèmes. À bientôt."))
    assert not ws.messages, ws.messages
    print("  OK — garde lock/veille (existant) toujours actif, non affecté par l'ajout")


def main() -> int:
    print("=== smoke garde écho micro générique (incident 2026-08-15) ===")
    test_incident_boot_announcement_flagged_as_echo()
    test_normal_command_never_flagged()
    test_short_utterance_never_flagged()
    test_echo_expires_after_window()
    test_lock_veille_hardcoded_guard_still_works()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
