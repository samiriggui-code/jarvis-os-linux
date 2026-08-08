"""Phase 3 — exécutants HUD / enrollment kiosk."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


class HudIntentExecutorsMixin:

    async def _start_kiosk_enrollment(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Admin → ouvre l'UI d'enrôlement sur TOUS les HUD (kiosk NUC inclus).

        La capture face/voix se fait sur la caméra du kiosk maison, pas sur le
        portable distant. Le Core diffuse `hud_command/start_enrollment` puis
        lance la séquence vocale `enrollment`.
        """
        sess = self.auth.active if self.auth is not None else None
        if self.auth is not None and not self.auth.users.is_first_run():
            if sess and not (
                "user_management" in sess.permissions
                or "dashboard_access" in sess.permissions
            ):
                pass

        prompt = str(payload.get("prompt") or "")
        username = str(payload.get("username") or "").strip()
        display_name = str(payload.get("display_name") or "").strip()
        role = "USER"
        if display_name and not username:
            username = (
                "".join(c for c in display_name.lower() if c.isalnum() or c in "-_")[:24]
                or "membre"
            )

        await self.broadcast({
            "type": "hud_command",
            "action": "start_enrollment",
            "username": username or None,
            "display_name": display_name or None,
            "role": role,
        })

        self._voice_quiet = False
        try:
            self.sequences.abort()
        except Exception:  # noqa: BLE001
            pass
        for _ in range(40):
            if not getattr(self.sequences, "_running", None):
                break
            await asyncio.sleep(0.05)
        await asyncio.sleep(0.05)

        async def say_to(event: str, **kw: Any) -> dict[str, Any] | None:
            return await self.say(event, **kw)

        self.sequences._say = say_to
        task = asyncio.create_task(
            self.sequences.run("enrollment", **self._say_context())
        )
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

        if display_name:
            await asyncio.sleep(0.3)
            self.sequences.signal("enroll.name")
            self.sequences.signal("enroll.profile")

        spoken = (
            f"Enrôlement lancé sur le kiosk pour {display_name}."
            if display_name
            else "Enrôlement lancé sur le kiosk. Placez la personne face à la caméra."
        )
        await self.broadcast(await self.speak(spoken, user_id=sess.user_id if sess else "local"))
        return {
            "ok": True,
            "action": "start_enrollment",
            "username": username or None,
            "display_name": display_name or None,
            "role": role,
            "spoken": spoken,
        }

    async def _execute_hud(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Actions quotidiennes HUD — Core décide, le navigateur exécute."""
        intent = str(payload.get("intent") or "").strip()
        if not intent:
            intent = str(getattr(self, "_hud_intent_hint", "") or "")

        prompt = str(payload.get("prompt") or "").strip().lower()
        if not intent:
            if any(
                k in prompt
                for k in (
                    "verrouille la session", "verrouille-toi", "verrouille toi",
                    "lock session", "verrouille le hud",
                )
            ):
                intent = "hud.lock"
            elif any(
                k in prompt
                for k in ("mode veille", "mets-toi en veille", "met toi en veille", "repos", "standby")
            ):
                intent = "hud.idle"
            elif any(k in prompt for k in ("ferme", "close")):
                intent = "hud.close_space"
            elif any(k in prompt for k in ("remets le son", "unmute", "écoute", "allume le micro")):
                intent = "hud.unmute"
            elif any(k in prompt for k in ("coupe le son", "mute", "sourdine", "silence")):
                intent = "hud.mute"
            elif any(k in prompt for k in ("allume la cam", "ouvre la cam", "active la cam", "réveille la cam")):
                intent = "hud.camera_on"
            elif any(k in prompt for k in ("coupe la cam", "éteins la cam", "ferme la cam", "arrête la cam")):
                intent = "hud.camera_off"
            elif any(k in prompt for k in (
                "enrôl", "enrol", "inscris", "nouvel utilisateur", "nouveau profil",
                "ajoute un profil", "enrolement", "enrôlement", "family enroll",
            )):
                intent = "hud.enroll"

        action = {
            "hud.lock": "lock",
            "hud.idle": "idle",
            "hud.close_space": "close_spaces",
            "hud.mute": "mute",
            "hud.unmute": "unmute",
            "hud.camera_on": "camera_on",
            "hud.camera_off": "camera_off",
            "hud.enroll": "start_enrollment",
        }.get(intent)

        if not action:
            return {"ok": False, "reason": f"commande HUD inconnue : {intent}"}

        if action == "start_enrollment":
            return await self._start_kiosk_enrollment(payload)

        close_all = action == "close_spaces" and (
            "tout" in prompt or "espaces" in prompt or "fenêtres" in prompt or "fenetres" in prompt
        )

        if action == "lock":
            try:
                self.sequences.abort()
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(0.05)

            async def say_to(event: str, **kw: Any) -> dict[str, Any] | None:
                return await self.say(event, **kw)

            self.sequences._say = say_to
            await self.sequences.run("lock", **self._say_context())
        elif action == "idle":
            try:
                self.sequences.abort()
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(0.05)

            async def say_idle(event: str, **kw: Any) -> dict[str, Any] | None:
                return await self.say(event, **kw)

            self.sequences._say = say_idle
            await self.sequences.run("lock_auto", **self._say_context())

        cmd = {
            "type": "hud_command",
            "action": action,
            "close_all": close_all,
            "intent": intent,
        }
        await self.broadcast(cmd)

        if action not in ("lock", "idle"):
            spoken = {
                "close_spaces": "Espaces fermés." if close_all else "Espace fermé.",
                "mute": "Micro coupé.",
                "unmute": "Micro réactivé.",
                "camera_on": "Caméra allumée.",
                "camera_off": "Caméra coupée.",
            }.get(action, "C'est fait.")
            ev = await self.speak(spoken, user_id=self._session_user_id() or "local")
            await self.broadcast(ev)
            await self.broadcast(self.cmd("display_notification", message=spoken, duration=3.0))
        else:
            await self.broadcast(
                self.cmd(
                    "display_notification",
                    message="Session verrouillée." if action == "lock" else "Mode veille.",
                    duration=3.0,
                )
            )
        return {"ok": True, "action": action}
