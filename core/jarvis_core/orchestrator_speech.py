"""Phase 4 — parole / cache vocal / salon TTS."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from typing import Any

from .ws.routes import SESSION_SAY_FALLBACKS, _ROLE_TITLES

logger = logging.getLogger("jarvis.core")


class OrchestratorSpeechMixin:

    async def speak(
        self,
        text: str,
        *,
        user_id: str = "local",
        language: str | None = None,
        preset: str | None = None,
    ) -> dict[str, Any]:
        """TTS → event HUD. Sans Voice Manager, le HUD parle avec ttsDev."""
        if self.voice is None:
            return {
                "type": "tts_fallback",
                "utterance_id": None,
                "text": text,
                "reason": "voice_module_unavailable",
                "language": language or "fr",
            }
        ev = await self.voice.speak(
            text, user_id=user_id, language=language, preset=preset
        )

        if ev.get("type") == "tts_fallback" and self.tts_live is not None:
            try:
                wav = await self.tts_live.synthesize(text)
            except Exception as exc:  # noqa: BLE001
                logger.info("Repli ElevenLabs indisponible : %s", exc)
                return ev
            ev = {
                "type": "tts_audio",
                "utterance_id": ev.get("utterance_id"),
                "format": "wav",
                "audio_b64": base64.b64encode(wav).decode("ascii"),
                "bytes": len(wav),
                "text": text,
                "user_id": user_id,
                "source": "elevenlabs_live",
                "interruptible": True,
            }
        if isinstance(ev, dict) and ev.get("type") == "tts_audio":
            await self._maybe_salon_speak(ev)
        return ev

    async def say(
        self,
        event: str,
        ws: Any = None,
        *,
        user_id: str = "local",
        address: str | None = None,
        user_role: str | None = None,
        bindings: dict[str, str] | None = None,
        fallback_text: str | None = None,
    ) -> dict[str, Any] | None:
        """Fait parler JARVIS depuis le CACHE, avec repli sur la synthèse."""
        payload = None
        from_cache = False
        if self.voice_cache is not None:
            payload = self.voice_cache.play(
                event,
                user_id=user_id,
                address=address,
                user_role=user_role,
                bindings=bindings,
            )
            from_cache = payload is not None

        if payload is None:
            raw = fallback_text or SESSION_SAY_FALLBACKS.get(event)
            if raw:
                titre = (bindings or {}).get("titre") or _ROLE_TITLES.get(
                    (user_role or "").lower(), "monsieur"
                )
                text = raw.format(
                    titre=titre,
                    user=(bindings or {}).get("user", ""),
                )
                payload = await self.speak(text, user_id=user_id)

        if payload is None:
            logger.debug("say(%s) : ni cache ni texte de repli", event)
            return None

        if from_cache:
            await self._maybe_salon_speak(payload)

        if ws is not None:
            await ws.send(json.dumps(payload))
        else:
            await self.broadcast(payload)
        return payload

    async def _maybe_salon_speak(self, payload: dict[str, Any] | None) -> None:
        """Route un WAV `tts_audio` vers le satellite qui a la bouche."""
        device_id = getattr(self, "_tts_output_device_id", None)
        if not device_id:
            return
        if not isinstance(payload, dict) or payload.get("type") != "tts_audio":
            return

        devices = getattr(self, "devices", None)
        if devices is not None:
            dev = devices.get_device(str(device_id))
            if dev is None or not dev.online:
                logger.debug("tts satellite ignoré · device offline/inconnu · %s", device_id)
                return
            if "audio.output" not in dev.capabilities and "speaker.output" not in dev.capabilities:
                logger.debug(
                    "tts satellite ignoré · pas audio.output · %s · caps=%s",
                    device_id,
                    list(dev.capabilities),
                )
                return

        try:
            from .salon_speaker import push_tts_to_salon

            asyncio.create_task(push_tts_to_salon(payload))
        except Exception:  # noqa: BLE001
            logger.debug("salon speaker non branché", exc_info=True)
