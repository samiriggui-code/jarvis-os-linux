#!/usr/bin/env python3
"""jarvis-cam — flux MJPEG de la caméra salon pour Freebox / navigateur.

GET http://192.168.1.27:8768/           → page minimale + <img>
GET http://192.168.1.27:8768/stream.mjpg → multipart MJPEG (ffmpeg → stdout)

Freebox Player Android : navigateur → http://192.168.1.27:8768/
"""
from __future__ import annotations

import argparse
import logging
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

logger = logging.getLogger("jarvis.cam")

DEFAULT_HOST = os.environ.get("JARVIS_CAM_HOST", "0.0.0.0")
DEFAULT_PORT = int(os.environ.get("JARVIS_CAM_PORT", "8768"))
DEFAULT_DEVICE = os.environ.get("JARVIS_CAM_DEVICE", "/dev/video0")
DEFAULT_SIZE = os.environ.get("JARVIS_CAM_SIZE", "1280x720")
DEFAULT_FPS = os.environ.get("JARVIS_CAM_FPS", "15")

PAGE = """<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JARVIS Salon</title>
<style>
html,body{margin:0;background:#000;height:100%;overflow:hidden}
img{width:100%;height:100%;object-fit:contain;display:block}
</style></head>
<body><img src="/stream.mjpg" alt="salon"></body></html>
"""


class CamBroker:
    """Un seul ffmpeg ; plusieurs clients lisent le même flux MJPEG."""

    def __init__(self, device: str, size: str, fps: str) -> None:
        self.device = device
        self.size = size
        self.fps = fps
        self._proc: subprocess.Popen[bytes] | None = None
        self._clients: list = []
        self._lock = threading.Lock()
        self._reader: threading.Thread | None = None

    def ensure(self) -> None:
        with self._lock:
            if self._proc and self._proc.poll() is None:
                return
            cmd = [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "v4l2",
                "-input_format",
                "yuyv422",
                "-video_size",
                self.size,
                "-framerate",
                self.fps,
                "-i",
                self.device,
                "-f",
                "mjpeg",
                "-q:v",
                "5",
                "-",
            ]
            logger.info("ffmpeg %s", " ".join(cmd))
            self._proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
            self._reader = threading.Thread(target=self._pump, daemon=True)
            self._reader.start()

    def _pump(self) -> None:
        assert self._proc and self._proc.stdout
        buf = b""
        while self._proc.poll() is None:
            chunk = self._proc.stdout.read(4096)
            if not chunk:
                break
            buf += chunk
            # Découpe sur SOI JPEG (FF D8) pour ne pas saturer.
            while True:
                start = buf.find(b"\xff\xd8")
                if start < 0:
                    buf = buf[-2:] if len(buf) > 2 else buf
                    break
                end = buf.find(b"\xff\xd9", start + 2)
                if end < 0:
                    buf = buf[start:]
                    break
                frame = buf[start : end + 2]
                buf = buf[end + 2 :]
                with self._lock:
                    dead = []
                    for q in self._clients:
                        try:
                            q.append(frame)
                            if len(q) > 3:
                                q.pop(0)
                        except Exception:
                            dead.append(q)
                    for q in dead:
                        if q in self._clients:
                            self._clients.remove(q)
        logger.warning("ffmpeg arrêté")

    def subscribe(self) -> list:
        self.ensure()
        q: list = []
        with self._lock:
            self._clients.append(q)
        return q

    def unsubscribe(self, q: list) -> None:
        with self._lock:
            if q in self._clients:
                self._clients.remove(q)


BROKER: CamBroker | None = None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        logger.info("%s - %s", self.address_string(), fmt % args)

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            raw = PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        if path in ("/health",):
            raw = b'{"ok":true,"role":"salon-cam"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        if path not in ("/stream.mjpg", "/stream.mjpeg"):
            self.send_error(404)
            return

        assert BROKER is not None
        q = BROKER.subscribe()
        try:
            self.send_response(200)
            self.send_header(
                "Content-Type", "multipart/x-mixed-replace; boundary=frame"
            )
            self.send_header("Cache-Control", "no-cache, no-store")
            self.send_header("Pragma", "no-cache")
            self.end_headers()
            while True:
                if not q:
                    import time

                    time.sleep(0.05)
                    continue
                frame = q.pop(0)
                self.wfile.write(b"--frame\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(frame)}\r\n\r\n".encode())
                self.wfile.write(frame)
                self.wfile.write(b"\r\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            BROKER.unsubscribe(q)


def main() -> None:
    global BROKER
    parser = argparse.ArgumentParser(description="JARVIS cam — salon Pi")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--device", default=DEFAULT_DEVICE)
    parser.add_argument("--size", default=DEFAULT_SIZE)
    parser.add_argument("--fps", default=DEFAULT_FPS)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
    BROKER = CamBroker(args.device, args.size, args.fps)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    logger.info("cam http://%s:%s/ · %s %s@%sfps", args.host, args.port, args.device, args.size, args.fps)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("arrêt")


if __name__ == "__main__":
    main()
