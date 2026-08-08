"""Core executors — Home Assistant (Phase 6)."""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


class HomeExecutorsMixin:

    async def _execute_home(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..homeassistant import HomeAssistantAmbiguous, HomeAssistantUnavailable
        from ..surfaces.publisher import publish_result_surface

        prompt = str(payload.get("prompt") or "").strip()
        if not prompt and (approval_id := payload.get("approval_id")):
            prompt = self._pending_prompts.pop(str(approval_id), "")

        await self.broadcast({
            "type": "hud_command",
            "action": "open_space",
            "app": "home",
        })

        low = " ".join(prompt.lower().replace("'", " ").split())
        open_only = any(
            w in low
            for w in (
                "affiche", "ouvre", "montre", "mission control home",
                "mission contrôle home", "mission controle home",
            )
        ) and not any(
            w in low
            for w in ("allume", "éteint", "eteint", "ouvre la porte", "ferme", "lampe", "lumière", "lumiere")
        )
        if open_only or low in ("home", "maison", "domotique", "home assistant"):
            await self.say(
                "house_status",
                fallback_text="J'ouvre la maison sur l'écran.",
            )
            return {"ok": True, "opened": "home", "ha": False}

        try:
            result = await self.hass.execute(prompt or "état de la maison")
        except HomeAssistantAmbiguous as exc:
            await self.say("not_understood", fallback_text=str(exc))
            return {"ok": False, "ambiguous": True, "reason": str(exc)}
        except HomeAssistantUnavailable as exc:
            await self.say("house_unreachable", fallback_text=str(exc))
            raise RuntimeError(str(exc)) from exc

        await self._say_home(result)
        if result.get("ok"):
            entity = str(result.get("entity_id") or "appareil")
            action = str(result.get("action") or "état")
            await publish_result_surface(
                self,
                "home",
                title="Maison",
                body=f"{action} · {entity.replace('_', ' ')}",
                source="home.control",
                items=[entity] if entity else None,
            )
        return result

    async def _say_home(self, result: dict[str, Any]) -> None:
        name = str(result.get("entity_id") or "").split(".")[-1].replace("_", " ")

        if not result.get("ok"):
            await self.say(
                "device_unreachable",
                bindings={"device": name or "cet appareil"},
                fallback_text=str(result.get("reason") or "Appareil injoignable."),
            )
            return

        action = str(result.get("action") or "")
        event = {"on": "light_on", "off": "light_off", "open": "light_on",
                 "close": "light_off", "toggle": "ack_done"}.get(action)

        if event is None:
            return

        await self.say(event, bindings={"room": name or "la pièce"}, fallback_text="C'est fait.")
