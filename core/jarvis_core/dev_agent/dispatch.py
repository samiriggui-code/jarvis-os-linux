"""P5 — dispatch async dev.agent.run (accept rapide, lifecycle séparé)."""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, Callable

from ..device_dispatch import DeviceDispatchError, DeviceOfflineError, DeviceTimeoutError
from ..routing.router import CapabilityRouter, RouteContext
from ..workspace.registry import WorkspaceRegistry
from .registry import DevRunRecord, DevRunRegistry
from .types import (
    ALLOWED_DEV_AGENTS,
    CAPABILITY_DEV_AGENT_RUN,
    DevAgentRunParams,
    DevAgentRunResult,
    RunState,
)

logger = logging.getLogger("jarvis.dev_agent")

ACCEPT_TIMEOUT_S = 10.0
CANCEL_TIMEOUT_S = 5.0


class DevAgentDispatchError(Exception):
    def __init__(self, message: str, *, code: str = "dev_agent_error") -> None:
        super().__init__(message)
        self.code = code


class DevAgentDispatch:
    """Start / cancel / status — ne bloque pas sur la durée du run."""

    def __init__(
        self,
        connections: Any,
        registry: DevRunRegistry,
        workspaces: WorkspaceRegistry,
        router: CapabilityRouter,
        *,
        emit: Callable[[str, dict[str, Any], str], None] | None = None,
    ) -> None:
        self._connections = connections
        self._registry = registry
        self._workspaces = workspaces
        self._router = router
        self._emit = emit
        self._accept_pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._rpc_pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._watchers: dict[str, asyncio.Task[None]] = {}

    def complete_accept(self, request_id: str, payload: dict[str, Any]) -> bool:
        rid = str(request_id or "").strip()
        fut = self._accept_pending.pop(rid, None)
        if fut is None or fut.done():
            return False
        fut.set_result(dict(payload))
        return True

    def complete_rpc(self, request_id: str, payload: dict[str, Any]) -> bool:
        rid = str(request_id or "").strip()
        fut = self._rpc_pending.pop(rid, None)
        if fut is None or fut.done():
            return False
        fut.set_result(dict(payload))
        return True

    def on_device_disconnect(self, device_id: str) -> None:
        device_id = str(device_id or "").strip()
        if not device_id:
            return
        self._registry.mark_unknown_for_device(device_id)
        for rid, fut in list(self._accept_pending.items()):
            if not fut.done():
                fut.set_exception(DeviceOfflineError(device_id))
            self._accept_pending.pop(rid, None)
        for rid, fut in list(self._rpc_pending.items()):
            if not fut.done():
                fut.set_exception(DeviceOfflineError(device_id))
            self._rpc_pending.pop(rid, None)
        for run_id, task in list(self._watchers.items()):
            rec = self._registry.get(run_id)
            if rec and rec.device_id == device_id:
                task.cancel()
                self._watchers.pop(run_id, None)

    async def start_run(
        self,
        params: DevAgentRunParams,
        policy: dict[str, Any],
        *,
        request_id: str | None = None,
    ) -> DevRunRecord:
        agent = str(params.agent or "").strip().lower()
        if agent not in ALLOWED_DEV_AGENTS:
            raise DevAgentDispatchError(
                f"agent hors allowlist : {agent}",
                code="agent_not_allowed",
            )

        if not policy.get("granted", False):
            raise DevAgentDispatchError(
                "policy.granted=false",
                code="policy_denied",
            )

        workspace = self._workspaces.get(params.workspace_id)
        if workspace is None:
            raise DevAgentDispatchError(
                f"workspace inconnu : {params.workspace_id}",
                code="workspace_not_found",
            )

        ctx = RouteContext(capability_id=CAPABILITY_DEV_AGENT_RUN)
        route = self._router.resolve_dev_agent_device(ctx, agent=agent, workspace=workspace)
        if route.rejected or not route.device_id:
            code = "workspace_device_offline"
            if route.reason == "dev_agent_capability_missing":
                code = "dev_agent_capability_missing"
            elif route.reason == "workspace_not_on_device":
                code = "workspace_not_on_device"
            raise DevAgentDispatchError(
                route.reason,
                code=code,
            )

        device_id = route.device_id
        ws = self._connections.ws_for_device(device_id)
        if ws is None:
            raise DevAgentDispatchError(
                f"Agent hors ligne : {device_id}",
                code="device_offline",
            )

        run_id = str(uuid.uuid4())
        req_id = str(request_id or uuid.uuid4())
        rec = self._registry.create_pending(
            request_id=req_id,
            device_id=device_id,
            workspace_id=params.workspace_id,
            agent=agent,
            timeout_s=float(params.timeout_s),
            mission_dev_id=params.mission_dev_id,
            step_id=params.step_id,
            run_id=run_id,
        )

        exec_params = params.to_params_dict()
        exec_params["run_id"] = run_id
        core_path = str(workspace.local_path or "").strip()
        if core_path:
            exec_params["local_path"] = core_path
        elif exec_params.get("local_path") in (None, ""):
            exec_params.pop("local_path", None)

        loop = asyncio.get_running_loop()
        fut: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._accept_pending[req_id] = fut

        message = {
            "type": "device.execute",
            "request_id": req_id,
            "device_id": device_id,
            "capability_id": CAPABILITY_DEV_AGENT_RUN,
            "intent": "dev.agent.run",
            "params": exec_params,
            "policy": dict(policy),
            "timeout_ms": int(ACCEPT_TIMEOUT_S * 1000),
        }
        try:
            await ws.send(json.dumps(message))
        except Exception as exc:  # noqa: BLE001
            self._accept_pending.pop(req_id, None)
            rec.touch(state=RunState.FAILED)
            rec.error_code = "device_offline"
            rec.error_message = str(exc)
            raise DevAgentDispatchError(str(exc), code="device_offline") from exc

        try:
            accept_payload = await asyncio.wait_for(fut, timeout=ACCEPT_TIMEOUT_S)
        except asyncio.TimeoutError as exc:
            self._accept_pending.pop(req_id, None)
            rec.touch(state=RunState.FAILED)
            rec.error_code = "accept_timeout"
            raise DevAgentDispatchError("accept timeout", code="accept_timeout") from exc
        except DeviceOfflineError as exc:
            rec.touch(state=RunState.FAILED)
            rec.error_code = "device_offline"
            raise DevAgentDispatchError(str(exc), code="device_offline") from exc

        if not accept_payload.get("ok", False):
            code = str(accept_payload.get("error_code") or "start_rejected")
            rec.touch(state=RunState.FAILED)
            rec.error_code = code
            rec.error_message = str(
                accept_payload.get("error") or accept_payload.get("summary") or code
            )
            raise DevAgentDispatchError(rec.error_message or code, code=code)

        inner = accept_payload.get("result") if isinstance(accept_payload.get("result"), dict) else {}
        agent_run_id = str(inner.get("run_id") or run_id)
        if agent_run_id != run_id:
            # Agent doit renvoyer le run_id du Core
            rec.run_id = agent_run_id
            self._registry._runs[agent_run_id] = rec  # noqa: SLF001
            self._registry._runs.pop(run_id, None)  # noqa: SLF001

        state_raw = str(inner.get("state") or RunState.ACCEPTED.value)
        try:
            state = RunState(state_raw)
        except ValueError:
            state = RunState.ACCEPTED
        rec.touch(state=state if state != RunState.PENDING else RunState.ACCEPTED)

        self._publish("device.run.status", rec.to_status_dict())
        self._start_timeout_watcher(rec)
        return rec

    async def cancel_run(self, run_id: str) -> dict[str, Any]:
        rec = self._registry.get(run_id)
        if rec is None:
            return {"ok": False, "error_code": "run_not_found", "run_id": run_id}
        if rec.is_terminal():
            return {"ok": True, "run_id": run_id, "state": rec.state.value, "already_terminal": True}

        ws = self._connections.ws_for_device(rec.device_id)
        if ws is None:
            return {"ok": False, "error_code": "device_offline", "run_id": run_id}

        req_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._rpc_pending[req_id] = fut
        message = {
            "type": "device.run.cancel",
            "request_id": req_id,
            "run_id": rec.run_id,
            "device_id": rec.device_id,
        }
        try:
            await ws.send(json.dumps(message))
        except Exception as exc:  # noqa: BLE001
            self._rpc_pending.pop(req_id, None)
            return {"ok": False, "error_code": "device_offline", "error": str(exc)}

        try:
            reply = await asyncio.wait_for(fut, timeout=CANCEL_TIMEOUT_S)
        except asyncio.TimeoutError:
            self._rpc_pending.pop(req_id, None)
            return {"ok": False, "error_code": "cancel_timeout", "run_id": run_id}

        if reply.get("ok"):
            try:
                rec.touch(state=RunState(str(reply.get("state") or RunState.CANCELLED.value)))
            except ValueError:
                rec.touch(state=RunState.CANCELLED)
            self._publish("device.run.status", rec.to_status_dict())
        return reply

    def status(self, run_id: str) -> dict[str, Any]:
        rec = self._registry.get(run_id)
        if rec is None:
            return {"ok": False, "error_code": "run_not_found", "run_id": run_id}
        return {"ok": True, **rec.to_status_dict()}

    def on_progress(self, data: dict[str, Any]) -> bool:
        run_id = str(data.get("run_id") or "")
        rec = self._registry.get(run_id)
        if rec is None:
            return False
        entry = {
            "run_id": run_id,
            "phase": str(data.get("phase") or ""),
            "message": str(data.get("message") or ""),
            "sequence": int(data.get("sequence") or len(rec.progress) + 1),
        }
        rec.progress.append(entry)
        if rec.state in (RunState.ACCEPTED, RunState.PENDING):
            rec.touch(state=RunState.RUNNING)
        else:
            rec.touch()
        self._publish("device.run.progress", {**entry, "device_id": rec.device_id, "state": rec.state.value})
        return True

    def on_completed(self, data: dict[str, Any]) -> bool:
        run_id = str(data.get("run_id") or "")
        rec = self._registry.get(run_id)
        if rec is None:
            return False
        result_raw = data.get("result") if isinstance(data.get("result"), dict) else data
        rec.result = DevAgentRunResult.from_dict(
            {
                **result_raw,
                "run_id": run_id,
                "agent": rec.agent,
                "device_id": rec.device_id,
                "workspace_id": rec.workspace_id,
            }
        )
        rec.touch(state=RunState.COMPLETED)
        self._stop_watcher(run_id)
        self._publish("device.run.completed", rec.to_status_dict())
        return True

    def on_failed(self, data: dict[str, Any]) -> bool:
        run_id = str(data.get("run_id") or "")
        rec = self._registry.get(run_id)
        if rec is None:
            return False
        rec.error_code = str(data.get("error_code") or "run_failed")
        rec.error_message = str(data.get("error_message") or data.get("error") or "")
        state_raw = str(data.get("state") or RunState.FAILED.value)
        try:
            state = RunState(state_raw)
        except ValueError:
            state = RunState.FAILED
        rec.touch(state=state)
        self._stop_watcher(run_id)
        self._publish("device.run.failed", rec.to_status_dict())
        return True

    def on_cancel_result(self, data: dict[str, Any]) -> bool:
        req_id = str(data.get("request_id") or "")
        if req_id:
            return self.complete_rpc(req_id, data)
        run_id = str(data.get("run_id") or "")
        rec = self._registry.get(run_id)
        if rec and data.get("ok"):
            rec.touch(state=RunState.CANCELLED)
        return bool(req_id)

    def on_status_result(self, data: dict[str, Any]) -> bool:
        req_id = str(data.get("request_id") or "")
        if req_id:
            return self.complete_rpc(req_id, data)
        return False

    def build_policy_payload(
        self,
        *,
        granted: bool,
        role: str,
        user_id: str,
        operations: frozenset[str],
    ) -> dict[str, Any]:
        return {
            "granted": granted,
            "role": role,
            "user_id": user_id,
            "operations": sorted(operations),
        }

    def _start_timeout_watcher(self, rec: DevRunRecord) -> None:
        run_id = rec.run_id
        if run_id in self._watchers:
            return

        async def _watch() -> None:
            deadline = rec.started_at + rec.timeout_s
            while time.time() < deadline:
                await asyncio.sleep(0.25)
                current = self._registry.get(run_id)
                if current is None or current.is_terminal():
                    return
            current = self._registry.get(run_id)
            if current and not current.is_terminal():
                current.touch(state=RunState.TIMEOUT)
                current.error_code = "timeout"
                current.error_message = f"Run expiré après {current.timeout_s}s"
                self._publish("device.run.failed", current.to_status_dict())

        try:
            loop = asyncio.get_running_loop()
            self._watchers[run_id] = loop.create_task(_watch())
        except RuntimeError:
            pass

    def _stop_watcher(self, run_id: str) -> None:
        task = self._watchers.pop(run_id, None)
        if task and not task.done():
            task.cancel()

    def _publish(self, kind: str, payload: dict[str, Any]) -> None:
        if self._emit is None:
            return
        try:
            self._emit(kind, {"type": kind, **payload}, "core")
        except Exception:  # noqa: BLE001
            logger.debug("emit %s failed", kind, exc_info=True)
