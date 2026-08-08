"""Exécutants Owner.DEVICE — dispatch vers agent local (P4)."""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("jarvis.core")

# Milestone P4 — Cursor via agent Windows local.
DEVICE_INTENT_APPS: dict[str, str] = {
    "core.cursor": "cursor",
}


class DeviceExecutorsMixin:
    async def _execute_device_intent(self, cap: Any, payload: dict[str, Any]) -> dict[str, Any]:
        from ..device_dispatch import DeviceDispatchError, DeviceOfflineError, DeviceTimeoutError
        from ..surface import IntentNotExecutable

        app_id = str(payload.get("app_id") or DEVICE_INTENT_APPS.get(cap.intent) or "").strip()
        ws = getattr(self, "_intent_ws", None)
        if not app_id:
            from ..device_software import match_software_app

            origin = self.connections.device_for(ws) if ws is not None else None
            prompt = str(payload.get("prompt") or "")
            _, matched = match_software_app(
                self.devices, prompt, device_id=origin
            )
            if matched:
                app_id = matched
        if not app_id:
            raise IntentNotExecutable(f"Aucun app_id pour {cap.intent}")

        ctx = self._route_context(ws, capability_id="app.launch")
        route = self.router.resolve_launch_device(ctx, app_id)
        if route.rejected or not route.device_id:
            missing = ", ".join(route.missing) or app_id
            raise IntentNotExecutable(
                f"Aucun agent en ligne pour {app_id} ({route.reason}; manque: {missing})"
            )

        role = self._session_role(ws)
        user_id = self._session_user_id(ws) or "local"
        decision = self.policy.evaluate(
            action=cap.intent,
            risk=cap.risk,
            operation=cap.operation,
        )
        policy_payload = {
            "granted": bool(decision.allowed and not decision.needs_confirmation),
            "role": role or "user",
            "user_id": user_id,
            "risk": cap.risk.name.lower(),
            "operation": cap.operation.value,
        }

        try:
            result = await self.device_dispatch.execute(
                device_id=route.device_id,
                capability_id="app.launch",
                intent=cap.intent,
                params={"app_id": app_id},
                policy=policy_payload,
            )
        except DeviceOfflineError as exc:
            raise IntentNotExecutable(str(exc)) from exc
        except DeviceTimeoutError as exc:
            raise IntentNotExecutable(str(exc)) from exc
        except DeviceDispatchError as exc:
            return {
                "ok": False,
                "intent": cap.intent,
                "app_id": app_id,
                "device_id": route.device_id,
                "error_code": exc.code,
                "reason": str(exc),
            }

        logger.info(
            "device intent OK · %s · %s · device=%s",
            cap.intent,
            app_id,
            route.device_id,
        )
        summary = result.get("summary") or f"{app_id} lancé"
        body_result = {
            "ok": True,
            "intent": cap.intent,
            "app_id": app_id,
            "device_id": route.device_id,
            "route_reason": route.reason,
            "summary": summary,
            "result": result.get("result") or {},
            "request_id": result.get("request_id"),
        }
        if cap.intent == "core.cursor":
            from ..surfaces.publisher import publish_result_surface

            pid = (body_result.get("result") or {}).get("pid")
            items = [f"Machine · {route.device_id}"]
            if pid:
                items.append(f"PID · {pid}")
            await publish_result_surface(
                self,
                "cursor",
                title="Cursor",
                body=summary,
                source="core.cursor",
                items=items,
            )
            spoken = "J'ouvre Cursor sur votre machine."
        elif cap.intent == "device.app_launch":
            from ..surfaces.publisher import publish_result_surface

            display = (body_result.get("result") or {}).get("display_name") or app_id
            await publish_result_surface(
                self,
                "connexions",
                title="Application",
                body=summary,
                source="device.app_launch",
                items=[f"{display} · {route.device_id}"],
            )
            spoken = f"J'ouvre {display}."
        else:
            spoken = ""

        if spoken:
            await self.broadcast(await self.speak(spoken, user_id=user_id))
        return body_result
