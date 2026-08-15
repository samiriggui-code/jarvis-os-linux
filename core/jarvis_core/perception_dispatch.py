"""PerceptionDispatch — Core demande un snapshot HUD, attend type:perception.

Contrat séparé de holomat/face_frame : le HUD capte, le Core décide, Hermes
analyse si configuré. Aucune inference dans la boucle asyncio du Core.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from typing import Any

logger = logging.getLogger("jarvis.perception")

DEFAULT_TIMEOUT_S = float(os.environ.get("JARVIS_PERCEPTION_TIMEOUT_S", "12"))


class PerceptionError(RuntimeError):
    """Snapshot perception indisponible."""


class PerceptionTimeout(PerceptionError):
    def __init__(self, request_id: str) -> None:
        super().__init__(f"Timeout snapshot perception · {request_id}")
        self.request_id = request_id


class PerceptionDispatch:
    """Attente corrélée request_id ↔ jpeg_b64 du HUD."""

    def __init__(self) -> None:
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}

    def complete(self, request_id: str, payload: dict[str, Any]) -> bool:
        rid = str(request_id or "").strip()
        if not rid:
            return False
        fut = self._pending.pop(rid, None)
        if fut is None or fut.done():
            return False
        fut.set_result(dict(payload))
        return True

    def cancel_all(self, *, reason: str = "cancelled") -> None:
        for rid, fut in list(self._pending.items()):
            if fut.done():
                continue
            fut.set_exception(PerceptionError(reason))
            self._pending.pop(rid, None)

    async def request_snapshot(self, broadcast: Any, *, timeout: float | None = None) -> dict[str, Any]:
        """Diffuse capture_perception et attend le JPEG."""
        request_id = uuid.uuid4().hex
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending[request_id] = fut

        await broadcast(
            {
                "type": "hud_command",
                "action": "capture_perception",
                "request_id": request_id,
            }
        )
        logger.info("perception · demande snapshot · %s", request_id[:12])

        try:
            result = await asyncio.wait_for(fut, timeout=timeout or DEFAULT_TIMEOUT_S)
        except asyncio.TimeoutError as exc:
            self._pending.pop(request_id, None)
            raise PerceptionTimeout(request_id) from exc

        if not result.get("ok", True):
            raise PerceptionError(str(result.get("error") or "snapshot refusé"))
        jpeg = str(result.get("jpeg_b64") or "").strip()
        if not jpeg:
            raise PerceptionError("jpeg_b64 manquant")
        result["request_id"] = request_id
        return result
