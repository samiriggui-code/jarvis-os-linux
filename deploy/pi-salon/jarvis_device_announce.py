#!/usr/bin/env python3
"""Device 2 — annonceur satellite Pi salon → DeviceRegistry Core.

Discovery only : device.register + capabilities + heartbeat.
Pas d'exécution, pas de router, pas d'agent intelligent.

Boot (systemd) → détecte caps présentes → POST /v1/devices/* sur le Core
(via nginx JARVIS_CORE_DEVICES_URL, défaut http://192.168.1.37:8080/v1/devices).
"""
from __future__ import annotations

import json
import logging
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [pi-device] %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("jarvis.pi_device")

DEVICE_ID = (os.environ.get("JARVIS_DEVICE_ID") or "pi-salon").strip()
DEVICE_TYPE = (os.environ.get("JARVIS_DEVICE_TYPE") or "raspberry_pi").strip()
RUNTIME_KIND = (os.environ.get("JARVIS_RUNTIME_KIND") or "jarvis_satellite").strip()
LABEL = (os.environ.get("JARVIS_DEVICE_LABEL") or "Salon").strip()

# Base HTTP devices — nginx NUC proxifie /v1/devices → Core :8766
DEVICES_URL = (
    os.environ.get("JARVIS_CORE_DEVICES_URL")
    or os.environ.get("JARVIS_DEVICES_URL")
    or "http://192.168.1.37:8080/v1/devices"
).strip().rstrip("/")

CORE_SALON = (os.environ.get("JARVIS_CORE_SALON_URL") or "http://192.168.1.37:8080").strip().rstrip("/")
SALON_TOKEN = (os.environ.get("JARVIS_SALON_TOKEN") or "").strip()

HA_URL = (os.environ.get("JARVIS_HA_URL") or "http://127.0.0.1:8123").strip().rstrip("/")
EAR_HEALTH = (os.environ.get("JARVIS_EAR_HEALTH") or "http://127.0.0.1:8767/health").strip()
CAM_URL = (os.environ.get("JARVIS_CAM_URL") or "http://127.0.0.1:8768/").strip()
PLAYER_ADB = (os.environ.get("JARVIS_PLAYER_ADB") or "192.168.1.49:5555").strip()
ADB_BIN = (os.environ.get("JARVIS_ADB") or "adb").strip()

HEARTBEAT_S = float(os.environ.get("JARVIS_DEVICE_HEARTBEAT_S") or "45")
RETRY_S = float(os.environ.get("JARVIS_DEVICE_RETRY_S") or "15")


def _headers() -> dict[str, str]:
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if SALON_TOKEN:
        h["Authorization"] = f"Bearer {SALON_TOKEN}"
    return h


def _http_json(method: str, url: str, body: dict[str, Any] | None = None, timeout: float = 8.0) -> dict[str, Any] | None:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw:
                return {"ok": True}
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:200]
        logger.warning("HTTP %s %s → %s %s", method, url, exc.code, detail)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("HTTP %s %s échoué : %s", method, url, exc)
        return None


def _http_ok(url: str, timeout: float = 3.0) -> bool:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= getattr(resp, "status", 200) < 400
    except Exception:  # noqa: BLE001
        return False


def _run(cmd: list[str], timeout: float = 5.0) -> str:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
        return (p.stdout or "") + (p.stderr or "")
    except Exception:  # noqa: BLE001
        return ""


def detect_camera() -> dict[str, Any] | None:
    """v4l2 /dev/video* ou jarvis-cam local."""
    videos = []
    try:
        import glob

        videos = sorted(glob.glob("/dev/video*"))
    except Exception:  # noqa: BLE001
        videos = []
    v4l = _run(["v4l2-ctl", "--list-devices"])
    cam_service = _http_ok(CAM_URL)
    if not videos and not cam_service and "AN-VC" not in v4l and "Camera" not in v4l:
        return None
    meta: dict[str, Any] = {"model": "LG_USB"}
    if videos:
        meta["nodes"] = videos[:4]
    if cam_service:
        meta["mjpeg"] = CAM_URL
    return {
        "name": "camera",
        "capability_id": "camera.capture",
        "value": True,
        "metadata": meta,
    }


def detect_audio_input() -> dict[str, Any] | None:
    arec = _run(["arecord", "-l"])
    ear = _http_json("GET", EAR_HEALTH, None, timeout=3.0) or {}
    if "card" not in arec.lower() and not ear.get("ok"):
        return None
    meta: dict[str, Any] = {"source": "usb_microphone"}
    if ear.get("mic"):
        meta["alsa"] = ear.get("mic")
    if ear.get("wake"):
        meta["wake"] = ear.get("wake_model") or "hey_jarvis"
    return {
        "name": "audio",
        "capability_id": "audio.input",
        "value": True,
        "metadata": meta,
    }


