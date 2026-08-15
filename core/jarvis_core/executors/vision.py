"""Core executors — vision objet (snapshot → Hermes), sans holomat/face."""
from __future__ import annotations

import logging
from dataclasses import replace
from typing import Any

logger = logging.getLogger("jarvis.core")


class VisionExecutorsMixin:

    async def _execute_vision_analyze(self, payload: dict[str, Any]) -> dict[str, Any]:
        """« Qu'est-ce que je te montre ? » — HUD snapshot → Hermes vision."""
        from ..capabilities import Owner, for_intent
        from ..hermes.bridge import HermesRefused, HermesUnavailable, strip_hermes_display_text
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
        role = self._session_role()

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

        jpeg_b64 = str(snap.get("jpeg_b64") or "")
        decision = self.policy.evaluate(action=cap.intent, text=prompt, risk=cap.risk)
        if not decision.allowed:
            return {"ok": False, "reason": decision.reason or "refusé par la Policy"}

        hermes_cap = replace(cap, owner=Owner.HERMES, toolset="vision")
        try:
            reply = await self.hermes.ask(
                hermes_cap,
                prompt,
                role=role,
                decision=decision,
                image_b64=jpeg_b64,
            )
        except HermesUnavailable as exc:
            spoken = "Hermes vision n'est pas disponible pour analyser l'image."
            await self.broadcast(await self.speak(spoken, user_id=uid))
            return {"ok": False, "reason": str(exc), "snapshot": True}
        except HermesRefused as exc:
            spoken = str(exc) or "Analyse visuelle refusée."
            await self.broadcast(await self.speak(spoken, user_id=uid))
            return {"ok": False, "reason": str(exc), "snapshot": True}

        raw = (reply.text or "").strip()
        text = strip_hermes_display_text(raw)
        if not text:
            spoken = "Je n'ai pas pu analyser l'image."
            await self.broadcast(await self.speak(spoken, user_id=uid))
            return {"ok": False, "reason": "empty_reply", "snapshot": True}

        await self._publish_result_surface(
            "vision",
            title="Analyse visuelle",
            body=text,
            source="vision.analyze",
        )
        ev = await self.speak_hermes(text, user_id=uid)
        await self.broadcast(ev)
        await self.handoff_speaker_jarvis()
        return {"ok": True, "text": text, "intent": cap.intent, "run_id": reply.run_id}

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
