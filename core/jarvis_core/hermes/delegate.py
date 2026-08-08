"""HermesIntentDelegate — chemin unique tuile + chat (Phase 6)."""
from __future__ import annotations

import logging
from typing import Any, TYPE_CHECKING

from .bridge import HermesRefused, HermesUnavailable

if TYPE_CHECKING:
    from ..capabilities import Capability

logger = logging.getLogger("jarvis.core")


class HermesIntentDelegate:
    """Délégué Hermes du Core — une seule porte après Policy."""

    def __init__(self, orch: Any) -> None:
        self._orch = orch

    async def execute(
        self,
        cap: Capability,
        payload: dict[str, Any],
        *,
        decision: Any,
    ) -> dict[str, Any]:
        from ..ws.routes import default_prompt

        prompt = str(payload.get("prompt") or "").strip()
        if not prompt and (approval_id := payload.get("approval_id")):
            prompt = self._orch._pending_prompts.pop(str(approval_id), "")
        if not prompt:
            prompt = default_prompt(cap)

        try:
            reply = await self._orch.hermes.ask(
                cap,
                prompt,
                role=self._orch._session_role(),
                decision=decision,
            )
        except (HermesRefused, HermesUnavailable) as exc:
            raise RuntimeError(str(exc)) from exc

        text = (reply.text or "").strip()
        if text and cap.app_id:
            await self._orch._publish_result_surface(
                cap.app_id,
                title=cap.app_id.replace("-", " ").title(),
                body=text,
                source=cap.intent,
                items=self._web_search_items(cap.intent, prompt),
            )

        return {
            "intent": cap.intent,
            "owner": "hermes",
            "toolset": cap.toolset,
            "display": cap.display.value,
            "text": text,
            "ok": bool(text),
        }

    @staticmethod
    def _web_search_items(intent: str, prompt: str) -> list[str] | None:
        if intent != "web.search":
            return None
        from urllib.parse import quote

        q = prompt.strip()[:200]
        if not q:
            return None
        return ["https://www.google.com/search?q=" + quote(q)]
