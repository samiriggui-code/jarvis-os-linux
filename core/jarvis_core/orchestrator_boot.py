"""Phase 4 — boot HUD / checklist superviseur."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from .ws.routes import BOOT_REPLAY_COOLDOWN_S

logger = logging.getLogger("jarvis.core")


class OrchestratorBootMixin:

    async def _send_boot_state(self, ws: Any, *, spoken: bool) -> None:
        """Encadre le boot pour le HUD — `start` puis `end`, toujours."""
        checks = ["hermes", "voice", "face", "holomat", "users", "agents"]
        try:
            await ws.send(json.dumps({
                "type": "boot_state", "phase": "start", "checks": checks,
            }))
            degraded = sorted(self.supervisor.status().get("degraded") or ())
            await ws.send(json.dumps({
                "type": "boot_state",
                "phase": "end",
                "ok": True,
                "spoken": spoken,
                "degraded": degraded,
                "pending_actions": [],
            }))
        except Exception as exc:  # noqa: BLE001
            logger.debug("boot_state non délivré : %s", exc)

    async def speak_boot_sequence(self, ws: Any) -> None:
        """Démarrage parlé : boot système, puis identification."""
        now = time.monotonic()
        silent = (
            getattr(self, "_boot_skip", False)
            or self.voice_cache is None
            or now - self._boot_spoken_at < BOOT_REPLAY_COOLDOWN_S
        )
        if silent:
            logger.debug("Boot annoncé sans voix (skip/cache/rejeu)")
            await self._send_boot_state(ws, spoken=False)
            self._boot_skip = False
            return
        self._boot_spoken_at = now
        self._boot_skip = False

        async def say_to(event: str, **kw: Any) -> dict[str, Any] | None:
            return await self.say(event, ws, **kw)

        self.sequences._say = say_to

        try:
            await asyncio.wait_for(self._components_ready.wait(), timeout=10.0)
        except (asyncio.TimeoutError, TimeoutError):
            logger.warning("Sondes non enregistrées — boot annoncé sans vérification")

        await ws.send(json.dumps({
            "type": "boot_state",
            "phase": "start",
            "checks": ["hermes", "voice", "face", "holomat", "users", "agents"],
        }))

        from .sequences import watched_components

        self.supervisor.replay(exclude=watched_components("boot"))
        self.recovery.reset()
        ok = await self.sequences.run("boot")
        try:
            await ws.send(json.dumps({
                "type": "boot_state",
                "phase": "end",
                "ok": ok,
                "degraded": sorted(self.sequences.degraded),
                "pending_actions": [
                    {"target": s.target, "command": s.command}
                    for s in self.recovery.pending_system
                ],
            }))
        except Exception as exc:  # noqa: BLE001
            logger.warning("boot_state end non délivré au client : %s — broadcast", exc)
            await self.broadcast({
                "type": "boot_state",
                "phase": "end",
                "ok": ok,
                "degraded": sorted(self.sequences.degraded),
                "pending_actions": [],
            })
        if not ok:
            logger.warning("Boot interrompu — identification non lancée")
