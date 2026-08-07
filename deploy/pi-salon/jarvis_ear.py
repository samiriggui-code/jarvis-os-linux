#!/usr/bin/env python3
"""jarvis-ear — oreilles / bouche / mains du salon (Pi), sans Chromium.

Phase 1 : WAV → jack Headphones.
Phase 2 : micro → VAD → Core STT/chat.
Phase 3 : Core → /v1/player.json → adb Freebox Player (apps, recherche, URL).

Le Pi ne décide rien : il capte, joue, et exécute les actions allowlistées.
"""
from __future__ import annotations

import argparse
import base64
import json
import logging
import os
import subprocess
import tempfile
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import error, request
from urllib.parse import urlparse

logger = logging.getLogger("jarvis.ear")

DEFAULT_DEVICE = os.environ.get(
    "JARVIS_EAR_DEVICE",
    "plughw:CARD=Headphones,DEV=0",
)
DEFAULT_MIC = os.environ.get(
    "JARVIS_EAR_MIC",
    "plughw:CARD=Camera,DEV=0",
)
DEFAULT_HOST = os.environ.get("JARVIS_EAR_HOST", "0.0.0.0")
DEFAULT_PORT = int(os.environ.get("JARVIS_EAR_PORT", "8767"))
CORE_URL = (os.environ.get("JARVIS_CORE_SALON_URL") or "").strip().rstrip("/")
SALON_TOKEN = (os.environ.get("JARVIS_SALON_TOKEN") or "").strip()
PLAYER_SERIAL = os.environ.get("JARVIS_PLAYER_ADB", "192.168.1.49:5555")
ADB_BIN = os.environ.get("JARVIS_ADB", "adb")

# Packages vérifiés / installés sur Freebox Player POP (Android 10).
PLAYER_APPS: dict[str, str] = {
    "netflix": "com.netflix.ninja",
    "youtube": "com.google.android.youtube.tv",
    "disney": "com.disney.disneyplus",
    "plex": "com.plexapp.android",
    "vlc": "org.videolan.vlc",
    "browser": "com.phlox.tvwebbrowser",  # TV Bro
    "chrome": "com.android.chrome",  # si installé via Play
    "firefox": "org.mozilla.fennec_fdroid",
}

YOUTUBE_ACTIVITY = (
    "com.google.android.youtube.tv/"
    "com.google.android.apps.youtube.tv.activity.ShellActivity"
)

RATE = 16_000
CHANNELS = 1
SAMPLE_WIDTH = 2
# openWakeWord attend 1280 samples (80 ms) @ 16 kHz.
WAKE_FRAMES = 1280
CHUNK_MS = 200
CHUNK_FRAMES = RATE * CHUNK_MS // 1000
# Capture après wake — seuil plus haut que l'ancien mode « tout ouvrir ».
ENERGY_THRESHOLD = int(os.environ.get("JARVIS_EAR_ENERGY", "700"))
SILENCE_CHUNKS = int(os.environ.get("JARVIS_EAR_SILENCE_CHUNKS", "10"))
MAX_CHUNKS = int(os.environ.get("JARVIS_EAR_MAX_CHUNKS", "60"))
MIN_SPEECH_CHUNKS = int(os.environ.get("JARVIS_EAR_MIN_SPEECH", "3"))
COOLDOWN_AFTER_PLAY_S = float(os.environ.get("JARVIS_EAR_PLAY_COOLDOWN", "1.2"))
WAKE_ENABLED = os.environ.get("JARVIS_EAR_WAKE", "1").strip() not in ("0", "false", "no")
WAKE_MODEL = os.environ.get("JARVIS_EAR_WAKE_MODEL", "hey_jarvis")
WAKE_THRESHOLD = float(os.environ.get("JARVIS_EAR_WAKE_THRESHOLD", "0.55"))
WAKE_REFRACTORY_S = float(os.environ.get("JARVIS_EAR_WAKE_REFRACTORY", "2.5"))
# Après wake : fenêtre d'écoute commande (même sans gros RMS immédiat).
LISTEN_AFTER_WAKE_S = float(os.environ.get("JARVIS_EAR_LISTEN_S", "8.0"))

