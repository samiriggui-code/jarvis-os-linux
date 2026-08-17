"""Core executors — Home Assistant (Phase 6)."""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


class HomeExecutorsMixin:

    async def _execute_home(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..homeassistant import HomeAssistantAmbiguous, HomeAssistantUnavailable
        from ..surfaces.publisher import publish_component_surface, publish_result_surface

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
            return await self._publish_house_status(
                spoken_prefix="Voici l'état de la maison.",
            )

        try:
            result = await self.hass.execute(prompt or "état de la maison")
        except HomeAssistantAmbiguous as exc:
            await self.say("not_understood", fallback_text=str(exc))
            return {"ok": False, "ambiguous": True, "reason": str(exc)}
        except HomeAssistantUnavailable as exc:
            await self.say("house_unreachable", fallback_text=str(exc))
            raise RuntimeError(str(exc)) from exc

        # Échec honnête + snapshot (ex. « allume » alors que 0 light dans HA).
        if not result.get("ok") and isinstance(result.get("house_status"), dict):
            status = result["house_status"]
            reason = str(result.get("reason") or "Aucun appareil ne correspond.")
            await self.say("device_unreachable", fallback_text=reason)
            await self._surface_house_status(status, publish_component_surface)
            return result

        await self._say_home(result)
        if result.get("ok") and result.get("action") == "read":
            entities = result.get("entities") or []
            items = [
                f"{e.get('name') or e.get('id')}: {e.get('state')}"
                for e in entities
                if isinstance(e, dict)
            ][:20]
            await publish_result_surface(
                self,
                "home",
                title="Maison",
                body="État lu depuis Home Assistant.",
                source="home.control",
                items=items,
            )
            return result

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

    async def _publish_house_status(self, *, spoken_prefix: str = "") -> dict[str, Any]:
        from ..homeassistant import HomeAssistantUnavailable
        from ..surfaces.publisher import publish_component_surface

        try:
            status = await self.hass.house_status()
        except HomeAssistantUnavailable as exc:
            await self.say("house_unreachable", fallback_text=str(exc))
            raise RuntimeError(str(exc)) from exc

        speech = str(status.get("speech") or "État maison indisponible.")
        if spoken_prefix:
            speech = f"{spoken_prefix} {speech}"
        await self.say("house_status", fallback_text=speech)
        await self._surface_house_status(status, publish_component_surface)
        return {"ok": True, "opened": "home", "ha": True, "house_status": status}

    async def _surface_house_status(self, status: dict[str, Any], publish_component_surface: Any) -> None:
        rows = status.get("rows") or []
        columns = status.get("columns") or ["domaine", "nom", "état", "entité"]
        if rows:
            await publish_component_surface(
                self,
                "home",
                component="DataTable",
                props={
                    "title": "Maison — Home Assistant",
                    "columns": columns,
                    "rows": rows,
                },
            )
            return
        await publish_component_surface(
            self,
            "home",
            component="ResultPanel",
            props={
                "title": "Maison",
                "body": str(status.get("speech") or "Inventaire vide."),
                "source": "home.control",
                "items": [],
            },
        )

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
