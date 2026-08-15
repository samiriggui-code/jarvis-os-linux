"""Phase 2 — handlers WS."""
from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger("jarvis.core")

from ...policy import RiskLevel
from ...ws.routes import _SalonNullWs


class ChatHandlerMixin:

    async def handle_salon_utterance(self, data: dict[str, Any]) -> dict[str, Any]:
        """WAV du Pi → STT → même pipeline chat que le HUD (sans client WS)."""
        b64 = str(data.get("audio_b64") or "")
        filename = str(data.get("filename") or "salon.wav")
        if not b64:
            return {"ok": False, "error": "audio_b64 manquant"}
        if self.voice is None:
            return {"ok": False, "error": "voice module unavailable"}

        result = await self.voice.transcribe(
            b64, filename=filename, language=data.get("language") or "fr"
        )
        text = (result.get("text") or "").strip() if result.get("ok") else ""
        if not text:
            return {
                "ok": bool(result.get("ok")),
                "text": "",
                "error": result.get("error") or "silence",
                "reason": result.get("reason"),
            }

        # Garde anti-télé : wake Pi (`woken=true`) OU « Jarvis » dans la phrase.
        woken = data.get("woken") is True
        has_name = bool(re.search(r"\b(hey\s+)?jarvis\b", text, flags=re.I))
        if not woken and not has_name:
            logger.info("salon IGNORÉ (pas de wake) · « %s »", text[:48])
            return {"ok": True, "text": text, "ignored": True, "reason": "no_wake"}

        logger.info("salon · « %s »", text[:80])
        sink = _SalonNullWs()
        # Réponse audio → device qui a parlé (discovery `audio.output`).
        self._salon_turn = True
        self._tts_output_device_id = str(
            data.get("device_id") or data.get("deviceId") or "pi-salon"
        ).strip() or "pi-salon"
        try:
            await self.handle_user_chat(sink, text)
        finally:
            self._salon_turn = False
            self._tts_output_device_id = None
        return {"ok": True, "text": text}
    async def handle_user_chat(self, ws: Any, text: str) -> None:
        self._bind_output_route(ws)
        try:
            await self._handle_user_chat_body(ws, text)
        finally:
            self._clear_output_route()

    async def _handle_user_chat_body(self, ws: Any, text: str) -> None:
        from ...auth.profiles import load_hud_preferences, resolve_user_id, save_hud_preferences
        from ...capabilities import match_intent
        from ...locale import resolve_reply_language, system_prompt_language
        from ...personality import LLMCallMode, PersonalityRequest, SpeakerEntity, resolve_personality

        # ── Commande avant conversation ──────────────────────────────────────
        #
        # « Jarvis, allume le salon » partait droit dans la complétion, évaluée
        # `action="chat", risk=INFO`. La phrase était donc jugée au risque d'une
        # question, alors qu'elle demande d'agir sur la maison. Aucune lampe ne
        # s'allumait — mais le jour où le pont a existé, c'est ce chemin-là qui
        # aurait contourné la Policy.
        #
        # Une phrase reconnue emprunte maintenant EXACTEMENT le chemin d'un clic
        # sur la tuile, à son vrai niveau de risque. `match_intent` refuse de
        # deviner en cas d'ambiguïté : dans le doute, la phrase reste une
        # conversation, ce qui est le repli sûr.

        # Écho micro de nos propres phrases de lock/veille (STT pendant TTS).
        _echo = " ".join(text.lower().replace("'", " ").split())
        if any(
            marker in _echo
            for marker in (
                "verrouillage automatique",
                "inactivité détectée",
                "inactivite detectee",
                "mise en veille des systèmes",
                "mise en veille des systemes",
                "session verrouillée",
                "session verrouillee",
                "déconnexion effectuée",
                "deconnexion effectuee",
                "à bientôt",
                "a bientot",
            )
        ) and any(
            w in _echo
            for w in ("verrouill", "veille", "session", "déconnexion", "deconnexion", "bientôt", "bientot")
        ):
            logger.info("phrase IGNORÉE (écho TTS lock/veille) · « %s »", text[:48])
            return

        # Écho micro générique — le HUD n'a pas d'annulation d'écho acoustique
        # matérielle : sans ça, le micro réentend N'IMPORTE QUELLE parole de
        # JARVIS (annonces de boot comprises, pas seulement lock/veille
        # ci-dessus) et la re-transcrit comme une commande. Incident constaté
        # (2026-08-15) : « Noyau cognitif en ligne… » réentendu a interrompu
        # une séquence de boot en cours. Généralise le garde ci-dessus à tout
        # texte réellement parlé récemment (`orchestrator_speech.py`), sans
        # liste de phrases à maintenir à la main.
        if self.is_echo_of_recent_speech(text):
            logger.info("phrase IGNORÉE (écho TTS générique) · « %s »", text[:48])
            return

        if cap := match_intent(text):
            logger.info("phrase ROUTÉE · « %s » → %s", text[:48], cap.intent)
            await ws.send(json.dumps(self.cmd("set_orb_state", state="thinking")))
            await self._open_intent(ws, cap, text)
            return

        # Filet : « cherche / trouve / propose / nouvelles… » sans trigger exact
        # ne doit PAS tomber en chat nu OpenRouter (coquille vide).
        lowered = " " + " ".join(text.lower().replace("'", " ").split()) + " "
        research_words = (
            " cherche ", " trouve ", " propose ", " recherche ",
            " nouvelles ", " actualité ", " actualites ", " actualités ",
            " sur internet ", " sur le web ",
        )
        if any(w in lowered for w in research_words):
            from ...capabilities import CAPABILITIES

            cap = CAPABILITIES.get("reach")
            if cap is not None:
                logger.info("phrase FORCÉE web.search · « %s »", text[:48])
                await ws.send(json.dumps(self.cmd("set_orb_state", state="thinking")))
                await self._open_intent(ws, cap, text)
                return

        # Chat libre — défaut LLM (Provider Manager). Hermes si JARVIS_CHAT_PROVIDER=hermes.
        import os

        chat_provider = (os.environ.get("JARVIS_CHAT_PROVIDER") or "llm").strip().lower()
        if chat_provider == "hermes":
            from ...capabilities import CAPABILITIES

            cap = CAPABILITIES.get("outils")
            if cap is not None and cap.available:
                logger.info("chat libre → Hermes (skills) · « %s »", text[:48])
                await ws.send(json.dumps(self.cmd("set_orb_state", state="thinking")))
                await self._open_intent(ws, cap, text)
                return

        # Capability-aware semantic routing — Phase 2 (chantier « Orchestration
        # conversationnelle V1 »). match_intent() et le filet recherche ont déjà
        # eu leur chance de reconnaître un trigger exact ; ici on regarde si une
        # capacité JARVIS réellement disponible MAINTENANT répond quand même à
        # la phrase, avant de tomber en conversation générique. Borné : le
        # resolver ne peut choisir que parmi les capacités que la Phase 1 a
        # jugées disponibles (`capability_routing.build_candidates`), jamais en
        # inventer une — et la décision retombe dans le pipeline EXISTANT
        # (`_open_intent` → Policy → executor → Verification), jamais un second
        # orchestrateur.
        from ...capability_routing import resolve_semantic_route

        routing_context_note = ""
        role_for_routing = self._session_role(ws)
        routing = await resolve_semantic_route(text, orch=self, role=role_for_routing)
        if routing.action == "use_capability" and routing.capability:
            from ...capabilities import for_intent as _for_intent_routed

            routed_cap = _for_intent_routed(routing.capability)
            if routed_cap is not None:
                logger.info(
                    "phrase ROUTÉE (sémantique) · « %s » → %s · confiance=%.2f",
                    text[:48], routed_cap.intent, routing.confidence,
                )
                await ws.send(json.dumps(self.cmd("set_orb_state", state="thinking")))
                await self._open_intent(ws, routed_cap, text)
                return
        else:
            logger.info(
                "phrase NON ROUTÉE (sémantique) · « %s » → chat · %s",
                text[:48], routing.reason[:80],
            )
            routing_context_note = (
                " [Contexte système : les capacités JARVIS disponibles ont déjà "
                "été évaluées pour cette demande ; aucune n'était appropriée. Ne "
                "prétends jamais ignorer tes outils — dis simplement que tu n'as "
                "pas de fonction dédiée pour ça.]"
            )

        decision = self.policy.evaluate(action="chat", text=text, risk=RiskLevel.INFO)
        await ws.send(json.dumps(self.cmd("set_orb_state", state="thinking")))

        if not decision.allowed:
            refusal = decision.reason or "Action refusée par la Policy Engine."
            await ws.send(
                json.dumps(
                    self.cmd("display_notification", message=refusal, duration=4.0)
                )
            )
            ev = await self.speak(refusal, user_id=self._session_user_id(ws) or "local")
            await ws.send(json.dumps(ev))
            if ev.get("type") == "tts_skipped":
                await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))
            return

        uid = self._session_user_id(ws) or "local"
        prefs = load_hud_preferences(uid) or {}
        locale = prefs.get("locale") if isinstance(prefs.get("locale"), dict) else {}
        lang_res = resolve_reply_language(locale=locale, utterance=text)
        reply_lang = lang_res["language"]

        # Sticky « passe en anglais » → persist
        if lang_res.get("stickyUpdate"):
            next_locale = {
                **locale,
                "stickyLanguage": lang_res["stickyUpdate"],
                "mode": "sticky",
            }
            prefs = {**prefs, "locale": next_locale, "userId": resolve_user_id(uid)}
            save_hud_preferences(uid, prefs)

        await ws.send(json.dumps({
            "type": "locale_resolved",
            "user_id": uid,
            "language": reply_lang,
            "voicePreset": lang_res.get("voicePreset"),
            "detected": lang_res.get("detected"),
            "switchAck": bool(lang_res.get("switchAck")),
        }))

        say_ctx = self._say_context(ws)
        bindings = say_ctx.get("bindings") if isinstance(say_ctx.get("bindings"), dict) else {}
        personality = resolve_personality(
            PersonalityRequest(
                speaker=SpeakerEntity.JARVIS,
                user_role=self._session_role(ws),
                language=reply_lang,
                context=LLMCallMode.NARRATIVE,
                address=say_ctx.get("address"),
                title=bindings.get("titre"),
                user_name=bindings.get("user"),
            )
        )
        prompt = (
            f"{system_prompt_language(reply_lang)}{routing_context_note} "
            f"L'utilisateur dit : {text}"
        )
        reply = await self.providers.complete(
            prompt,
            call_mode=LLMCallMode.NARRATIVE,
            personality=personality,
        )
        logger.info(
            "chat libre · provider=%s · « %s » → %d car.",
            self.providers.current_mode(),
            text[:48],
            len(reply or ""),
        )
        await ws.send(json.dumps(self.cmd("set_orb_state", state="speaking")))
        await ws.send(
            json.dumps(self.cmd(
                "display_notification",
                message=reply,
                duration=5.0,
            ))
        )
        await ws.send(json.dumps({
            "type": "chat_reply",
            "text": reply,
            "language": reply_lang,
            "voicePreset": lang_res.get("voicePreset"),
        }))

        # TTS voicebox. L'orbe repasse en standby sur le vrai `voice/playback
        # end` renvoyé par le HUD — plus de sleep(0.4) à l'aveugle.
        ev = await self.speak(
            reply,
            user_id=uid,
            language=reply_lang,
            preset=lang_res.get("voicePreset"),
            speaker_entity=personality.speaker_entity.value,
            voice_instruct=personality.voice_instruct,
            voice_personality=personality.voice_personality,
        )
        await ws.send(json.dumps(ev))
        if ev.get("type") == "tts_skipped":
            await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))
    async def handle_chat(self, ws: Any, data: dict[str, Any]) -> None:
        if data.get("event") != "chat":
            return
        await self.handle_user_chat(ws, str(data.get("text", "")))
