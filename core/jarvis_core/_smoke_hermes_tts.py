"""Smoke — TTS Hermes après réponse delegate (offline, sans réseau)."""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.capabilities import CAPABILITIES  # noqa: E402
from jarvis_core.hermes.bridge import UNTRUSTED_PREFIX, strip_hermes_display_text  # noqa: E402
from jarvis_core.personality import HERMES_ELEVENLABS_VOICE_ID, resolve_elevenlabs_voice_id  # noqa: E402


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    print(f"  {status} — {label}" + (f" ({detail})" if detail else ""))
    if not cond:
        raise SystemExit(1)


class _WsCapture:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def send(self, raw: str) -> None:
        self.messages.append(json.loads(raw))


def test_strip_prefix() -> None:
    raw = UNTRUSTED_PREFIX + "Voici mon analyse."
    check("strip prefix", strip_hermes_display_text(raw) == "Voici mon analyse.")
    check("strip plain", strip_hermes_display_text("  direct  ") == "direct")


def test_voice_id() -> None:
    check(
        "hermes elevenlabs",
        resolve_elevenlabs_voice_id("hermes") == HERMES_ELEVENLABS_VOICE_ID,
    )


async def test_deliver_chat_result() -> None:
    from jarvis_core import Orchestrator

    orch = Orchestrator()
    ws = _WsCapture()
    speak_calls: list[dict[str, Any]] = []

    async def _track_speak(*args: Any, **kwargs: Any) -> dict[str, Any]:
        speak_calls.append({"args": args, "kwargs": kwargs})
        return {
            "type": "tts_audio",
            "speaker_entity": kwargs.get("speaker_entity", "jarvis"),
            "text": args[0] if args else "",
        }

    orch.speak = _track_speak  # type: ignore[method-assign]
    orch.broadcast = AsyncMock()

    cap = CAPABILITIES["reach"]
    result = {
        "intent": cap.intent,
        "owner": "hermes",
        "text": UNTRUSTED_PREFIX + "Trois articles récents sur l'IA.",
        "ok": True,
    }
    await orch._deliver_chat_result(
        ws,
        cap.intent,
        result,
        {"prompt": "actualité IA"},
    )

    replies = [m for m in ws.messages if m.get("type") == "chat_reply"]
    check("chat_reply", len(replies) == 1)
    check("speaker hermes", replies[0].get("speaker_entity") == "hermes")
    check("producer hermes", replies[0].get("producer") == "hermes")
    check("text sans prefix", "Trois articles" in replies[0].get("text", ""))
    check("speak called", len(speak_calls) == 1)
    check("speak hermes entity", speak_calls[0]["kwargs"].get("speaker_entity") == "hermes")
    handoffs = [m for m in ws.messages if m.get("type") == "speaker_handoff"]
    check("handoff jarvis", handoffs and handoffs[-1].get("to") == "jarvis")


async def test_speak_hermes_helper() -> None:
    from jarvis_core import Orchestrator

    orch = Orchestrator()
    captured: dict[str, Any] = {}

    async def _speak(text: str, **kwargs: Any) -> dict[str, Any]:
        captured.update({"text": text, **kwargs})
        return {"type": "tts_audio", "speaker_entity": kwargs.get("speaker_entity")}

    orch.speak = _speak  # type: ignore[method-assign]
    orch.broadcast = AsyncMock()

    await orch.speak_hermes(UNTRUSTED_PREFIX + "Bonjour.")
    check("helper strip", captured.get("text") == "Bonjour.")
    check("helper entity", captured.get("speaker_entity") == "hermes")


def main() -> None:
    print("-- Hermes TTS wiring --")
    test_strip_prefix()
    test_voice_id()
    asyncio.run(test_deliver_chat_result())
    asyncio.run(test_speak_hermes_helper())
    print("\nTous les tests Hermes TTS OK.")


if __name__ == "__main__":
    main()
