"""Caméra salon via satellite Pi (VLC sur Freebox).

Le streaming Netflix/Disney passe par Home Assistant (``media.streaming``).
Ce module ne sert qu'à afficher le flux MJPEG sur la télé via jarvis-ear.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any
from urllib import error, request

logger = logging.getLogger("jarvis.salon_camera")

DEFAULT_TIMEOUT_S = 20.0


def salon_ear_url() -> str | None:
    raw = (os.environ.get("JARVIS_SALON_SPEAKER_URL") or "").strip().rstrip("/")
    return raw or None


def salon_token() -> str:
    return (os.environ.get("JARVIS_SALON_TOKEN") or "").strip()


def camera_configured() -> bool:
    return bool(salon_ear_url())


async def _player_exec(action: str, **kwargs: Any) -> dict[str, Any]:
    base = salon_ear_url()
    if not base:
        return {"ok": False, "error": "JARVIS_SALON_SPEAKER_URL absent"}

    body_obj: dict[str, Any] = {"action": action, **kwargs}
    body = json.dumps(body_obj).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    token = salon_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = f"{base}/v1/player.json"

    def _post() -> dict[str, Any]:
        req = request.Request(url, data=body, method="POST", headers=headers)
        try:
            with request.urlopen(req, timeout=DEFAULT_TIMEOUT_S) as resp:
                raw = resp.read()
                try:
                    data = json.loads(raw.decode("utf-8"))
                except json.JSONDecodeError:
                    return {"ok": False, "error": "réponse Pi illisible"}
                if not isinstance(data, dict):
                    return {"ok": False, "error": "réponse Pi invalide"}
                return data
        except error.URLError as exc:
            logger.warning("Pi injoignable · %s — %s", url, exc)
            return {"ok": False, "error": f"pi injoignable: {exc}"}
        except Exception as exc:  # noqa: BLE001
            logger.warning("Pi player échoué · %s", exc)
            return {"ok": False, "error": str(exc)}

    return await asyncio.to_thread(_post)


async def show_salon_camera() -> dict[str, Any]:
    cam = (
        os.environ.get("JARVIS_SALON_CAM_URL") or "http://192.168.1.27:8768/stream.mjpg"
    ).strip()
    return await _player_exec("view_url", url=cam, app="vlc")
