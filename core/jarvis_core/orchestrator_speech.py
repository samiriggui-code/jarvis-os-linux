"""Phase 4 — parole / cache vocal / salon TTS."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from typing import Any

from .ws.routes import SESSION_SAY_FALLBACKS, _ROLE_TITLES

logger = logging.getLogger("jarvis.core")

# Écho micro — le HUD n'a pas d'annulation d'écho acoustique matérielle : sans
# ça, le micro réentend la propre voix de JARVIS (annonces de boot comprises)
# et la re-transcrit comme une commande, qui peut interrompre une séquence en
# cours (incident constaté 2026-08-15 : « Noyau cognitif en ligne… » réentendu
# a coupé le boot). Généralise le garde qui n'existait qu'en dur pour les
# phrases de lock/veille (`ws/handlers/chat.py`) à N'IMPORTE QUEL texte
# réellement parlé, sans liste de phrases à maintenir à la main.
RECENT_SPOKEN_WINDOW_S = 12.0
_ECHO_MIN_WORDS = 3
_ECHO_OVERLAP_RATIO = 0.7


class OrchestratorSpeechMixin:

    def _remember_spoken(self, text: str) -> None:
        text = (text or "").strip()
        if not text:
            return
        now = time.monotonic()
        buf = list(getattr(self, "_recent_spoken", None) or [])
        buf.append((now, text))
        cutoff = now - RECENT_SPOKEN_WINDOW_S
        self._recent_spoken = [(t, s) for t, s in buf if t >= cutoff]

    def is_echo_of_recent_speech(self, text: str) -> bool:
        """La phrase transcrite ressemble-t-elle à ce que JARVIS vient tout
        juste de dire lui-même ? Recouvrement de mots (pas une égalité
        stricte : la STT déforme légèrement le texte réentendu)."""
        from .capabilities import _fold

        words = set(_fold(text).split())
        if len(words) < _ECHO_MIN_WORDS:
            return False
        now = time.monotonic()
        cutoff = now - RECENT_SPOKEN_WINDOW_S
        buf = getattr(self, "_recent_spoken", None) or []
        recent_text = " ".join(s for t, s in buf if t >= cutoff)
        if not recent_text:
            return False
        recent_words = set(_fold(recent_text).split())
        ratio = len(words & recent_words) / len(words)
        return ratio >= _ECHO_OVERLAP_RATIO

    async def speak(
        self,
        text: str,
        *,
        user_id: str = "local",
        language: str | None = None,
        preset: str | None = None,
        speaker_entity: str | None = None,
        voice_instruct: str | None = None,
        voice_personality: bool | None = None,
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
            text,
            user_id=user_id,
            language=language,
            preset=preset,
            speaker_entity=speaker_entity,
            voice_instruct=voice_instruct,
            voice_personality=voice_personality,
        )

        if ev.get("type") == "tts_fallback" and self.tts_live is not None:
            try:
                from .personality import resolve_elevenlabs_voice_id

                # Le reste de cette fonction traite déjà `speaker_entity or
                # "jarvis"` comme le défaut implicite (labels ci-dessous) —
                # cette résolution-ci l'oubliait, seule ligne qui compte pour
                # la synthèse réelle. Conséquence observée en prod
                # (2026-08-15) : tout `speak(texte, user_id=...)` sans
                # `speaker_entity` explicite (repli Hermes, introspection,
                # feedback intermédiaire…) échouait en silence
                # (`tts_unavailable_for_entity`) alors que JARVIS est
                # justement le locuteur par défaut partout ailleurs ici.
                entity_voice = resolve_elevenlabs_voice_id(speaker_entity or "jarvis")
                if not entity_voice:
                    logger.warning(
                        "Repli ElevenLabs ignoré · speaker=%s · tts_unavailable_for_entity",
                        speaker_entity or "jarvis",
                    )
                    return {
                        "type": "tts_skipped",
                        "utterance_id": ev.get("utterance_id"),
                        "reason": "tts_unavailable_for_entity",
                        "speaker_entity": speaker_entity or "jarvis",
                        "text": text,
                    }
                wav = await self.tts_live.synthesize(text, voice_id=entity_voice)
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
                "speaker_entity": speaker_entity or "jarvis",
                "source": "elevenlabs_live",
                "interruptible": True,
            }
        if isinstance(ev, dict) and ev.get("type") == "tts_audio":
            await self._maybe_salon_speak(ev)
            self._remember_spoken(ev.get("text") or text)
        return ev

    async def speak_entity(
        self,
        text: str,
        *,
        speaker_entity: str,
        user_id: str = "local",
        language: str | None = None,
        preset: str | None = None,
        producer: str | None = None,
    ) -> dict[str, Any]:
        """TTS pour une entité secondaire — anti-faux-agent : caller garantit la provenance."""
        clean = (text or "").strip()
        if speaker_entity == "hermes":
            from .hermes.bridge import strip_hermes_display_text

            clean = strip_hermes_display_text(clean)
        if not clean:
            clean = "C'est fait."
        ev = await self.speak(
            clean,
            user_id=user_id,
            language=language,
            preset=preset,
            speaker_entity=speaker_entity,
        )
        if isinstance(ev, dict) and producer:
            ev = {**ev, "producer": producer}
        return ev

    async def speak_hermes(
        self,
        text: str,
        *,
        user_id: str = "local",
        language: str | None = None,
        preset: str | None = None,
    ) -> dict[str, Any]:
        """Synthèse TTS avec la voix Hermes (ElevenLabs entity profile)."""
        return await self.speak_entity(
            text,
            speaker_entity="hermes",
            user_id=user_id,
            language=language,
            preset=preset,
            producer="hermes",
        )

    async def handoff_speaker(
        self,
        from_entity: str,
        to_entity: str = "jarvis",
        ws: Any = None,
    ) -> None:
        """Reprise de parole par l'orchestrateur après une entité secondaire."""
        payload = {
            "type": "speaker_handoff",
            "from": from_entity,
            "to": to_entity,
        }
        if ws is not None:
            await ws.send(json.dumps(payload))
        else:
            await self.broadcast(payload)

    async def handoff_speaker_jarvis(self, ws: Any = None) -> None:
        """Raccourci Hermes → JARVIS (compat)."""
        await self.handoff_speaker("hermes", "jarvis", ws=ws)

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
            if from_cache and isinstance(payload, dict) and payload.get("type") == "tts_audio":
                # Cache vocal (annonces de boot…) : ne passe pas par `speak()`,
                # doit donc alimenter l'écho lui-même.
                self._remember_spoken(payload.get("text") or "")

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
