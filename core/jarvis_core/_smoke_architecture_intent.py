"""Smoke — intent Core architecture.explain joignable depuis le chat.

    python -m jarvis_core._smoke_architecture_intent
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


def test_capability_chat_triggers() -> None:
    from jarvis_core.capabilities import CAPABILITIES, Owner, for_intent, match_intent

    cap = for_intent("architecture.explain")
    assert cap is not None
    assert cap.owner is Owner.CORE
    assert cap.available is True
    assert cap.triggers
    assert CAPABILITIES["architecture-explain"] is cap
    assert match_intent("comment tu fonctionnes") is cap
    assert match_intent("Comment tu fonctionnes ?") is cap
    assert match_intent("où tourne hermes") is cap
    assert match_intent("Où tourne Hermes ?") is cap
    assert match_intent("how do you work") is cap
    assert match_intent("quelle heure est-il") is None
    assert match_intent("raconte-moi une blague") is None
    introspect = match_intent("tes skills hermes")
    assert introspect is not None and introspect.intent == "system.introspect"
    neural = match_intent("carte hermes")
    assert neural is not None and neural.intent == "core.neural_map"
    print("  OK — triggers chat, pas de vol introspect / neural_map / conversation")


def test_executor_source_isolation() -> None:
    import jarvis_core.executors.architecture as mod

    src = open(mod.__file__, encoding="utf-8").read()
    for banned in (
        "speak(",
        "broadcast(",
        "publish_result_surface",
        "homeassistant",
        "hermes.bridge",
        "hud_command",
    ):
        assert banned not in src, banned
    print("  OK — exécuteur sans voix / HUD / HA / Hermes")


def test_registered_and_execute() -> None:
    from jarvis_core import Orchestrator

    orch = Orchestrator()
    assert "architecture.explain" in orch.intents.actions

    result = asyncio.run(
        orch.intents.execute(
            "architecture.explain",
            {"prompt": "Où tourne Hermes ?", "skip_llm": True},
        )
    )
    assert result["ok"] is True
    assert result["snapshot_id"]
    text = (result.get("explanation") or "").lower()
    assert "conflit" in text or "hermes" in text
    print("  OK — intents.execute → explain_live (skip_llm)")


def test_chat_path_reply_no_tts() -> None:
    from jarvis_core import Orchestrator
    from jarvis_core.capabilities import match_intent
    from jarvis_core.policy import Decision

    prev = os.environ.get("JARVIS_FORCE_SYSTEM")
    os.environ["JARVIS_FORCE_SYSTEM"] = "1"
    try:
        orch = Orchestrator()
        orch.policy.evaluate = lambda **kwargs: Decision(allowed=True, needs_confirmation=False)  # type: ignore[method-assign]
        orch.speak = AsyncMock(return_value={"type": "tts_skipped"})

        class _Ws:
            def __init__(self) -> None:
                self.messages: list[dict[str, Any]] = []

            async def send(self, raw: str) -> None:
                self.messages.append(json.loads(raw))

        cap = match_intent("Où tourne Hermes ?")
        assert cap is not None and cap.intent == "architecture.explain"
        ws = _Ws()
        asyncio.run(orch._open_intent(ws, cap, "Où tourne Hermes ?"))

        replies = [m for m in ws.messages if m.get("type") == "chat_reply"]
        assert replies, ws.messages
        body = (replies[0].get("text") or "").lower()
        assert "hermes" in body or "conflit" in body
        assert replies[0].get("intent") == "architecture.explain"
        hud = [
            m for m in ws.messages
            if m.get("type") == "hud_command" or m.get("action") == "open_space"
        ]
        assert not hud
        orch.speak.assert_not_called()
        print("  OK — chat → architecture.explain → chat_reply, pas de TTS / HUD")
    finally:
        if prev is None:
            os.environ.pop("JARVIS_FORCE_SYSTEM", None)
        else:
            os.environ["JARVIS_FORCE_SYSTEM"] = prev


def test_not_in_proof_or_surface() -> None:
    from jarvis_core.surface_decision import decide_surface_id
    from jarvis_core.verification_hooks import needs_verification

    assert needs_verification("architecture.explain") is False
    assert decide_surface_id(intent="architecture.explain") is None
    print("  OK — pas Verification, pas surface HUD")


def main() -> int:
    print("=== smoke architecture.explain intent (chat) ===")
    test_capability_chat_triggers()
    test_executor_source_isolation()
    test_registered_and_execute()
    test_chat_path_reply_no_tts()
    test_not_in_proof_or_surface()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
