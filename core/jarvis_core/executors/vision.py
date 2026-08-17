"""Core executors — vision objet, sans holomat/face."""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


class VisionExecutorsMixin:

    async def _execute_vision_analyze(self, payload: dict[str, Any]) -> dict[str, Any]:
        """« Qu'est-ce que je te montre ? » — capture HUD, moteur vision requis."""
        from ..capabilities import for_intent
        from ..perception_dispatch import PerceptionError, PerceptionTimeout

        cap = for_intent("vision.analyze")
        if cap is None:
            return {"ok": False, "reason": "capability vision.analyze absente"}

        prompt = str(payload.get("prompt") or "").strip()
        if not prompt and (approval_id := payload.get("approval_id")):
            prompt = self._pending_prompts.pop(str(approval_id), "")
        if not prompt:
            prompt = (
                "Décris brièvement en français ce que montre cette image. "
                "Identifie les objets principaux visibles."
            )

        uid = self._session_user_id() or "local"
        try:
            snap = await self.perception.request_snapshot(self.broadcast)
        except PerceptionTimeout:
            spoken = "Je n'ai pas reçu d'image à temps. Allume la caméra et réessaie."
            await self.broadcast(await self.speak(spoken, user_id=uid))
            return {"ok": False, "reason": "snapshot_timeout"}
        except PerceptionError as exc:
            spoken = str(exc) or "Impossible de capturer l'image."
            await self.broadcast(await self.speak(spoken, user_id=uid))
            return {"ok": False, "reason": str(exc)}

        decision = self.policy.evaluate(action=cap.intent, text=prompt, risk=cap.risk)
        if not decision.allowed:
            return {"ok": False, "reason": decision.reason or "refusé par la Policy"}

        spoken = "L'analyse d'image n'est pas disponible sans moteur vision configuré."
        await self.broadcast(await self.speak(spoken, user_id=uid))
        return {"ok": False, "reason": "vision_provider_unavailable", "snapshot": True}

    async def _execute_vision_scene(self, payload: dict[str, Any]) -> dict[str, Any]:
        """« Que vois-tu en ce moment ? » — contexte SceneStore (Worker), sans snapshot."""
        from ..capabilities import for_intent

        cap = for_intent("vision.scene")
        if cap is None:
            return {"ok": False, "reason": "capability vision.scene absente"}

        scene = getattr(self, "scene", None)
        if scene is None:
            return {"ok": False, "reason": "scene store indisponible"}

        snap = scene.snapshot()
        text = scene.summary_text()
        uid = self._session_user_id() or "local"

        decision = self.policy.evaluate(action=cap.intent, text=text, risk=cap.risk)
        if not decision.allowed:
            return {"ok": False, "reason": decision.reason or "refusé par la Policy"}

        await self._publish_result_surface(
            "vision",
            title="Scène courante",
            body=text,
            source="vision.scene",
        )
        await self.broadcast(await self.speak(text, user_id=uid))
        return {"ok": True, "text": text, "intent": cap.intent, "scene": snap}
