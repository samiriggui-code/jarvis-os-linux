"""Handler WS type=perception — snapshots objet + tracks Worker (≠ holomat)."""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


class PerceptionHandlerMixin:

    async def handle_perception(self, ws: Any, data: dict[str, Any]) -> None:
        """Ingress perception objet — jamais routé vers FaceEngine."""
        action = str(data.get("action") or "snapshot").strip().lower()

        if action in ("detections", "scene", "tracks"):
            await self._handle_perception_detections(ws, data)
            return

        if action != "snapshot":
            await ws.send(
                json.dumps(
                    {
                        "type": "perception_error",
                        "ok": False,
                        "error": f"action inconnue : {action}",
                    }
                )
            )
            return

        request_id = str(data.get("request_id") or "").strip()
        if not request_id:
            await ws.send(
                json.dumps(
                    {"type": "perception_error", "ok": False, "error": "request_id manquant"}
                )
            )
            return

        if data.get("ok") is False:
            accepted = self.perception.complete(
                request_id,
                {"ok": False, "error": str(data.get("error") or "capture_refused")},
            )
            await ws.send(
                json.dumps(
                    {
                        "type": "perception_ack",
                        "ok": accepted,
                        "request_id": request_id,
                    }
                )
            )
            return

        jpeg_b64 = str(data.get("jpeg_b64") or "").strip()
        if not jpeg_b64:
            await ws.send(
                json.dumps(
                    {
                        "type": "perception_error",
                        "ok": False,
                        "error": "jpeg_b64 manquant",
                        "request_id": request_id,
                    }
                )
            )
            return

        accepted = self.perception.complete(
            request_id,
            {
                "ok": True,
                "jpeg_b64": jpeg_b64,
                "bytes": len(jpeg_b64) * 3 // 4,
            },
        )
        logger.info(
            "perception · snapshot reçu · %s · ~%d o",
            request_id[:12],
            len(jpeg_b64) * 3 // 4,
        )
        await ws.send(
            json.dumps(
                {
                    "type": "perception_ack",
                    "ok": accepted,
                    "request_id": request_id,
                }
            )
        )

    async def _handle_perception_detections(self, ws: Any, data: dict[str, Any]) -> None:
        """Tracks Vision Worker → SceneStore → bus VISION_OBJECT_*."""
        from ...vision_objects import ingest_perception_frame

        scene = getattr(self, "scene", None)
        if scene is None:
            await ws.send(
                json.dumps(
                    {
                        "type": "perception_error",
                        "ok": False,
                        "error": "scene store indisponible",
                    }
                )
            )
            return

        snap = ingest_perception_frame(scene, self.emit, data)
        logger.debug(
            "perception · detections · source=%s · count=%d",
            snap.get("source"),
            snap.get("count"),
        )
        await ws.send(
            json.dumps(
                {
                    "type": "perception_ack",
                    "ok": True,
                    "action": "detections",
                    "count": snap.get("count", 0),
                }
            )
        )
