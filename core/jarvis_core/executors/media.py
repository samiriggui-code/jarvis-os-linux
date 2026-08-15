"""Core executors — média Plex + streaming Freebox (Phase 6)."""
from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import quote

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
        """Netflix / Disney+ / YouTube / cam salon — catalogue ``media.streaming``."""
        from ..salon_player import (
            google_on_player,
            player_configured,
            search_app,
            show_salon_camera,
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
            if player_configured():
                result = await show_salon_camera()
                spoken = (
                    "J'affiche la caméra du salon."
                    if result.get("ok")
                    else "Je n'arrive pas à ouvrir la caméra sur la Freebox."
                )
                await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
                return {"ok": result.get("ok"), "text": spoken, "camera": True}
            return {"ok": False, "reason": "player non configuré"}

        platforms: list[tuple[str, str, str]] = [
            ("netflix", "netflix", "Netflix"),
            ("disney", "disney", "Disney+"),
            ("youtube", "youtube", "YouTube"),
            ("prime", "prime", "Prime Video"),
        ]
        hit: tuple[str, str, str] | None = None
        if any(k in low for k in ("amazon prime", "prime video")):
            hit = ("prime", "prime", "Prime Video")
        if hit is None:
            hit = next(
                ((key, app, label) for key, app, label in platforms if f" {key} " in low),
                None,
            )
        web_ask = (
            hit is None
            and getattr(self, "_salon_turn", False)
            and any(
                k in low
                for k in (
                    " sur internet", " sur le web", " google ", "cherche",
                    "recherche", "trouve", "youtube",
                )
            )
        )

        if not hit and not web_ask:
            return {"ok": False, "reason": "plateforme non reconnue"}

        q = text
        for token in (
            "netflix", "disney+", "disney plus", "disney", "youtube",
            "amazon prime", "prime video", "amazon", "prime",
            "sur internet", "sur le web", "google",
            "sur", "regarde", "regarder", "ouvre", "lance", "cherche", "recherche", "trouve",
            "une série", "un film", "série", "serie", "film", "épisode", "episode",
        ):
            q = re.sub(re.escape(token), " ", q, flags=re.I)
        q = " ".join(q.split()).strip()

        if web_ask:
            app, label = "youtube", "YouTube"
            result = await google_on_player(q or label) if player_configured() else {"ok": False}
            url = f"https://www.youtube.com/results?search_query={quote(q or label)}"
        else:
            assert hit is not None
            _, app, label = hit
            if player_configured():
                result = await search_app(app, q or label)
            else:
                result = {"ok": False, "error": "player non configuré"}
            meta_search = {
                "netflix": "https://www.netflix.com/search?q=",
                "disney": "https://www.disneyplus.com/search?q=",
                "youtube": "https://www.youtube.com/results?search_query=",
                "prime": "https://www.primevideo.com/search/ref=atv_sr_sug?ie=UTF8&phrase=",
            }
            url = meta_search[app] + quote(q or label)

        await publish_result_surface(
            self,
            "video",
            title=f"{label} — {q or label}",
            body=(
                f"Freebox Player · {label}."
                if result.get("ok")
                else f"Repli HUD · {label} ({result.get('error') or 'player down'})."
            ),
            source="media.streaming",
            items=[url],
        )
        await self.broadcast({
            "type": "hud_command",
            "action": "open_external",
            "url": url,
        })
        if result.get("ok"):
            spoken = f"J'ouvre {label} sur la Freebox."
        elif player_configured():
            spoken = f"La Freebox ne répond pas — j'ouvre {label} sur le HUD."
        else:
            spoken = f"J'ouvre {label}."
        await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
        return {"ok": True, "text": spoken, "url": url}
