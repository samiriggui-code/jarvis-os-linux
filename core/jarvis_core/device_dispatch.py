"""DeviceDispatch — Core → agent WS (P4 milestone 1).

Envoie ``device.execute`` sur le WebSocket de l'agent et attend
``device.execute_result`` corrélé par ``request_id``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from typing import Any

logger = logging.getLogger("jarvis.device_dispatch")

DEFAULT_TIMEOUT_S = float(os.environ.get("JARVIS_DEVICE_EXECUTE_TIMEOUT_S", "30"))


class DeviceDispatchError(Exception):
    """Erreur dispatch agent."""

    def __init__(self, message: str, *, code: str = "dispatch_failed") -> None:
        super().__init__(message)
        self.code = code


class DeviceOfflineError(DeviceDispatchError):
    def __init__(self, device_id: str) -> None:
        super().__init__(f"Agent hors ligne : {device_id}", code="device_offline")
        self.device_id = device_id


class DeviceTimeoutError(DeviceDispatchError):
    def __init__(self, request_id: str) -> None:
        super().__init__(f"Timeout agent · {request_id}", code="timeout")
        self.request_id = request_id


class DeviceDispatch:
    def __init__(self, connections: Any) -> None:
        self._connections = connections
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}

    def complete(self, request_id: str, payload: dict[str, Any]) -> bool:
        """Appelé par le handler WS à réception de ``device.execute_result``."""
        rid = str(request_id or "").strip()
        if not rid:
            return False
        fut = self._pending.pop(rid, None)
        if fut is None or fut.done():
            return False
        fut.set_result(dict(payload))
        return True

    def cancel_for_device(self, device_id: str) -> None:
        """Agent déconnecté — rejette les requêtes en attente."""
        device_id = str(device_id or "").strip()
        if not device_id:
            return
        to_drop = [
            rid
            for rid, fut in list(self._pending.items())
            if not fut.done() and rid  # fut ne porte pas device_id — annule tout si besoin
        ]
        for rid in to_drop:
            fut = self._pending.pop(rid, None)
            if fut and not fut.done():
                fut.set_exception(
                    DeviceOfflineError(device_id)
                )

    async def execute(
        self,
        *,
        device_id: str,
        capability_id: str,
        intent: str,
        params: dict[str, Any],
        policy: dict[str, Any],
        timeout_s: float | None = None,
    ) -> dict[str, Any]:
        device_id = str(device_id or "").strip()
        if not device_id:
            raise DeviceDispatchError("device_id requis", code="invalid_request")

        ws = self._connections.ws_for_device(device_id)
        if ws is None:
            raise DeviceOfflineError(device_id)

        request_id = str(uuid.uuid4())
        timeout = float(timeout_s if timeout_s is not None else DEFAULT_TIMEOUT_S)
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending[request_id] = fut

        message = {
            "type": "device.execute",
            "request_id": request_id,
            "device_id": device_id,
            "capability_id": capability_id,
            "intent": intent,
            "params": dict(params),
            "policy": dict(policy),
            "timeout_ms": int(timeout * 1000),
        }
        started = time.monotonic()
        logger.info(
            "device.execute · %s · %s · app=%s",
            device_id,
            intent,
            params.get("app_id"),
        )
        try:
            await ws.send(json.dumps(message))
        except Exception as exc:  # noqa: BLE001
            self._pending.pop(request_id, None)
            raise DeviceOfflineError(device_id) from exc

        try:
            result = await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError as exc:
            self._pending.pop(request_id, None)
            raise DeviceTimeoutError(request_id) from exc

        result.setdefault("duration_ms", int((time.monotonic() - started) * 1000))
        result.setdefault("request_id", request_id)
        result.setdefault("device_id", device_id)
        if not result.get("ok", False):
            code = str(result.get("error_code") or "launch_failed")
            raise DeviceDispatchError(
                str(result.get("error") or result.get("summary") or code),
                code=code,
            )
        return result
