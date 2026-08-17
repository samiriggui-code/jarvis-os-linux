"""Core executors — média Plex + streaming HA (Gateway spec)."""

from __future__ import annotations



import logging

from typing import Any



logger = logging.getLogger("jarvis.core")





class MediaExecutorsMixin:



    async def _execute_media_pause(self, payload: dict[str, Any]) -> dict[str, Any]:

        from ..homeassistant import HomeAssistantUnavailable



        prompt = str(payload.get("prompt") or "coupe la musique").strip()

        try:

            result = await self.hass.execute(prompt)

        except HomeAssistantUnavailable as exc:

            await self.broadcast(

                await self.speak(

                    "Je n'ai pas accès à la musique pour le moment.",

                    user_id=self._session_user_id() or "local",

                )

            )

            return {"ok": False, "reason": str(exc)}

        except Exception as exc:  # noqa: BLE001

            msg = str(exc) or "Impossible de couper la musique."

            await self.broadcast(await self.speak(msg, user_id=self._session_user_id() or "local"))

            return {"ok": False, "reason": msg}



        if result.get("ok"):

            ev = await self.speak("Musique coupée.", user_id=self._session_user_id() or "local")

            await self.broadcast(ev)

        else:

            ev = await self.speak(

                str(result.get("reason") or "Aucun lecteur trouvé."),

                user_id=self._session_user_id() or "local",

            )

            await self.broadcast(ev)

        return result



    async def _execute_video(self, payload: dict[str, Any]) -> dict[str, Any]:

        from ..plex import PlexAmbiguous, PlexUnavailable



        prompt = str(payload.get("prompt") or "").strip()

        if not prompt and (approval_id := payload.get("approval_id")):

            prompt = self._pending_prompts.pop(str(approval_id), "")



        try:

            result = await self.plex.execute(prompt or "qu'est-ce qui joue")

        except PlexAmbiguous as exc:

            await self.say("not_understood", fallback_text=str(exc))

            return {"ok": False, "ambiguous": True, "reason": str(exc)}

        except PlexUnavailable as exc:

            await self.say(

                "device_unreachable",

                bindings={"device": "le lecteur"},

                fallback_text=str(exc),

            )

            raise RuntimeError(str(exc)) from exc



        await self._say_video(result)

        return result



    async def _say_video(self, result: dict[str, Any]) -> None:

        if not result.get("ok"):

            await self.say(

                "device_unreachable",

                bindings={"device": "le lecteur"},

                fallback_text=str(result.get("reason") or "Je ne trouve pas ce titre."),

            )

            return



        if result.get("action") != "play":

            return



        await self.say(

            "media_launched",

            bindings={"service": str(result.get("title") or "La lecture")},

            fallback_text="C'est parti.",

        )



    async def _execute_streaming(self, payload: dict[str, Any]) -> dict[str, Any]:

        """Netflix / Disney+ / YouTube — Home Assistant NUC uniquement."""

        from ..homeassistant import (

            HomeAssistantAmbiguous,

            HomeAssistantUnavailable,

        )

        from ..surfaces.publisher import publish_result_surface



        text = str(payload.get("prompt") or "").strip()

        low = " " + " ".join(text.lower().replace("'", " ").split()) + " "



        if any(

            k in low

            for k in (

                " caméra", " camera", " la cam ", " montre la cam",

                "affiche la cam", "flux salon", "voir le salon",

            )

        ):

            return await self._execute_streaming_camera(text)



        if not self.hass.configured:

            spoken = "Home Assistant n'est pas configuré — impossible de lancer le streaming."

            await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))

            return {"ok": False, "reason": spoken}



        try:

            result = await self.hass.execute_streaming(text)

        except HomeAssistantAmbiguous as exc:

            await self.say("not_understood", fallback_text=str(exc))

            return {"ok": False, "ambiguous": True, "reason": str(exc)}

        except HomeAssistantUnavailable as exc:

            await self.say("house_unreachable", fallback_text=str(exc))

            return {"ok": False, "reason": str(exc)}



        if result.get("ok"):

            label = str(result.get("label") or "l'application")

            entity = str(result.get("entity_id") or "").replace("_", " ")

            spoken = f"J'ouvre {label} sur {entity.split('.')[-1] or 'la télé'}."

            await publish_result_surface(

                self,

                "video",

                title=f"{label} — HA",

                body=f"{entity} · media_player.play_media",

                source="media.streaming",

            )

            await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))

            return {**result, "text": spoken, "via": "ha"}



        reason = str(result.get("reason") or "Je n'ai pas pu lancer le streaming sur un lecteur.")

        await self.broadcast(await self.speak(reason, user_id=self._session_user_id() or "local"))

        return {**result, "ok": False, "reason": reason}



    async def _execute_streaming_camera(self, text: str) -> dict[str, Any]:

        from ..salon_camera import camera_configured, show_salon_camera



        if camera_configured():

            result = await show_salon_camera()

            spoken = (

                "J'affiche la caméra du salon."

                if result.get("ok")

                else "Je n'arrive pas à ouvrir la caméra sur la Freebox."

            )

            await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))

            return {"ok": result.get("ok"), "text": spoken, "camera": True}

        spoken = "Le satellite salon n'est pas configuré pour la caméra."

        await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))

        return {"ok": False, "reason": spoken}