_play_lock = threading.Lock()
_playing_until = 0.0
_listen_enabled = True
_adb_lock = threading.Lock()


def _rms_s16le(raw: bytes) -> int:
    """RMS sur PCM signed 16-bit LE (stdlib — audioop retiré en 3.13)."""
    if not raw:
        return 0
    n = len(raw) // 2
    if n <= 0:
        return 0
    total = 0
    for i in range(0, n * 2, 2):
        sample = int.from_bytes(raw[i : i + 2], "little", signed=True)
        total += sample * sample
    return int((total / n) ** 0.5)


def _mark_playing(duration_hint_s: float = 2.0) -> None:
    global _playing_until
    _playing_until = time.monotonic() + max(duration_hint_s, 0.3) + COOLDOWN_AFTER_PLAY_S


def _is_playing() -> bool:
    return time.monotonic() < _playing_until or _play_lock.locked()


def play_wav(wav: bytes, device: str) -> None:
    """Joue un WAV via aplay sur le jack. Coupe la lecture précédente."""
    if not wav:
        raise ValueError("WAV vide")
    approx_s = max(0.5, (len(wav) - 44) / (RATE * CHANNELS * SAMPLE_WIDTH))
    with _play_lock:
        _mark_playing(approx_s)
        subprocess.run(["pkill", "-x", "aplay"], check=False, capture_output=True)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(wav)
            path = tmp.name
        try:
            r = subprocess.run(
                ["aplay", "-q", "-D", device, path],
                capture_output=True,
                timeout=120,
            )
            if r.returncode != 0:
                err = (r.stderr or b"").decode("utf-8", "replace")[:300]
                raise RuntimeError(f"aplay rc={r.returncode} · {err}")
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
            _mark_playing(COOLDOWN_AFTER_PLAY_S)


def _wav_bytes(pcm: bytes) -> bytes:
    import io

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(RATE)
        wf.writeframes(pcm)
    return buf.getvalue()


def push_utterance(pcm: bytes, *, woken: bool = True) -> dict | None:
    """POST le WAV au Core. None si pas configuré."""
    if not CORE_URL:
        logger.warning("JARVIS_CORE_SALON_URL non défini — utterance jetée")
        return None
    wav = _wav_bytes(pcm)
    body = json.dumps(
        {
            "audio_b64": base64.b64encode(wav).decode("ascii"),
            "filename": "salon.wav",
            "language": "fr",
            "woken": bool(woken),
            "source": "salon-ear",
        }
    ).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if SALON_TOKEN:
        headers["Authorization"] = f"Bearer {SALON_TOKEN}"
    url = f"{CORE_URL}/v1/salon/utterance.json"
    req = request.Request(url, data=body, method="POST", headers=headers)
    try:
        with request.urlopen(req, timeout=90) as resp:
            raw = resp.read()
            try:
                return json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                return {"ok": True, "raw": raw[:200].decode("utf-8", "replace")}
    except error.URLError as exc:
        logger.warning("Core injoignable · %s — %s", url, exc)
        return {"ok": False, "error": str(exc)}
    except Exception as exc:  # noqa: BLE001
        logger.warning("envoi utterance échoué · %s", exc)
        return {"ok": False, "error": str(exc)}


def load_wake_model():
    """Charge openWakeWord (hey_jarvis). None si indisponible."""
    if not WAKE_ENABLED:
        logger.warning("wake word désactivé (JARVIS_EAR_WAKE=0)")
        return None
    try:
        from openwakeword.model import Model  # type: ignore
        import openwakeword  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as exc:
        logger.error(
            "wake word absent (%s) — pip3 install openwakeword onnxruntime numpy",
            exc,
        )
        return None
    try:
        try:
            openwakeword.utils.download_models([WAKE_MODEL])
        except Exception as exc:  # noqa: BLE001
            logger.debug("download modèle wake : %s", exc)
        model = Model(wakeword_models=[WAKE_MODEL], inference_framework="onnx")
        key = WAKE_MODEL.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        logger.info("wake prêt · %s · seuil=%.2f", key, WAKE_THRESHOLD)
        return {"model": model, "key": key, "np": np}
    except Exception as exc:  # noqa: BLE001
        logger.error("wake modèle illisible : %s", exc)
        return None


