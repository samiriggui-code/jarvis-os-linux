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
DEFAULT_MIC = os.environ.get("JARVIS_CAM_MIC", "plughw:CARD=Camera,DEV=0")

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

    def release_device(self) -> None:
        """Libère /dev/video0 pour le live A/V (un seul ffmpeg à la fois)."""
        with self._lock:
            proc = self._proc
            self._proc = None
            self._clients.clear()
        if proc is not None and proc.poll() is None:
            proc.kill()
            try:
                proc.wait(timeout=3)
            except Exception:
                pass
        logger.info("ffmpeg MJPEG relâché pour live A/V")

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

    def one_frame(self, timeout_s: float = 10.0) -> bytes | None:
        """Une image JPEG unique — s'abonne au flux déjà ouvert, prend la
        première frame, se désabonne. Ne lance pas un second ffmpeg."""
        import time as _time

        q = self.subscribe()
        deadline = _time.monotonic() + timeout_s
        try:
            while _time.monotonic() < deadline:
                if q:
                    return q[0]
                _time.sleep(0.02)
            return None
        finally:
            self.unsubscribe(q)


BROKER: CamBroker | None = None
AV_DEVICE = DEFAULT_DEVICE
AV_SIZE = DEFAULT_SIZE
AV_FPS = DEFAULT_FPS
AV_MIC = DEFAULT_MIC


def _ffmpeg_av(with_audio: bool) -> list[str]:
    """fMP4 fragmenté — Chrome <video> natif, image + son."""
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
        AV_SIZE,
        "-framerate",
        AV_FPS,
        "-i",
        AV_DEVICE,
    ]
    if with_audio and AV_MIC:
        cmd.extend(["-f", "alsa", "-thread_queue_size", "512", "-i", AV_MIC])
    cmd.extend(
        [
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-tune",
            "zerolatency",
            "-pix_fmt",
            "yuv420p",
            "-g",
            str(max(int(AV_FPS or "15"), 1)),
        ]
    )
    if with_audio and AV_MIC:
        cmd.extend(["-c:a", "aac", "-b:a", "64k", "-ac", "1", "-ar", "16000"])
    cmd.extend(
        [
            "-f",
            "mp4",
            "-movflags",
            "frag_keyframe+empty_moov+default_base_moof",
            "-",
        ]
    )
    return cmd


def _pause_ear(pause: bool) -> None:
    """Le micro USB est exclusif : jarvis-ear le tient. Pendant le live HUD on le libère."""
    action = "stop" if pause else "start"
    try:
        subprocess.run(
            ["systemctl", action, "jarvis-ear"],
            check=False,
            timeout=8,
            capture_output=True,
        )
        logger.info("jarvis-ear %s pour live A/V", action)
    except Exception as exc:  # noqa: BLE001
        logger.warning("jarvis-ear %s impossible · %s", action, exc)


def _pipe_av(wfile, with_audio: bool) -> bool:
    cmd = _ffmpeg_av(with_audio)
    logger.info("ffmpeg live %s", " ".join(cmd))
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdout is not None
    wrote = False
    try:
        while proc.poll() is None:
            chunk = proc.stdout.read(8192)
            if not chunk:
                break
            wfile.write(chunk)
            wfile.flush()
            wrote = True
    except (BrokenPipeError, ConnectionResetError):
        wrote = True
    finally:
        err = b""
        if proc.stderr:
            try:
                err = proc.stderr.read(2000)
            except Exception:
                pass
        proc.kill()
        try:
            proc.wait(timeout=2)
        except Exception:
            pass
        if err:
            logger.warning("ffmpeg live stderr: %s", err.decode("utf-8", errors="replace")[:500])
    return wrote


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
        if path in ("/snapshot.jpg", "/snapshot.jpeg"):
            assert BROKER is not None
            frame = BROKER.one_frame()
            if frame is None:
                self.send_error(503, "aucune frame disponible")
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(frame)))
            self.send_header("Cache-Control", "no-cache, no-store")
            self.end_headers()
            self.wfile.write(frame)
            return

        if path in ("/live.mp4", "/live"):
            assert BROKER is not None
            BROKER.release_device()
            _pause_ear(True)
            import time as _time
            _time.sleep(0.5)
            cmd = _ffmpeg_av(True)
            logger.info("ffmpeg live %s", " ".join(cmd))
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            assert proc.stdout is not None
            first = proc.stdout.read(8192)
            if not first:
                err = (proc.stderr.read(2000) if proc.stderr else b"")
                logger.warning(
                    "live A/V vide · %s",
                    err.decode("utf-8", errors="replace")[:500],
                )
                proc.kill()
                _pause_ear(False)
                BROKER.ensure()
                self.send_error(503, "live A/V indisponible")
                return
            try:
                self.send_response(200)
                self.send_header("Content-Type", "video/mp4")
                self.send_header("Cache-Control", "no-cache, no-store")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(first)
                self.wfile.flush()
                while proc.poll() is None:
                    chunk = proc.stdout.read(8192)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                proc.kill()
                try:
                    proc.wait(timeout=2)
                except Exception:
                    pass
                _pause_ear(False)
                BROKER.ensure()
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
    parser.add_argument("--mic", default=DEFAULT_MIC)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
    global AV_DEVICE, AV_SIZE, AV_FPS, AV_MIC
    AV_DEVICE = args.device
    AV_SIZE = args.size
    AV_FPS = args.fps
    AV_MIC = args.mic
    BROKER = CamBroker(args.device, args.size, args.fps)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    logger.info(
        "cam http://%s:%s/ · %s %s@%sfps · mic=%s",
        args.host, args.port, args.device, args.size, args.fps, args.mic,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("arrêt")


if __name__ == "__main__":
    main()
