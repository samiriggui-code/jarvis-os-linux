"""Smoke — feedback conversationnel intermédiaire pendant une délégation
Hermes longue (chantier Orchestration conversationnelle, finition V1, §6/§7).

`DEFAULT_TIMEOUT` (120 s, `hermes/bridge.py`) n'est pas touché. Ce qui est
neuf : un unique signal audible « je continue de travailler là-dessus… » si
rien de terminal n'est arrivé après `resolve_hermes_interim_delay()` — jamais
un second, jamais une annulation du run, jamais un faux résultat.

Délai toujours injecté via `JARVIS_HERMES_INTERIM_FEEDBACK_S` — aucun test
n'attend réellement 18 s. `orch.speak` est un `AsyncMock` partout : zéro
consommation ElevenLabs.

    python -m jarvis_core._smoke_hermes_interim_feedback
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


def _make_orchestrator():
    from jarvis_core import Orchestrator

    orch = Orchestrator()
    orch.speak = AsyncMock(return_value={"type": "tts_skipped"})  # type: ignore[method-assign]
    return orch


def _with_interim_delay(seconds: str):
    prev = os.environ.get("JARVIS_HERMES_INTERIM_FEEDBACK_S")
    os.environ["JARVIS_HERMES_INTERIM_FEEDBACK_S"] = seconds

    def _restore() -> None:
        if prev is None:
            os.environ.pop("JARVIS_HERMES_INTERIM_FEEDBACK_S", None)
        else:
            os.environ["JARVIS_HERMES_INTERIM_FEEDBACK_S"] = prev

    return _restore


def test_h_fast_response_no_interim_feedback() -> None:
    """Hermes répond avant le délai → aucun feedback intermédiaire."""
    restore = _with_interim_delay("5")
    try:
        orch = _make_orchestrator()

        async def fast(intent: str, payload: dict[str, Any]) -> dict[str, Any]:
            return {"ok": True, "text": "résultat immédiat"}

        orch.intents.execute = fast  # type: ignore[method-assign]
        ws = _Ws()
        asyncio.run(
            orch._execute_intent(ws, "agent.tools", {"prompt": "x", "app": "outils", "intent": "agent.tools"})
        )
        interim = [m for m in ws.messages if m.get("interim")]
        assert not interim, ws.messages
        results = [m for m in ws.messages if m.get("type") == "surface_result"]
        assert results and results[0].get("ok") is True
        print("  OK [H] — réponse rapide → zéro feedback intermédiaire")
    finally:
        restore()


def test_i_slow_success_exactly_one_interim_feedback() -> None:
    """Hermes long mais finit par réussir → exactement UN feedback
    intermédiaire, jamais un second, puis le résultat réel normal."""
    restore = _with_interim_delay("0.05")
    try:
        orch = _make_orchestrator()

        async def slow_success(intent: str, payload: dict[str, Any]) -> dict[str, Any]:
            await asyncio.sleep(0.25)
            return {"ok": True, "text": "résultat après attente"}

        orch.intents.execute = slow_success  # type: ignore[method-assign]
        ws = _Ws()
        asyncio.run(
            orch._execute_intent(ws, "agent.tools", {"prompt": "x", "app": "outils", "intent": "agent.tools"})
        )

        interim = [m for m in ws.messages if m.get("interim")]
        assert len(interim) == 1, ws.messages  # jamais un second signal (pas de spam)
        assert interim[0].get("intent") == "agent.tools"

        results = [m for m in ws.messages if m.get("type") == "surface_result"]
        assert results and results[0].get("ok") is True, ws.messages  # jamais un faux résultat

        # Le feedback intermédiaire n'a jamais été traité comme le résultat final :
        # un chat_reply Hermes distinct (speaker_entity=hermes) suit toujours.
        final_replies = [
            m for m in ws.messages if m.get("type") == "chat_reply" and not m.get("interim")
        ]
        assert final_replies and final_replies[0].get("speaker_entity") == "hermes", ws.messages

        orb_states = [m.get("state") for m in ws.messages if m.get("command") == "set_orb_state"]
        assert "thinking" in orb_states  # remis en attente après le point d'étape, pas "idle"
        print("  OK [I] — run long réussi → un seul feedback intermédiaire, jamais un faux résultat")
    finally:
        restore()


def test_j_timeout_interim_then_final_fallback_chat_and_tts() -> None:
    """Hermes long puis échoue (timeout simulé) → feedback intermédiaire,
    PUIS le repli final (correctif K) : chat_reply, TTS, orbe cohérente,
    provenance de l'échec conservée."""
    restore = _with_interim_delay("0.05")
    try:
        orch = _make_orchestrator()

        async def slow_timeout(intent: str, payload: dict[str, Any]) -> dict[str, Any]:
            await asyncio.sleep(0.2)
            raise RuntimeError("délai SSE dépassé pour run test-j")

        orch.intents.execute = slow_timeout  # type: ignore[method-assign]
        ws = _Ws()
        asyncio.run(
            orch._execute_intent(ws, "agent.tools", {"prompt": "x", "app": "outils", "intent": "agent.tools"})
        )

        interim = [m for m in ws.messages if m.get("interim")]
        assert len(interim) == 1, ws.messages

        surface = [m for m in ws.messages if m.get("type") == "surface_result"]
        assert surface and surface[0].get("ok") is False, ws.messages  # jamais un faux succès
        assert "délai SSE dépassé pour run test-j" in surface[0].get("reason", "")  # provenance conservée

        final_replies = [m for m in ws.messages if m.get("type") == "chat_reply" and not m.get("interim")]
        assert final_replies, ws.messages
        assert "délai" in final_replies[0].get("text", "").lower()

        orch.speak.assert_called()  # TTS appelé (au moins une fois pour l'intermédiaire + une fois pour le repli)
        assert orch.speak.await_count >= 2, orch.speak.await_count

        orb_states = [m.get("state") for m in ws.messages if m.get("command") == "set_orb_state"]
        assert orb_states[-1] == "idle", orb_states  # état final cohérent, pas bloqué sur "thinking"
        print("  OK [J] — timeout : feedback intermédiaire puis repli final (chat_reply + TTS + orbe idle)")
    finally:
        restore()


def main() -> int:
    print("=== smoke Hermes interim feedback (finition V1, §6/§7) ===")
    test_h_fast_response_no_interim_feedback()
    test_i_slow_success_exactly_one_interim_feedback()
    test_j_timeout_interim_then_final_fallback_chat_and_tts()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
