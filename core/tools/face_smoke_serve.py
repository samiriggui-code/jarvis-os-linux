#!/usr/bin/env python3
"""Serveur visuel face smoke — webcam + overlay + Core WS + cache vocal local.

Usage (depuis core/) :
  # Terminal 1
  python -m jarvis_core

  # Terminal 2
  python tools/face_smoke_serve.py

Ouvre http://127.0.0.1:8770/face_vault.html
  TTS local : http://127.0.0.1:8770/tts/face_scan_prompt
"""
from __future__ import annotations

import argparse
import http.server
import json
import random
import socket
import threading
import webbrowser
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
CORE = TOOLS.parent
CACHE_ROOT = CORE / "data" / "voice" / "cache"
DEFAULT_PORT = 8770
PAGES = {
    "smoke": "face_smoke.html",
    "vault": "face_vault.html",
}


def _cache_voice_name() -> str:
    try:
        import yaml

        cfg_path = CORE / "data" / "voice" / "cache_config.yaml"
        cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
        el = cfg.get("elevenlabs") or {}
        return str(el.get("voice_name") or el.get("voice_id") or "jarvis2")
    except Exception:
        return "jarvis2"


def _tts_path(event: str) -> Path | None:
    root = CACHE_ROOT / _cache_voice_name()
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        return None
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    entries = [e for e in data.get("entries") or [] if e.get("event") == event]
    if not entries:
        return None
    pick = random.choice(entries)
    path = root / str(pick["file"])
    return path if path.is_file() else None


class _Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(TOOLS), **kwargs)

    def do_GET(self) -> None:
        if self.path.startswith("/tts/"):
            event = self.path[5:].split("?", 1)[0]
            if event.endswith(".wav"):
                event = event[:-4]
            event = event.strip("/")
            if not event:
                self.send_error(400, "event requis")
                return
            wav = _tts_path(event)
            if wav is None:
                self.send_error(404, f"clip absent: {event}")
                return
            data = wav.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            print(f"[face_smoke] TTS {event} ({len(data)} o)")
            return
        super().do_GET()

    def log_message(self, fmt: str, *args) -> None:
        if self.path.startswith("/tts/"):
            return
        print(f"[face_smoke] {self.address_string()} {fmt % args}")


def _port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Serveur HTML face smoke")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument(
        "--page",
        choices=tuple(PAGES.keys()),
        default="smoke",
        help="Page a ouvrir (smoke=test technique, vault=mission enroll/unlock)",
    )
    args = parser.parse_args()

    port = args.port
    if not _port_free(port):
        raise SystemExit(f"Port {port} occupé — utilise --port")

    voice = _cache_voice_name()
    page = PAGES[args.page]
    url = f"http://127.0.0.1:{port}/{page}"
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), _Handler)

    print("JARVIS Face Tools")
    print(f"  Cam test: http://127.0.0.1:{port}/cam_test.html")
    print(f"  Smoke   : http://127.0.0.1:{port}/face_smoke.html")
    print(f"  Vault   : http://127.0.0.1:{port}/face_vault.html")
    print(f"  TTS     : http://127.0.0.1:{port}/tts/<event>  (cache {voice})")
    print(f"  Core    : ws://127.0.0.1:8765")
    print("  Ctrl+C pour arrêter")

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt serveur.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
