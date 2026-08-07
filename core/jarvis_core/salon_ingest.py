"""Ingest HTTP des utterances du satellite salon (Pi → Core).

Symétrique de `salon_speaker` : le Pi n'ouvre pas de WebSocket. Il POST un WAV
après détection de parole ; le Core transcrit puis enchaîne `handle_user_chat`.
La réponse parlée repart déjà vers le jack via `salon_speaker`.

Écoute loopback (`127.0.0.1:8766`) — nginx proxifie `/v1/salon/` et
`/v1/devices/` depuis le LAN.

Phase Device 0 : les routes `/v1/devices/*` délèguent à `DeviceRegistry`
(lecture / annonce, pas d'action).
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import TYPE_CHECKING, Any, Awaitable, Callable

if TYPE_CHECKING:
    from .devices import DeviceRegistry

logger = logging.getLogger("jarvis.salon_ingest")

DEFAULT_HOST = os.environ.get("JARVIS_SALON_INGEST_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.environ.get("JARVIS_SALON_INGEST_PORT", "8766"))

UtteranceHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


def salon_token() -> str:
    return (os.environ.get("JARVIS_SALON_TOKEN") or "").strip()


class _Handler(BaseHTTPRequestHandler):
    loop: asyncio.AbstractEventLoop | None = None
    on_utterance: UtteranceHandler | None = None
    devices: DeviceRegistry | None = None

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        logger.info("%s - %s", self.address_string(), fmt % args)

    def _json(self, code: int, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _authorized(self) -> bool:
        expected = salon_token()
        if not expected:
            return True
        auth = self.headers.get("Authorization") or ""
        if auth.startswith("Bearer ") and auth[7:].strip() == expected:
            return True
        return (self.headers.get("X-Jarvis-Salon-Token") or "").strip() == expected

    def _read_json_body(self) -> dict[str, Any] | None:
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        if not body:
            return {}
        try:
            data = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, dict) else None

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path.rstrip("/") in ("/health", "/v1/salon/health"):
            self._json(200, {"ok": True, "role": "salon-ingest"})
            return
        if path.startswith("/v1/devices"):
            if self.devices is None:
                self._json(503, {"ok": False, "error": "devices not ready"})
                return
            if not self._authorized():
                self._json(401, {"ok": False, "error": "unauthorized"})
                return
            result = self.devices.handle_http("GET", path, None)
            code = 200 if result.get("ok", True) else (404 if result.get("error") == "not found" else 400)
            self._json(code, result)
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._authorized():
            self._json(401, {"ok": False, "error": "unauthorized"})
            return
        path = self.path.split("?", 1)[0]

        if path.startswith("/v1/devices"):
            if self.devices is None:
                self._json(503, {"ok": False, "error": "devices not ready"})
                return
            data = self._read_json_body()
            if data is None:
                self._json(400, {"ok": False, "error": "json invalide"})
                return
            result = self.devices.handle_http("POST", path, data)
            code = 200 if result.get("ok") else 400
            self._json(code, result)
            return

        path_norm = path.rstrip("/")
        if path_norm not in ("/v1/salon/utterance", "/v1/salon/utterance.json"):
            self._json(404, {"ok": False, "error": "not found"})
            return
        if self.loop is None or self.on_utterance is None:
            self._json(503, {"ok": False, "error": "ingest not ready"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        try:
            data = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "error": "json invalide"})
            return
        if not isinstance(data, dict):
            data = {}

        b64 = data.get("audio_b64") or ""
        if not b64 and body and self.headers.get("Content-Type", "").startswith("audio/"):
            b64 = base64.b64encode(body).decode("ascii")
            data = {
                "audio_b64": b64,
                "filename": data.get("filename") or "salon.wav",
            }

        fut = asyncio.run_coroutine_threadsafe(self.on_utterance(data), self.loop)
        try:
            result = fut.result(timeout=90)
        except Exception as exc:  # noqa: BLE001
            logger.exception("utterance salon échouée")
            self._json(500, {"ok": False, "error": str(exc)})
            return
        self._json(200, result if isinstance(result, dict) else {"ok": True})


def start_salon_ingest(
    loop: asyncio.AbstractEventLoop,
    on_utterance: UtteranceHandler,
    *,
    devices: DeviceRegistry | None = None,
    host: str | None = None,
    port: int | None = None,
) -> ThreadingHTTPServer:
    """Démarre le serveur HTTP dans un thread daemon. Retourne le serveur."""
    _Handler.loop = loop
    _Handler.on_utterance = on_utterance
    _Handler.devices = devices
    bind_host = host if host is not None else DEFAULT_HOST
    bind_port = port if port is not None else DEFAULT_PORT
    server = ThreadingHTTPServer((bind_host, bind_port), _Handler)
    thread = threading.Thread(target=server.serve_forever, name="salon-ingest", daemon=True)
    thread.start()
    logger.info(
        "salon ingest · http://%s:%s/v1/salon/ · devices=%s",
        bind_host,
        bind_port,
        "on" if devices is not None else "off",
    )
    return server