def _adb(*args: str, timeout: float = 15.0) -> subprocess.CompletedProcess[str]:
    cmd = [ADB_BIN, "-s", PLAYER_SERIAL, *args]
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout, check=False
    )


def adb_ensure() -> dict:
    """Connecte le player si besoin."""
    with _adb_lock:
        r = subprocess.run(
            [ADB_BIN, "connect", PLAYER_SERIAL],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        devices = subprocess.run(
            [ADB_BIN, "devices"], capture_output=True, text=True, timeout=10, check=False
        )
        ok = False
        for line in (devices.stdout or "").splitlines():
            if line.startswith(PLAYER_SERIAL) and "\tdevice" in line:
                ok = True
                break
            if line.startswith(PLAYER_SERIAL) and "unauthorized" in line:
                return {
                    "ok": False,
                    "error": "adb unauthorized — accepter le dialogue sur la Freebox",
                    "connect": (r.stdout or "") + (r.stderr or ""),
                }
        return {
            "ok": ok,
            "serial": PLAYER_SERIAL,
            "devices": (devices.stdout or "").strip(),
            "connect": ((r.stdout or "") + (r.stderr or "")).strip(),
        }


def _safe_url(url: str) -> str | None:
    u = (url or "").strip()
    if not u or len(u) > 2000:
        return None
    parsed = urlparse(u)
    if parsed.scheme not in ("http", "https"):
        return None
    return u


def player_action(data: dict) -> dict:
    """Actions allowlistées — jamais de shell libre."""
    action = str(data.get("action") or "").strip()
    ensure = adb_ensure()
    if not ensure.get("ok"):
        return ensure

    if action == "launch":
        app = str(data.get("app") or "").strip().lower()
        pkg = PLAYER_APPS.get(app)
        if not pkg:
            return {"ok": False, "error": f"app inconnue: {app}"}
        r = _adb(
            "shell",
            "monkey",
            "-p",
            pkg,
            "-c",
            "android.intent.category.LEANBACK_LAUNCHER",
            "1",
        )
        if r.returncode != 0 or "No activities" in (r.stdout or ""):
            r = _adb(
                "shell",
                "monkey",
                "-p",
                pkg,
                "-c",
                "android.intent.category.LAUNCHER",
                "1",
            )
        return {
            "ok": r.returncode == 0,
            "action": action,
            "app": app,
            "package": pkg,
            "stdout": (r.stdout or "")[:300],
            "stderr": (r.stderr or "")[:300],
        }

    if action == "view_url":
        url = _safe_url(str(data.get("url") or ""))
        if not url:
            return {"ok": False, "error": "url http(s) requise"}
        app = str(data.get("app") or "").strip().lower()
        if app == "youtube" or "youtube.com" in url:
            r = _adb(
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.VIEW",
                "-d",
                url,
                "-n",
                YOUTUBE_ACTIVITY,
            )
        elif app == "vlc" or url.rstrip("/").endswith((".mjpg", ".mjpeg", ".m3u8")):
            r = _adb(
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.VIEW",
                "-d",
                url,
                "-p",
                PLAYER_APPS["vlc"],
            )
        elif app in ("browser", "chrome", "firefox") or "google." in url:
            pkg = PLAYER_APPS.get(app) if app in PLAYER_APPS else PLAYER_APPS["browser"]
            if app == "chrome":
                check = _adb("shell", "pm", "path", PLAYER_APPS["chrome"])
                if check.returncode != 0 or "package:" not in (check.stdout or ""):
                    pkg = PLAYER_APPS["browser"]
            if not app:
                pkg = PLAYER_APPS["browser"]
            r = _adb(
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.VIEW",
                "-d",
                url,
                "-p",
                pkg,
            )
        elif app and app in PLAYER_APPS:
            r = _adb(
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.VIEW",
                "-d",
                url,
                "-p",
                PLAYER_APPS[app],
            )
        else:
            r = _adb(
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.VIEW",
                "-d",
                url,
            )
        return {
            "ok": r.returncode == 0,
            "action": action,
            "url": url,
            "app": app or None,
            "stdout": (r.stdout or "")[:300],
            "stderr": (r.stderr or "")[:300],
        }

    if action == "home":
        r = _adb("shell", "input", "keyevent", "KEYCODE_HOME")
        return {"ok": r.returncode == 0, "action": action}

    if action == "status":
        return ensure

    return {"ok": False, "error": f"action inconnue: {action}"}


def listen_loop(mic_device: str) -> None:
    """Veille wake word → capture commande → POST Core. Muet pendant TTS."""
    global _listen_enabled
    wake = load_wake_model()
    if wake is None:
        logger.error(
            "SANS wake word le salon resterait sourd aux faux positifs TV — "
            "écoute COUPÉE jusqu'à install openwakeword. "
            "Force temporaire : JARVIS_EAR_WAKE=0 (déconseillé)."
        )
        if WAKE_ENABLED:
            while True:
                time.sleep(30.0)
                wake = load_wake_model()
                if wake is not None:
                    break
                logger.error("wake toujours absent — nouvel essai dans 30 s")

    frame_bytes = WAKE_FRAMES * SAMPLE_WIDTH
    chunk_bytes = CHUNK_FRAMES * SAMPLE_WIDTH
    cmd = [
        "arecord",
        "-q",
        "-D",
        mic_device,
        "-f",
        "S16_LE",
        "-r",
        str(RATE),
        "-c",
        str(CHANNELS),
        "-t",
        "raw",
    ]
    logger.info(
        "écoute micro %s · wake=%s · seuil_energie=%s · core=%s",
        mic_device,
        WAKE_MODEL if wake else "OFF",
        ENERGY_THRESHOLD,
        CORE_URL or "(off)",
    )
    last_wake = 0.0
    while True:
        if not _listen_enabled or not CORE_URL:
            time.sleep(1.0)
            continue
        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
        except FileNotFoundError:
            logger.error("arecord introuvable")
            time.sleep(5.0)
            continue
        assert proc.stdout is not None
        # idle = attend wake ; listen = capture après wake
        mode = "idle"
        speech = bytearray()
        in_speech = False
        silence = 0
        speech_chunks = 0
        listen_deadline = 0.0
        try:
            while True:
                if not _listen_enabled:
                    break
                if _is_playing():
                    # Drain + reset modèle (évite auto-réveil sur TTS jack).
                    need = frame_bytes if mode == "idle" else chunk_bytes
                    proc.stdout.read(need)
                    if wake is not None:
                        try:
                            wake["model"].reset()
                        except Exception:  # noqa: BLE001
                            pass
                    mode = "idle"
                    speech.clear()
                    in_speech = False
                    silence = 0
                    speech_chunks = 0
                    continue

                if mode == "idle":
                    raw = proc.stdout.read(frame_bytes)
                    if not raw or len(raw) < frame_bytes:
                        logger.warning("micro coupé — relance arecord")
                        break
                    if wake is None:
                        # Mode dégradé explicite (WAKE=0) : VAD seul, marqué woken=False
                        # pour que le Core puisse filtrer.
                        rms = _rms_s16le(raw)
                        if rms >= ENERGY_THRESHOLD:
                            mode = "listen"
                            listen_deadline = time.monotonic() + LISTEN_AFTER_WAKE_S
                            speech = bytearray(raw)
                            in_speech = True
                            silence = 0
                            speech_chunks = 1
                        continue
                    np = wake["np"]
                    frame = np.frombuffer(raw, dtype=np.int16)
                    try:
                        scores = wake["model"].predict(frame)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("wake predict : %s", exc)
                        continue
                    score = 0.0
                    if isinstance(scores, dict):
                        score = float(scores.get(wake["key"]) or max(scores.values() or [0.0]))
                    now = time.monotonic()
                    if score >= WAKE_THRESHOLD and (now - last_wake) >= WAKE_REFRACTORY_S:
                        last_wake = now
                        logger.info("WAKE · score=%.2f — écoute commande", score)
                        try:
                            wake["model"].reset()
                        except Exception:  # noqa: BLE001
                            pass
                        mode = "listen"
                        listen_deadline = now + LISTEN_AFTER_WAKE_S
                        speech = bytearray()
                        in_speech = False
                        silence = 0
                        speech_chunks = 0
                    continue

                # mode == listen : capturer la commande
                raw = proc.stdout.read(chunk_bytes)
                if not raw or len(raw) < chunk_bytes:
                    logger.warning("micro coupé — relance arecord")
                    break
                now = time.monotonic()
                rms = _rms_s16le(raw)
                if rms >= ENERGY_THRESHOLD:
                    in_speech = True
                    silence = 0
                    speech_chunks += 1
                    speech.extend(raw)
                    if speech_chunks >= MAX_CHUNKS:
                        logger.info("utterance max · %s o", len(speech))
                        result = push_utterance(bytes(speech), woken=True)
                        logger.info("core ← %s", result)
                        mode = "idle"
                        speech.clear()
                        in_speech = False
                        speech_chunks = 0
                elif in_speech:
                    speech.extend(raw)
                    silence += 1
                    if silence >= SILENCE_CHUNKS:
                        if speech_chunks >= MIN_SPEECH_CHUNKS:
                            logger.info(
                                "utterance · %s chunks · %s o",
                                speech_chunks,
                                len(speech),
                            )
                            result = push_utterance(bytes(speech), woken=True)
                            logger.info("core ← %s", result)
                        mode = "idle"
                        speech.clear()
                        in_speech = False
                        silence = 0
                        speech_chunks = 0
                elif now > listen_deadline:
                    logger.info("écoute expirée sans commande — retour veille")
                    mode = "idle"
                    speech.clear()
        finally:
            proc.kill()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass
        time.sleep(0.5)


class Handler(BaseHTTPRequestHandler):
    device: str = DEFAULT_DEVICE

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        logger.info("%s - %s", self.address_string(), fmt % args)

    def _json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _authorized(self) -> bool:
        if not SALON_TOKEN:
            return True
        auth = self.headers.get("Authorization") or ""
        if auth.startswith("Bearer ") and auth[7:].strip() == SALON_TOKEN:
            return True
        return (self.headers.get("X-Jarvis-Salon-Token") or "").strip() == SALON_TOKEN

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") == "/health":
            self._json(
                200,
                {
                    "ok": True,
                    "device": self.device,
                    "mic": DEFAULT_MIC,
                    "listen": bool(CORE_URL) and _listen_enabled,
                    "wake": WAKE_ENABLED,
                    "wake_model": WAKE_MODEL if WAKE_ENABLED else None,
                    "core": CORE_URL or None,
                    "player": PLAYER_SERIAL,
                    "role": "salon-ear",
                },
            )
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        path = self.path.split("?", 1)[0].rstrip("/")

        try:
            if path == "/v1/player.json":
                if not self._authorized():
                    self._json(401, {"ok": False, "error": "unauthorized"})
                    return
                data = json.loads(body.decode("utf-8") or "{}")
                self._json(200, player_action(data if isinstance(data, dict) else {}))
                return

            if path == "/v1/play":
                wav = body
            elif path == "/v1/play.json":
                data = json.loads(body.decode("utf-8") or "{}")
                b64 = data.get("audio_b64") or ""
                wav = base64.b64decode(b64, validate=False)
            else:
                self._json(404, {"ok": False, "error": "not found"})
                return

            play_wav(wav, self.device)
            self._json(200, {"ok": True, "bytes": len(wav)})
        except Exception as exc:  # noqa: BLE001
            logger.exception("requête impossible")
            self._json(500, {"ok": False, "error": str(exc)})


def main() -> None:
    parser = argparse.ArgumentParser(description="JARVIS ear — salon Pi")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--device", default=DEFAULT_DEVICE)
    parser.add_argument("--mic", default=DEFAULT_MIC)
    parser.add_argument("--no-listen", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
    Handler.device = args.device

    if not args.no_listen and CORE_URL:
        t = threading.Thread(
            target=listen_loop, args=(args.mic,), name="salon-listen", daemon=True
        )
        t.start()
    elif not CORE_URL:
        logger.info("écoute micro OFF (JARVIS_CORE_SALON_URL vide) — bouche/player seuls")

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    logger.info(
        "écoute http://%s:%s · jack %s · player %s",
        args.host,
        args.port,
        args.device,
        PLAYER_SERIAL,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("arrêt")


if __name__ == "__main__":
    main()
