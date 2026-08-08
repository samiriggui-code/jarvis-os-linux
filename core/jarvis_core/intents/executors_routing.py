"""Phase 6 — routing intentions (Policy → Router → exécutant unique)."""
from __future__ import annotations

import json
import logging
import time
from typing import Any

logger = logging.getLogger("jarvis.core")


class IntentRoutingMixin:

    async def _open_intent(self, ws: Any, cap: Any, prompt: str = "") -> None:
        """Ouvre une intention — clic tuile, phrase voix ou chat : même chemin."""
        from ..capabilities import allows

        role = self._session_role(ws)
        base = {"type": "surface_error", "ok": False, "app": cap.app_id, "intent": cap.intent}

        if not allows(cap, role):
            logger.info("intention REFUSÉE (rôle) · %s · rôle=%s", cap.intent, role)
            await ws.send(json.dumps({**base, "reason": "Réservé à l'administrateur."}))
            return

        if not cap.available:
            await ws.send(
                json.dumps(
                    {**base, "reason": cap.note or "Aucun exécutant pour cette intention."}
                )
            )
            return

        decision = self.policy.evaluate(action=cap.intent, risk=cap.risk)

        if not decision.allowed and not decision.needs_confirmation:
            await ws.send(json.dumps({**base, "reason": decision.reason}))
            return

        if decision.needs_confirmation:
            approval_id, event = self.surfaces.open_approval(
                intent=cap.intent,
                gravity=cap.risk.name.lower(),
                reason=decision.reason or "Confirmation requise.",
                surface_id="apps",
            )
            if prompt:
                self._pending_prompts[approval_id] = prompt
            logger.info(
                "intention EN ATTENTE · %s · approval=%s — %s",
                cap.intent, approval_id, decision.reason,
            )
            await self.broadcast(event)
            await ws.send(
                json.dumps(
                    {
                        "type": "surface_result",
                        "ok": True,
                        "app": cap.app_id,
                        "intent": cap.intent,
                        "pending": approval_id,
                    }
                )
            )
            return

        logger.info("intention AUTORISÉE · %s (%s)", cap.intent, cap.risk.name.lower())
        await self._execute_intent(
            ws,
            cap.intent,
            {
                "surface_id": "apps",
                "app": cap.app_id,
                "prompt": prompt,
                "intent": cap.intent,
            },
        )

    async def _execute_intent(
        self,
        ws: Any,
        intent: str,
        payload: dict[str, Any],
        *,
        granted: bool | None = None,
    ) -> None:
        from ..capabilities import Owner, for_intent
        from ..routing.host_gate import resolve_execution_host
        from ..routing.router import RouteResult
        from ..surface import IntentNotExecutable
        from ..tool_events import ToolEvent, record_tool_event, timeline_payload

        base: dict[str, Any] = {"type": "surface_result", "intent": intent}
        if granted is not None:
            base["granted"] = granted

        cap = for_intent(intent)
        role = self._session_role(ws)
        user_id = self._session_user_id(ws)
        started = time.monotonic()

        ctx = self._route_context(ws)
        exec_payload = dict(payload)
        route_meta: dict[str, Any] = {}

        from ..executors.device import DEVICE_INTENT_APPS

        if cap and cap.owner is Owner.DEVICE:
            app_id = str(payload.get("app_id") or DEVICE_INTENT_APPS.get(intent) or "")
            host_route = self.router.resolve_launch_device(ctx, app_id)
            tool_route = (
                RouteResult(host_route.device_id, "device_host")
                if host_route.device_id
                else self.router.resolve_tool_device(ctx, owner="device")
            )
        else:
            host_route = resolve_execution_host(self.router, ctx, intent)
            tool_route = self.router.resolve_tool_device(
                ctx, owner=cap.owner.value if cap else "core"
            )

        route_meta["tool_device_id"] = tool_route.device_id
        route_meta["route_reason"] = tool_route.reason
        route_meta["host_device_id"] = host_route.device_id
        route_meta["host_route_reason"] = host_route.reason
        if host_route.rejected:
            reason = (
                f"Capacité indisponible — "
                f"aucun satellite en ligne ne la possède "
                f"({', '.join(host_route.missing) or intent})."
            )
            fields = dict(
                intent=intent,
                stage="failed",
                owner=cap.owner.value if cap else "?",
                toolset=cap.toolset if cap else None,
                risk=int(cap.risk) if cap else 0,
                operation=cap.operation.value if cap else None,
                role=role,
                user_id=user_id,
                duration_ms=0.0,
                reason=reason,
                device_id=tool_route.device_id,
            )
            te = ToolEvent(**fields)
            await self.broadcast(timeline_payload(te, route=route_meta))
            record_tool_event(te)
            await ws.send(
                json.dumps(
                    {
                        **base,
                        "ok": False,
                        "executed": False,
                        "reason": reason,
                        "route": route_meta,
                    }
                )
            )
            return
        exec_payload["host_device_id"] = host_route.device_id

        self._bind_output_route(ws)
        self._intent_ws = ws
        try:

            async def _emit(
                stage: str,
                *,
                reason: str | None = None,
                duration_ms: float | None = None,
            ) -> None:
                fields = dict(
                    intent=intent,
                    stage=stage,
                    owner=cap.owner.value if cap else "?",
                    toolset=cap.toolset if cap else None,
                    risk=int(cap.risk) if cap else 0,
                    operation=cap.operation.value if cap else None,
                    role=role,
                    user_id=user_id,
                    duration_ms=duration_ms,
                    reason=reason,
                    device_id=host_route.device_id or tool_route.device_id,
                )
                te = ToolEvent(**fields)
                route = route_meta if stage in ("failed", "completed", "not_executable") else None
                await self.broadcast(timeline_payload(te, route=route))
                record_tool_event(te)

            await _emit("started")

            try:
                result = await self.intents.execute(intent, exec_payload)
            except IntentNotExecutable as exc:
                logger.error("intention NON EXÉCUTÉE · %s — %s", intent, exc)
                await _emit(
                    "not_executable",
                    reason=str(exc),
                    duration_ms=(time.monotonic() - started) * 1000,
                )
                await ws.send(
                    json.dumps(
                        {
                            **base,
                            "ok": False,
                            "executed": False,
                            "reason": str(exc),
                            "known_actions": self.intents.actions,
                            "route": route_meta,
                        }
                    )
                )
                return
            except Exception as exc:  # noqa: BLE001
                logger.exception("intention EN ÉCHEC · %s", intent)
                await _emit(
                    "failed",
                    reason=str(exc),
                    duration_ms=(time.monotonic() - started) * 1000,
                )
                if intent == "web.search" and cap and cap.owner is Owner.HERMES:
                    await self._fallback_web_surface(
                        ws,
                        str(payload.get("prompt") or ""),
                        reason=str(exc),
                    )
                    return
                await ws.send(
                    json.dumps(
                        {
                            **base,
                            "ok": False,
                            "executed": True,
                            "reason": f"échec : {exc}",
                            "route": route_meta,
                        }
                    )
                )
                return

            logger.info(
                "intention EXÉCUTÉE · %s · device=%s",
                intent,
                tool_route.device_id,
            )
            await _emit("completed", duration_ms=(time.monotonic() - started) * 1000)
            await self._maybe_publish_surface_decision(
                intent=intent,
                debounce_key=f"intent:{intent}",
            )
            await ws.send(
                json.dumps(
                    {
                        **base,
                        "ok": True,
                        "executed": True,
                        "route": route_meta,
                        "result": (
                            result
                            if isinstance(
                                result, (str, int, float, bool, list, dict, type(None))
                            )
                            else str(result)
                        ),
                    }
                )
            )
            await self._deliver_chat_result(ws, intent, result, payload)
        finally:
            self._intent_ws = None
            self._clear_output_route()

    async def _deliver_chat_result(
        self,
        ws: Any,
        intent: str,
        result: Any,
        payload: dict[str, Any],
    ) -> None:
        """TTS + chat_reply pour entrées voix/chat — Hermes uniquement (Core parle déjà)."""
        from ..capabilities import Owner, for_intent

        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            return
        cap = for_intent(intent)
        if cap is None or cap.owner is not Owner.HERMES:
            return
        if not isinstance(result, dict):
            return
        text = (result.get("text") or "").strip() or "C'est fait."
        uid = self._session_user_id(ws) or "local"
        await ws.send(json.dumps(self.cmd("set_orb_state", state="speaking")))
        await ws.send(json.dumps({"type": "chat_reply", "text": text, "intent": intent}))
        ev = await self.speak(text, user_id=uid)
        await ws.send(json.dumps(ev))
        if ev.get("type") == "tts_skipped":
            await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))

    async def _fallback_web_surface(self, ws: Any, text: str, *, reason: str = "") -> None:
        from urllib.parse import quote

        q = text.strip()[:200] or "actualité"
        low = q.lower()
        wants_img = any(
            w in low
            for w in ("photo", "photos", "image", "images", "cliché", "cliches", "visuel")
        )
        if wants_img:
            url = "https://www.google.com/search?tbm=isch&q=" + quote(q)
            title = "Recherche images"
        else:
            url = "https://www.google.com/search?q=" + quote(q)
            title = "Recherche web"

        timed_out = "délai sse" in reason.lower() or "timeout" in reason.lower()
        if timed_out:
            body = (
                "La recherche Hermes a dépassé le délai autorisé. "
                "Voici Google en secours — résultats aussi dans cette surface."
            )
            spoken = (
                "La recherche prend trop de temps. "
                "J'ouvre Google à la place."
            )
        else:
            body = (
                "Hermes n'est pas disponible pour le moment. "
                "Voici le lien Google — résultats aussi dans cette surface."
            )
            spoken = "Hermes est indisponible. J'ouvre la recherche sur Google."
        await self._publish_result_surface(
            "reach",
            title=title,
            body=body,
            source="web.search.fallback",
            items=[url],
        )
        await self.broadcast({
            "type": "hud_command",
            "action": "open_external",
            "url": url,
        })
        await ws.send(json.dumps({
            "type": "chat_reply",
            "text": spoken,
            "intent": "web.search",
        }))
        await ws.send(json.dumps(self.cmd("set_orb_state", state="speaking")))
        self._bind_output_route(ws)
        try:
            ev = await self.speak(
                spoken, user_id=self._session_user_id(ws) or "local"
            )
            await ws.send(json.dumps(ev))
            if ev.get("type") == "tts_skipped":
                await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))
        finally:
            self._clear_output_route()
