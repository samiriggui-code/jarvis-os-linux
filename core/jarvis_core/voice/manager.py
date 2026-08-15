"""Voice Manager — TTS voicebox, barge-in, dégradation vers le HUD.

Contrat WebSocket ajouté (aligné sur `hudContracts.ts`) :

    Core → HUD   tts_audio      { utterance_id, format:"wav", audio_b64, … }
    Core → HUD   tts_fallback   { utterance_id, text, reason }
    Core → HUD   tts_skipped    { utterance_id, reason }
    HUD  → Core  voice/playback { phase:"start"|"end", utterance_id }

Le HUD joue le son, pas le Core. C'est ce qui permet le barge-in, le choix du
périphérique de sortie et une orbe synchronisée sur le *vrai* début/fin audio
plutôt que sur un délai fixe.

Aucun appel réseau au démarrage : `probe()` tourne en tâche de fond après
`serve()`, sinon un voicebox absent retarderait le boot du Core.
"""

from __future__ import annotations

import base64
import logging
import time
from typing import Any

from .profiles import VoiceSelection, resolve_voice
from .tts_config import voicebox_tts_enabled
from .voicebox import (
    DEFAULT_ENGINE,
    VoiceboxClient,
    VoiceboxError,
    VoiceboxModelDownloading,
    VoiceboxUnavailable,
)

logger = logging.getLogger("jarvis.voice")

# Après une panne, ne pas retenter à chaque phrase : le HUD parlerait avec
# 60 s de retard à chaque fois.
RETRY_AFTER_S = 30.0

# Filet côté HUD si aucun `playback end` ne revient (mêmes ordres de grandeur
# que ttsDev.ts : 800 ms + 80 ms par caractère).
def _estimated_ms(text: str) -> int:
    return min(30_000, 800 + len(text) * 80)


