"""Panneau config local agent Windows — http://127.0.0.1:9780 (habillage glass plus tard)."""

from __future__ import annotations

import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger("jarvis.win.panel")

ROOT = Path(__file__).resolve().parent
PANEL_HTML = ROOT / "panel.html"
DEFAULT_PORT = int(os.environ.get("JARVIS_AGENT_PANEL_PORT", "9780"))
AGENT_VERSION = os.environ.get("JARVIS_AGENT_VERSION", "0.4.0-windows")

_server: ThreadingHTTPServer | None = None
_thread: threading.Thread | None = None


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        logger.debug("%s - %s", self.address_string(), fmt % args)

    def _json(self, code: int, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        if not body:
            return {}
        data = json.loads(body.decode("utf-8"))
        return data if isinstance(data, dict) else {}

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/api/status":
            from status import build_status

            include = urlparse(self.path).query.find("probes=1") >= 0
            self._json(200, build_status(agent_version=AGENT_VERSION, include_probes=include))
            return
        if path == "/api/config":
            from config import load_env_file

            self._json(200, {"ok": True, "config": load_env_file()})
            return
        if path in ("/", "/panel", "/panel.html"):
            if not PANEL_HTML.is_file():
                self._json(404, {"ok": False, "error": "panel.html absent"})
                return
            raw = PANEL_HTML.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path.rstrip("/")
        try:
            body = self._read_json()
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "error": "json invalide"})
            return

        if path == "/api/config":
            from status import save_config

            self._json(200, save_config(body))
            return
        if path == "/api/discover":
            from status import run_discover_save

            self._json(200, run_discover_save())
            return
        if path == "/api/probe":
            from discover import probe_all

            self._json(200, {"ok": True, "probes": probe_all()})
            return
        self._json(404, {"ok": False, "error": "not found"})


def panel_url(port: int | None = None) -> str:
    p = port or DEFAULT_PORT
    return f"http://127.0.0.1:{p}/"


def start_panel(*, port: int | None = None, host: str = "127.0.0.1") -> str:
    global _server, _thread
    if _server is not None:
        return panel_url(port or DEFAULT_PORT)

    p = port or DEFAULT_PORT
    _server = ThreadingHTTPServer((host, p), _Handler)
    _thread = threading.Thread(target=_server.serve_forever, name="jarvis-panel", daemon=True)
    _thread.start()
    url = panel_url(p)
    logger.info("panneau config · %s", url)
    return url


def stop_panel() -> None:
    global _server, _thread
    if _server is not None:
        _server.shutdown()
        _server = None
    _thread = None


def main() -> int:
    import argparse

    logging.basicConfig(level=logging.INFO, format="[panel] %(message)s")
    parser = argparse.ArgumentParser(description="Panneau config agent JARVIS")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    url = start_panel(port=args.port)
    print(url)
    print("Ctrl+C pour quitter")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        stop_panel()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