def detect_audio_output() -> dict[str, Any] | None:
    aplay = _run(["aplay", "-l"])
    ear = _http_json("GET", EAR_HEALTH, None, timeout=3.0) or {}
    if "card" not in aplay.lower() and not ear.get("ok"):
        return None
    meta: dict[str, Any] = {"device": "salon_speaker"}
    if ear.get("device"):
        meta["alsa"] = ear.get("device")
    return {
        "name": "audio",
        "capability_id": "audio.output",
        "value": True,
        "metadata": meta,
    }


def detect_home_assistant() -> dict[str, Any] | None:
    # /api/ sans token → souvent 401 = instance vivante.
    try:
        req = urllib.request.Request(f"{HA_URL}/api/", method="GET")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            code = getattr(resp, "status", 200)
            if code < 500:
                return {
                    "name": "home_assistant",
                    "capability_id": "home_assistant.gateway",
                    "value": True,
                    "metadata": {"instance": "ha_local", "url": HA_URL},
                }
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403, 404):
            return {
                "name": "home_assistant",
                "capability_id": "home_assistant.gateway",
                "value": True,
                "metadata": {"instance": "ha_local", "url": HA_URL, "auth": "required"},
            }
    except Exception:  # noqa: BLE001
        pass
    if _http_ok(HA_URL):
        return {
            "name": "home_assistant",
            "capability_id": "home_assistant.gateway",
            "value": True,
            "metadata": {"instance": "ha_local", "url": HA_URL},
        }
    return None


def detect_freebox_player() -> dict[str, Any] | None:
    ear = _http_json("GET", EAR_HEALTH, None, timeout=3.0) or {}
    if not ear.get("ok"):
        return None
    player = str(ear.get("player") or PLAYER_ADB)
    # Presence du binaire adb + cible configurée = capacité déclarable.
    # On ne force pas `adb connect` ici (discovery only).
    which = _run(["which", ADB_BIN]) or _run(["command", "-v", ADB_BIN])
    if not which.strip() and not player:
        return None
    return {
        "name": "freebox",
        "capability_id": "freebox.player",
        "value": True,
        "metadata": {"target": "freeplayer_android", "adb": player},
    }


def probe_capabilities() -> list[dict[str, Any]]:
    caps: list[dict[str, Any]] = []
    for fn in (
        detect_camera,
        detect_audio_input,
        detect_audio_output,
        detect_home_assistant,
        detect_freebox_player,
    ):
        try:
            cap = fn()
        except Exception:  # noqa: BLE001
            logger.exception("probe %s", fn.__name__)
            continue
        if cap:
            caps.append(cap)
    return caps


def announce() -> bool:
    caps = probe_capabilities()
    logger.info(
        "caps détectées · %s",
        ", ".join(c["capability_id"] for c in caps) or "(aucune)",
    )
    reg = _http_json(
        "POST",
        f"{DEVICES_URL}/register",
        {
            "device_id": DEVICE_ID,
            "device_type": DEVICE_TYPE,
            "type": DEVICE_TYPE,
            "runtime_kind": RUNTIME_KIND,
            "label": LABEL,
            "metadata": {
                "label": LABEL,
                "role": "salon",
                "host": socket.gethostname(),
                "source": "pi-device-announcer",
                "core_salon": CORE_SALON,
            },
        },
    )
    if not reg or not reg.get("ok", True):
        logger.warning("register échoué · %s", reg)
        return False
    cap_ack = _http_json(
        "POST",
        f"{DEVICES_URL}/capabilities",
        {"device_id": DEVICE_ID, "capabilities": caps},
    )
    if not cap_ack or not cap_ack.get("ok", True):
        logger.warning("capabilities échoué · %s", cap_ack)
        return False
    logger.info("annoncé · %s (%s) · %d caps", DEVICE_ID, LABEL, len(caps))
    return True


def heartbeat() -> bool:
    hb = _http_json(
        "POST",
        f"{DEVICES_URL}/heartbeat",
        {"device_id": DEVICE_ID, "timestamp": time.time()},
    )
    return bool(hb and hb.get("ok", True))


def main() -> int:
    logger.info(
        "start · id=%s → %s heartbeat=%.0fs",
        DEVICE_ID,
        DEVICES_URL,
        HEARTBEAT_S,
    )
    announced = False
    while True:
        try:
            if not announced:
                announced = announce()
                if not announced:
                    time.sleep(RETRY_S)
                    continue
            if not heartbeat():
                logger.warning("heartbeat perdu — re-annonce")
                announced = False
                time.sleep(RETRY_S)
                continue
            time.sleep(HEARTBEAT_S)
        except KeyboardInterrupt:
            logger.info("stop")
            return 0
        except Exception:  # noqa: BLE001
            logger.exception("boucle")
            announced = False
            time.sleep(RETRY_S)


if __name__ == "__main__":
    raise SystemExit(main())