class VoiceManager:
    """Synthèse par utilisateur + état de disponibilité voicebox."""

    def __init__(self, client: VoiceboxClient | None = None) -> None:
        self.client = client or VoiceboxClient()
        self.available: bool | None = None  # None = pas encore sondé
        self.last_error: str | None = None
        self.backend: str | None = None
        self._last_probe: float = 0.0
        self._seq = 0
        self._active: str | None = None
        self._cancelled: set[str] = set()

    # -- état ----------------------------------------------------------------

    def status(self) -> dict[str, Any]:
        return {
            "url": self.client.base,
            "available": self.available,
            "backend": self.backend,
            "error": self.last_error,
            "speaking": self._active,
            "engine_default": DEFAULT_ENGINE,
            "voicebox_tts": voicebox_tts_enabled(),
            "dynamic_provider": "elevenlabs" if not voicebox_tts_enabled() else "voicebox_or_elevenlabs",
        }

    async def probe(self) -> bool:
        """Sonde `/health`. Ne lève jamais."""
        self._last_probe = time.monotonic()
        try:
            info = await self.client.health()
        except VoiceboxUnavailable as exc:
            self.available = False
            self.last_error = str(exc)
            logger.warning("voicebox injoignable (%s) — TTS délégué au HUD", self.client.base)
            return False
        except VoiceboxError as exc:
            self.available = False
            self.last_error = str(exc)
            logger.warning("voicebox en erreur : %s", exc)
            return False

        self.available = True
        self.last_error = None
        self.backend = str(info.get("backend") or info.get("device") or "") or None
        tts_note = " · tts=skipped" if not voicebox_tts_enabled() else ""
        logger.info(
            "voicebox prêt · %s · backend=%s%s",
            self.client.base,
            self.backend or "?",
            tts_note,
        )
        return True

    def _should_retry(self) -> bool:
        if self.available is not False:
            return True
        return (time.monotonic() - self._last_probe) >= RETRY_AFTER_S

    # -- synthèse ------------------------------------------------------------

    def _next_utterance_id(self) -> str:
        self._seq += 1
        return f"u{self._seq}"

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
        """Retourne l'event à envoyer au HUD. Ne lève jamais.

        `language` / `preset` viennent de `locale.resolve_reply_language()` pour
        cet énoncé. Le caller décide du transport (`ws.send` pour une réponse
        ciblée, `broadcast` pour un événement système).
        """
        clean = (text or "").strip()
        utterance_id = self._next_utterance_id()

        if not clean:
            return {"type": "tts_skipped", "utterance_id": utterance_id, "reason": "empty"}

        try:
            selection = resolve_voice(
                user_id,
                language=language,
                preset=preset,
                speaker_entity=speaker_entity,
                instruct_hint=voice_instruct,
                personality_hint=voice_personality,
            )
        except Exception as exc:  # noqa: BLE001 — une préf cassée ne coupe pas la voix
            logger.warning("resolve_voice a échoué · user=%s : %s", user_id, exc)
            selection = None

        if selection is not None and not selection.enabled:
            return {
                "type": "tts_skipped",
                "utterance_id": utterance_id,
                "reason": "tts_disabled",
            }

        # Barge-in : la nouvelle phrase annule celle qui joue encore.
        self.cancel()
        self._active = utterance_id

        speaker = speaker_entity or "jarvis"

        if not voicebox_tts_enabled():
            logger.info(
                "TTS %s · speaker=%s · provider=ElevenLabs · cache=miss · voicebox_tts=disabled",
                utterance_id,
                speaker,
            )
            return await self._elevenlabs_or_fallback(
                utterance_id,
                clean,
                "voicebox_tts_disabled",
                selection,
                speaker_entity=speaker_entity,
            )

        if not self._should_retry():
            return await self._elevenlabs_or_fallback(
                utterance_id,
                clean,
                "voicebox_unavailable",
                selection,
                speaker_entity=speaker_entity,
            )

        try:
            return await self._synthesize(
                utterance_id, clean, selection, user_id, speaker_entity=speaker_entity
            )
        except VoiceboxUnavailable as exc:
            self.available = False
            self.last_error = str(exc)
            self._last_probe = time.monotonic()
            logger.warning("voicebox tombé pendant la synthèse : %s", exc)
            return await self._elevenlabs_or_fallback(
                utterance_id,
                clean,
                "voicebox_unavailable",
                selection,
                speaker_entity=speaker_entity,
            )
        except VoiceboxModelDownloading as exc:
            self.last_error = str(exc)
            logger.info("voicebox télécharge « %s » — fallback HUD en attendant", exc.model)
            return await self._elevenlabs_or_fallback(
                utterance_id,
                clean,
                "model_downloading",
                selection,
                speaker_entity=speaker_entity,
            )
        except VoiceboxError as exc:
            self.last_error = str(exc)
            logger.warning("synthèse refusée : %s", exc)
            return await self._elevenlabs_or_fallback(
                utterance_id,
                clean,
                "voicebox_error",
                selection,
                speaker_entity=speaker_entity,
            )
        except Exception as exc:  # noqa: BLE001 — jamais muet à cause d'un bug ici
            self.last_error = str(exc)
            logger.exception("synthèse : erreur inattendue")
            return await self._elevenlabs_or_fallback(
                utterance_id,
                clean,
                "internal_error",
                selection,
                speaker_entity=speaker_entity,
            )

    async def _synthesize(
        self,
        utterance_id: str,
        text: str,
        selection: VoiceSelection | None,
        user_id: str,
        *,
        speaker_entity: str | None = None,
    ) -> dict[str, Any]:
        if selection is None:
            return await self._elevenlabs_or_fallback(
                utterance_id,
                text,
                "no_voice_selection",
                None,
                speaker_entity=speaker_entity,
            )

        profile_id = await self.client.resolve_profile_id(selection.profile)
        if not profile_id:
            self.last_error = "aucun profil de voix dans voicebox"
            logger.warning(
                "voicebox n'expose aucun profil — créer « %s » puis repli ElevenLabs",
                selection.profile,
            )
            return await self._elevenlabs_or_fallback(
                utterance_id,
                text,
                "no_profile",
                selection,
                speaker_entity=speaker_entity,
            )

        started = time.monotonic()
        wav = await self.client.synthesize(
            text,
            profile_id=profile_id,
            language=selection.language,
            engine=selection.engine,
            instruct=selection.instruct,
            personality=selection.personality,
        )
        elapsed_ms = int((time.monotonic() - started) * 1000)

        self.available = True
        self.last_error = None

        # La phrase a pu être annulée pendant la synthèse (barge-in).
        if utterance_id in self._cancelled:
            self._cancelled.discard(utterance_id)
            logger.debug("phrase %s annulée pendant la synthèse — audio jeté", utterance_id)
            return {
                "type": "tts_skipped",
                "utterance_id": utterance_id,
                "reason": "cancelled",
            }

        logger.info(
            "TTS %s · %d o · %s/%s · %d ms",
            utterance_id,
            len(wav),
            selection.engine,
            selection.language,
            elapsed_ms,
        )
        return {
            "type": "tts_audio",
            "utterance_id": utterance_id,
            "format": "wav",
            "audio_b64": base64.b64encode(wav).decode("ascii"),
            "bytes": len(wav),
            "text": text,
            "user_id": user_id,
            "speaker_entity": speaker_entity or "jarvis",
            "voice": selection.to_dict(),
            "synth_ms": elapsed_ms,
            "estimated_ms": _estimated_ms(text),
            "interruptible": True,
        }

    async def _elevenlabs_or_fallback(
        self,
        utterance_id: str,
        text: str,
        reason: str,
        selection: VoiceSelection | None,
        *,
        speaker_entity: str | None = None,
    ) -> dict[str, Any]:
        """Synthèse ElevenLabs — provider dynamique nominal (anti cross-voice)."""
        speaker = speaker_entity or "jarvis"
        try:
            from ..personality import resolve_elevenlabs_voice_id
            from .elevenlabs import ElevenLabsLive

            # Même défaut que `speaker` ci-dessus, qui sert déjà au label/log
            # — cette résolution-ci utilisait encore la valeur brute
            # (souvent `None`), donc `tts_unavailable_for_entity` pour tout
            # appelant qui ne précise pas `speaker_entity` (repli Hermes,
            # introspection, feedback intermédiaire…). C'est CE chemin, pas
            # celui d'`orchestrator_speech.py`, qui est réellement emprunté
            # (`type: "tts_skipped"` renvoyé directement d'ici, jamais
            # `"tts_fallback"` — le repli côté orchestrator ne voit donc
            # jamais cette panne).
            entity_voice = resolve_elevenlabs_voice_id(speaker)
            if not entity_voice:
                logger.warning(
                    "TTS %s · speaker=%s · provider=none · reason=tts_unavailable_for_entity",
                    utterance_id,
                    speaker,
                )
                return {
                    "type": "tts_skipped",
                    "utterance_id": utterance_id,
                    "reason": "tts_unavailable_for_entity",
                    "speaker_entity": speaker,
                    "text": text,
                }

            live = ElevenLabsLive()
            if not live.enabled or not live._key:  # noqa: SLF001
                return self._fallback(utterance_id, text, reason, selection)

            wav = await live.synthesize(text, voice_id=entity_voice)
            if utterance_id in self._cancelled:
                self._cancelled.discard(utterance_id)
                return {
                    "type": "tts_skipped",
                    "utterance_id": utterance_id,
                    "reason": "cancelled",
                }
            logger.info(
                "TTS %s · speaker=%s · provider=ElevenLabs · cache=miss · voice_id=%s · %d o · cause=%s",
                utterance_id,
                speaker,
                entity_voice,
                len(wav),
                reason,
            )
            return {
                "type": "tts_audio",
                "utterance_id": utterance_id,
                "format": "wav",
                "audio_b64": base64.b64encode(wav).decode("ascii"),
                "bytes": len(wav),
                "text": text,
                "speaker_entity": speaker,
                "voice": selection.to_dict() if selection else {},
                "estimated_ms": _estimated_ms(text),
                "interruptible": True,
                "via": "elevenlabs",
                "provider": "elevenlabs",
                "voice_id": entity_voice,
            }
        except Exception as exc:  # noqa: BLE001
            logger.warning("ElevenLabs échoué (%s) · speaker=%s : %s", reason, speaker, exc)
            return self._fallback(utterance_id, text, reason, selection)

    def _fallback(
        self,
        utterance_id: str,
        text: str,
        reason: str,
        selection: VoiceSelection | None,
    ) -> dict[str, Any]:
        """Demande au HUD de parler avec SpeechSynthesis (ttsDev.ts)."""
        return {
            "type": "tts_fallback",
            "utterance_id": utterance_id,
            "text": text,
            "reason": reason,
            "detail": self.last_error,
            "language": selection.language if selection else "fr",
            "estimated_ms": _estimated_ms(text),
            "interruptible": True,
        }

    # -- barge-in / retour HUD ----------------------------------------------

    def cancel(self) -> dict[str, Any]:
        """Annule la phrase en cours (barge-in ou `stop_run`)."""
        current = self._active
        if current:
            self._cancelled.add(current)
            # Borne mémoire : on ne garde que les annulations récentes.
            if len(self._cancelled) > 32:
                self._cancelled = set(list(self._cancelled)[-16:])
        self._active = None
        return {"type": "tts_cancel", "utterance_id": current}

    def on_playback(self, phase: str, utterance_id: str | None) -> dict[str, Any]:
        """Le HUD signale le vrai début/fin du son."""
        if phase == "end":
            if utterance_id is None or utterance_id == self._active:
                self._active = None
            self._cancelled.discard(utterance_id or "")
        elif phase == "start" and utterance_id:
            self._active = utterance_id
        return {
            "type": "voice_playback",
            "phase": phase,
            "utterance_id": utterance_id,
            "speaking": self._active,
        }

    @property
    def speaking(self) -> bool:
        return self._active is not None

    # -- transcription -------------------------------------------------------

    async def transcribe(
        self,
        audio_b64: str,
        *,
        filename: str = "capture.webm",
        language: str | None = None,
    ) -> dict[str, Any]:
        """Base64 → texte. Ne lève jamais : le HUD garde `stt.ts` en secours."""
        try:
            audio = base64.b64decode(audio_b64, validate=True)
        except (ValueError, TypeError) as exc:
            return {"ok": False, "error": f"base64 invalide : {exc}"}
        if not audio:
            return {"ok": False, "error": "audio vide"}

        try:
            result = await self.client.transcribe(
                audio, filename=filename, language=language
            )
        except VoiceboxUnavailable as exc:
            self.available = False
            self.last_error = str(exc)
            self._last_probe = time.monotonic()
            return {"ok": False, "error": str(exc), "reason": "voicebox_unavailable"}
        except VoiceboxModelDownloading as exc:
            return {"ok": False, "error": str(exc), "reason": "model_downloading", "model": exc.model}
        except VoiceboxError as exc:
            return {"ok": False, "error": str(exc), "reason": "voicebox_error"}

        return {
            "ok": True,
            "text": str(result.get("text") or "").strip(),
            "duration": result.get("duration"),
        }
