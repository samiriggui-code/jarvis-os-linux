"""Pousse le TTS vers le satellite salon (Pi) — enceintes jack.

Le Core reste en loopback WS ; le Pi n'a pas besoin de se connecter en WebSocket.
Après chaque `tts_audio` diffusé, on POST le WAV vers `JARVIS_SALON_SPEAKER_URL`
si défini. Échec = log, jamais bloquant (le salon ne doit pas casser le Core).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any
from urllib import error, request

logger = logging.getLogger("jarvis.salon_speaker")

DEFAULT_TIMEOUT_S = 8.0


def salon_speaker_url() -> str | None:
    raw = (os.environ.get("JARVIS_SALON_SPEAKER_URL") or "").strip().rstrip("/")
    return raw or None


async def push_tts_to_salon(payload: dict[str, Any]) -> bool:
    """Envoie `audio_b64` au Pi. True si HTTP 2xx."""
    base = salon_speaker_url()
    if not base:
        return False
    if payload.get("type") != "tts_audio":
        return False
    b64 = payload.get("audio_b64")
    if not b64:
        return False

    url = f"{base}/v1/play.json"
    body = json.dumps({"audio_b64": b64, "text": payload.get("text") or ""}).encode("utf-8")

    def _post() -> bool:
        req = request.Request(
            url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with request.urlopen(req, timeout=DEFAULT_TIMEOUT_S) as resp:
                ok = 200 <= getattr(resp, "status", 200) < 300
                if ok:
                    logger.info("salon · WAV poussé (%s o)", payload.get("bytes") or "?")
                return ok
        except error.URLError as exc:
            logger.warning("salon injoignable · %s — %s", url, exc)
            return False
        except Exception as exc:  # noqa: BLE001
            logger.warning("salon lecture échouée · %s", exc)
            return False

    return await asyncio.to_thread(_post)
