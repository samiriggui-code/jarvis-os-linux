"""Smoke — UX défaillance Hermes générique (chantier « Orchestration
conversationnelle V1 », correctif K).

Avant : seul `web.search` recevait un `chat_reply` + TTS + orbe remis à
`idle` en cas d'échec Hermes (timeout SSE compris, 120 s par défaut,
`hermes/bridge.py::DEFAULT_TIMEOUT`) ; tout autre intent Hermes finissait
en trame WS muette, orbe resté sur `thinking` — le silence diagnostiqué
(« ~2 min de silence, aucun fallback utile »). Ce smoke prouve que le
correctif s'applique à un intent Hermes NON `web.search`, sans rien changer
au repli Google existant de `web.search` lui-même.

Aucun Hermes réel n'est nécessaire : l'échec de connexion (`HermesUnavailable`
faute de service local à `127.0.0.1:8642`) EST le cas de test.

    python -m jarvis_core._smoke_hermes_failure_ux
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


def test_non_web_search_hermes_failure_gets_chat_reply_and_tts() -> None:
    from jarvis_core import Orchestrator

    orch = Orchestrator()
    orch.speak = AsyncMock(return_value={"type": "tts_skipped"})  # type: ignore[method-assign]
    ws = _Ws()

    # "agent.tools" (tuile "outils") est Owner.HERMES, non web.search — c'est
    # exactement le chemin réel d'un « brief actualités » quand
    # JARVIS_CHAT_PROVIDER=hermes (diagnostic, symptôme L·7).
    asyncio.run(
        orch._execute_intent(
            ws, "agent.tools", {"prompt": "fais un point sur mes outils", "app": "outils", "intent": "agent.tools"}
        )
    )

    surface_results = [m for m in ws.messages if m.get("type") == "surface_result"]
    assert surface_results, ws.messages
    assert surface_results[0].get("ok") is False, surface_results[0]  # jamais un faux succès
    assert "reason" in surface_results[0]  # provenance de l'échec conservée

    chat_replies = [m for m in ws.messages if m.get("type") == "chat_reply"]
    assert chat_replies and chat_replies[0].get("intent") == "agent.tools", ws.messages

    orch.speak.assert_called()  # TTS avec speaker_entity valide (défaut jarvis)

    orb_commands = [m.get("state") for m in ws.messages if m.get("command") == "set_orb_state"]
    assert "speaking" in orb_commands, orb_commands  # jamais resté bloqué sur "thinking"
    print("  OK — échec Hermes non-web.search → chat_reply + TTS + orbe repris (jamais silence total)")


def test_web_search_keeps_its_own_google_fallback_unchanged() -> None:
    """Non-régression : `web.search` garde son repli Google dédié
    (`_fallback_web_surface`), inchangé par le correctif K."""
    from jarvis_core import Orchestrator

    orch = Orchestrator()
    orch.speak = AsyncMock(return_value={"type": "tts_skipped"})  # type: ignore[method-assign]
    broadcasted: list[dict[str, Any]] = []
    orch.broadcast = AsyncMock(side_effect=lambda payload: broadcasted.append(payload))  # type: ignore[method-assign]
    ws = _Ws()

    asyncio.run(
        orch._execute_intent(
            ws, "web.search", {"prompt": "actualités du monde", "app": "reach", "intent": "web.search"}
        )
    )

    google = [
        m for m in broadcasted
        if m.get("type") == "hud_command" and m.get("action") == "open_external"
    ]
    assert google and "google.com" in google[0].get("url", ""), broadcasted
    chat_replies = [m for m in ws.messages if m.get("type") == "chat_reply"]
    assert chat_replies, ws.messages
    print("  OK — web.search garde son repli Google dédié, non affecté par le correctif générique")


def main() -> int:
    print("=== smoke Hermes failure UX (correctif K) ===")
    test_non_web_search_hermes_failure_gets_chat_reply_and_tts()
    test_web_search_keeps_its_own_google_fallback_unchanged()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
