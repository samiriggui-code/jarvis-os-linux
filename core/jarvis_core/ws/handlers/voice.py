"""Phase 2 — handlers WS."""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


class VoiceHandlerMixin:

    async def handle_voice(self, ws: Any, data: dict[str, Any]) -> None:
        """Events type=voice — TTS voicebox, barge-in, retour de lecture (§3.4)."""
        from ...auth.profiles import resolve_user_id

        action = str(data.get("action", "status"))

        # Cache vocal (dialogues YAML) — indépendant de voicebox.
        if action == "say_event":
            event = str(data.get("event") or "").strip()
            if not event:
                await ws.send(json.dumps({"type": "voice_error", "error": "event requis pour say_event"}))
                return
            user_id = resolve_user_id(
                str(data.get("user_id") or data.get("userId") or "") or None,
                self._session_user_id(),
            )
            bindings = data.get("bindings")
            if bindings is not None and not isinstance(bindings, dict):
                bindings = None
            ev = await self.say(
                event,
                ws,
                user_id=user_id,
                bindings=bindings,
                user_role=data.get("user_role"),
                address=data.get("address"),
            )
            if ev is None:
                await ws.send(json.dumps({
                    "type": "voice_error",
                    "error": f"événement vocal inconnu ou cache absent : {event}",
                }))
            return

        # Enrôlement phrase — disque seulement, pas voicebox.
        if action == "enroll_phrase":
            from ...auth.db import default_data_dir
            from ...auth.voice_phrase import DEFAULT_CHALLENGE, normalize_phrase, save_phrase

            uid = resolve_user_id(
                str(data.get("user_id") or data.get("userId") or "") or None,
                self._session_user_id(),
            )
            target = str(data.get("user_id") or uid or "").strip()
            samples_raw = data.get("samples") or data.get("phrases") or []
            if not target:
                await ws.send(json.dumps({"type": "VOICE_FAILED", "reason": "user_id_required"}))
                return
            if not isinstance(samples_raw, list) or not samples_raw:
                await ws.send(json.dumps({"type": "VOICE_FAILED", "reason": "samples_required"}))
                return
            samples = [str(s) for s in samples_raw]
            phrase = normalize_phrase(DEFAULT_CHALLENGE)
            users_dir = default_data_dir() / "users"
            saved = save_phrase(users_dir, target, phrase=phrase, samples=samples)
            if self.auth is not None:
                try:
                    self.auth.users.mark_biometrics(target, voice=True)
                except Exception:  # noqa: BLE001
                    logger.exception("voice_enrolled flag")
            try:
                self.sequences.signal("enroll.voice")
            except Exception:  # noqa: BLE001
                pass
            await ws.send(json.dumps({"type": "VOICE_ENROLL_OK", "user_id": target, **saved}))
            return

        # Auth phrase — STT texte ou audio ; pas voicebox pour verify_phrase_text.
        if action in ("verify_phrase_text", "verify_phrase"):
            from ...auth.db import default_data_dir
            from ...auth.voice_phrase import (
                DEFAULT_CHALLENGE,
                list_voice_candidates,
                match_users,
            )

            users_dir = default_data_dir() / "users"
            hint = str(data.get("username_hint") or data.get("username") or "").strip()
            role_filter = str(data.get("role_filter") or "").strip().upper()

            if action == "verify_phrase_text":
                text = str(data.get("text") or "").strip()
                if not text:
                    await ws.send(json.dumps({
                        "type": "VOICE_FAILED",
                        "reason": "no_speech",
                        "challenge": DEFAULT_CHALLENGE,
                    }))
                    return
            else:
                if self.voice is None:
                    await ws.send(json.dumps({"type": "voice_error", "error": "voice_module_unavailable"}))
                    return
                result = await self.voice.transcribe(
                    str(data.get("audio_b64") or ""),
                    filename=str(data.get("filename") or "capture.webm"),
                    language=data.get("language") or "fr",
                )
                text = str(result.get("text") or "").strip()
                if not result.get("ok") or not text:
                    logger.info("verify_phrase · no_speech · err=%s", result.get("error"))
                    await ws.send(json.dumps({
                        "type": "VOICE_FAILED",
                        "reason": "no_speech",
                        "error": result.get("error"),
                        "challenge": DEFAULT_CHALLENGE,
                    }))
                    return

            self.sequences.signal("voice.captured")
            auth_pool = list(self.auth.users.list_users()) if self.auth is not None else None
            candidates = list_voice_candidates(users_dir, auth_pool)
            if role_filter and candidates:
                candidates = [
                    c for c in candidates
                    if str(c.get("role") or "").upper() == role_filter
                ]
            hit = match_users(users_dir, text, candidates, username_hint=hint) if candidates else None
            if not hit:
                logger.info("verify_phrase · no_match · entendu=« %s » · users=%d", text, len(candidates))
                await ws.send(json.dumps({
                    "type": "VOICE_FAILED",
                    "reason": "no_match" if candidates else "no_profiles",
                    "text": text,
                    "challenge": DEFAULT_CHALLENGE,
                }))
                return

            matched_id = str(hit.get("user_id") or "")
            conf = float(hit.get("confidence") or 0.9)
            logger.info(
                "verify_phrase · ok · user=%s · conf=%.2f · entendu=« %s »",
                hit.get("username"), conf, text,
            )
            if self.auth is not None and matched_id:
                self.auth.attest_biometric(matched_id, "voice", conf)
            self.sequences.signal("voice.matched")
            await ws.send(json.dumps({
                "type": "VOICE_SUCCESS",
                "user_id": matched_id,
                "username": hit.get("username"),
                "confidence": conf,
                "text": text,
            }))
            return

        if self.voice is None:
            await ws.send(json.dumps({"type": "voice_error", "error": "voice_module_unavailable"}))
            return

        user_id = resolve_user_id(
            str(data.get("user_id") or data.get("userId") or "") or None,
            self._session_user_id(),
        )

        if action == "status":
            payload: dict[str, Any] = {"type": "voice_status", **self.voice.status()}
            if bool(data.get("probe")):
                payload["available"] = await self.voice.probe()
                payload.update(self.voice.status())
            if payload.get("available"):
                try:
                    payload["profiles"] = [
                        {"id": p.get("id"), "name": p.get("name")}
                        for p in await self.voice.client.profiles(refresh=True)
                    ]
                except Exception as exc:  # noqa: BLE001 — le status ne doit pas échouer
                    payload["profiles_error"] = str(exc)
            from ...voice import resolve_voice

            payload["resolved"] = resolve_voice(user_id).to_dict()
            await ws.send(json.dumps(payload))
            return

        if action == "speak":
            ev = await self.speak(
                str(data.get("text") or ""),
                user_id=user_id,
                language=data.get("language"),
                preset=data.get("preset") or data.get("voicePreset"),
            )
            await ws.send(json.dumps(ev))
            return

        if action in ("cancel", "stop"):
            await ws.send(json.dumps(self.voice.cancel()))
            await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))
            return

        if action == "playback":
            phase = str(data.get("phase", "end"))
            ev = self.voice.on_playback(phase, data.get("utterance_id"))
            await ws.send(json.dumps(ev))
            if phase == "end" and not self.voice.speaking:
                await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))
            return

        if action == "transcribe":
            result = await self.voice.transcribe(
                str(data.get("audio_b64") or ""),
                filename=str(data.get("filename") or "capture.webm"),
                language=data.get("language"),
            )
            # Voix captée et transcrite : fait réel. On exige du TEXTE, pas
            # seulement un `ok` — une transcription vide veut dire que
            # personne n'a parlé, et la séquence ne doit pas avancer dessus.
            if result.get("ok") and (result.get("text") or "").strip():
                self.sequences.signal("voice.captured")
                self.sequences.signal("enroll.voice")
            await ws.send(json.dumps({"type": "voice_transcript", **result}))
            return

        if action == "save_profile":
            from ...voice import save_voice_profile

            patch = data.get("voice")
            if not isinstance(patch, dict):
                await ws.send(json.dumps({"type": "voice_error", "error": "voice requis"}))
                return
            saved = save_voice_profile(user_id, patch)
            # ⚠ NE PAS poser `voice_enrolled` ici.
            #
            # `save_profile` enregistre un PRESET TTS : le timbre que JARVIS
            # emploie pour PARLER à cette personne. Ça n'a rien à voir avec
            # une empreinte vocale permettant de LA RECONNAÎTRE.
            #
            # Le drapeau était mis ici, si bien que choisir une voix de
            # synthèse faisait afficher « biométrie vocale : enrôlée » sur le
            # profil. Un drapeau de sécurité qui ment est pire que pas de
            # drapeau du tout : il sera lu comme une garantie.
            #
            # Phrase d'accès (`enroll_phrase`) ou speaker-ID futur seulement.
            await ws.send(json.dumps({"type": "voice_profile_saved", **saved}))
            return

        await ws.send(json.dumps({"type": "voice_error", "error": f"action inconnue: {action}"}))
