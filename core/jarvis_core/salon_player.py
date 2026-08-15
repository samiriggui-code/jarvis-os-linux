"""Pilotage Freebox Player (Android) via le satellite Pi.

Le Core décide (intentions / Policy) ; le Pi exécute `adb` en LAN salon
(`192.168.1.49:5555`). Aucun shell libre — actions allowlistées.

  Core → POST {JARVIS_SALON_SPEAKER_URL}/v1/player.json
       → jarvis-ear → adb am start / monkey
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any
from urllib import error, request
from urllib.parse import quote

logger = logging.getLogger("jarvis.salon_player")

DEFAULT_TIMEOUT_S = 20.0

# Aligné sur deploy/pi-salon/jarvis_ear.py (packages Freebox POP).
APPS: dict[str, dict[str, str]] = {
    "netflix": {
        "package": "com.netflix.ninja",
        "search": "https://www.netflix.com/search?q={q}",
    },
    "youtube": {
        "package": "com.google.android.youtube.tv",
        "search": "https://www.youtube.com/results?search_query={q}",
    },
    "disney": {
        "package": "com.disney.disneyplus",
        "search": "https://www.disneyplus.com/search?q={q}",
    },
    "prime": {
        "package": "com.amazon.amazonvideo.livingroom",
        "search": "https://www.primevideo.com/search/ref=atv_sr_sug?ie=UTF8&phrase={q}",
    },
    "plex": {
        "package": "com.plexapp.android",
        "search": "",
    },
    "vlc": {
        "package": "org.videolan.vlc",
        "search": "",
    },
    "browser": {
        "package": "com.phlox.tvwebbrowser",
        "search": "https://www.google.com/search?q={q}",
    },
    "chrome": {
        "package": "com.android.chrome",
        "search": "https://www.google.com/search?q={q}",
    },
}


def salon_player_url() -> str | None:
    """Même base que le jack — jarvis-ear expose aussi /v1/player.json."""
    raw = (os.environ.get("JARVIS_SALON_SPEAKER_URL") or "").strip().rstrip("/")
    return raw or None


def salon_token() -> str:
    return (os.environ.get("JARVIS_SALON_TOKEN") or "").strip()


def player_configured() -> bool:
    return bool(salon_player_url())


async def player_exec(action: str, **kwargs: Any) -> dict[str, Any]:
    """Envoie une action allowlistée au Pi. Ne lève pas."""
    base = salon_player_url()
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
            logger.warning("player Pi injoignable · %s — %s", url, exc)
            return {"ok": False, "error": f"pi injoignable: {exc}"}
        except Exception as exc:  # noqa: BLE001
            logger.warning("player Pi échoué · %s", exc)
            return {"ok": False, "error": str(exc)}

    result = await asyncio.to_thread(_post)
    if result.get("ok"):
        logger.info("salon player · %s ok", action)
    else:
        logger.warning("salon player · %s · %s", action, result.get("error"))
    return result


async def open_url(url: str, *, app: str | None = None) -> dict[str, Any]:
    kwargs: dict[str, Any] = {"url": url}
    if app:
        kwargs["app"] = app
    return await player_exec("view_url", **kwargs)


async def launch_app(app: str) -> dict[str, Any]:
    return await player_exec("launch", app=app)


async def search_app(app: str, query: str) -> dict[str, Any]:
    """Ouvre une URL de recherche dans l'app TV, ou lance l'app seule."""
    meta = APPS.get(app)
    if not meta:
        return {"ok": False, "error": f"app inconnue: {app}"}
    q = (query or "").strip()
    if meta.get("search") and q:
        url = meta["search"].format(q=quote(q))
        return await open_url(url, app=app)
    return await launch_app(app)


async def show_salon_camera() -> dict[str, Any]:
    cam = (
        os.environ.get("JARVIS_SALON_CAM_URL") or "http://192.168.1.27:8768/stream.mjpg"
    ).strip()
    return await open_url(cam, app="vlc")


async def google_on_player(query: str) -> dict[str, Any]:
    """Recherche Google dans TV Bro (ou Chrome si présent)."""
    q = (query or "").strip() or "actualité"
    url = f"https://www.google.com/search?q={quote(q)}"
    # Chrome d'abord si le Pi le connaît ; sinon browser=TV Bro.
    chrome = await open_url(url, app="chrome")
    if chrome.get("ok"):
        return chrome
    return await open_url(url, app="browser")
