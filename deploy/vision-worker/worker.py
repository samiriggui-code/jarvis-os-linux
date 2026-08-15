#!/usr/bin/env python3
"""JARVIS Vision Worker — process isolé (local dev).

Capture / mock → tracks → WS ``type:perception`` action ``detections``.
Jamais dans windows_agent ni dans la boucle asyncio du Core.

Modes :
  JARVIS_VISION_MODE=mock   (défaut) — objets synthétiques, zéro dépendances
  JARVIS_VISION_MODE=yolo   — Ultralytics si installé, sinon retombe sur mock

Usage :
  python worker.py --ws ws://127.0.0.1:8765/ws
  python worker.py --mock-once   # une frame puis exit (smoke)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
logger = logging.getLogger("jarvis.vision.worker")

DEFAULT_WS = os.environ.get("JARVIS_WS_URL", "ws://127.0.0.1:8765/ws")
SOURCE = os.environ.get("JARVIS_VISION_SOURCE", "vision-worker")


def mock_tracks(t: float) -> list[dict[str, Any]]:
    """Deux objets qui se déplacent — pour valider le diff Core sans caméra."""
    phase = (t % 8.0) / 8.0
    x1 = 10 + phase * 40
    x2 = 60 - phase * 20
    tracks = [
        {
            "object_id": "mock-bottle",
            "label": "bottle",
            "confidence": 0.92,
            "bbox": {"x": x1, "y": 25.0, "width": 12.0, "height": 35.0},
        }
    ]
    # Disparaît 2 s sur 8 pour exercer VISION_OBJECT_LOST
    if phase < 0.75:
        tracks.append(
            {
                "object_id": "mock-remote",
                "label": "remote",
                "confidence": 0.81,
                "bbox": {"x": x2, "y": 55.0, "width": 18.0, "height": 10.0},
            }
        )
    return tracks


def yolo_tracks(frame_bgr: Any) -> list[dict[str, Any]] | None:
    """Inference YOLO si ultralytics + opencv dispo. None → caller fallback mock."""
    try:
        from ultralytics import YOLO  # type: ignore
    except ImportError:
        return None

    model_name = os.environ.get("JARVIS_YOLO_MODEL", "yolov8n.pt")
    if not hasattr(yolo_tracks, "_model"):
        logger.info("chargement YOLO %s", model_name)
        yolo_tracks._model = YOLO(model_name)  # type: ignore[attr-defined]

    model = yolo_tracks._model  # type: ignore[attr-defined]
    results = model.predict(frame_bgr, verbose=False, conf=0.45)
    if not results:
        return []
    r0 = results[0]
    h, w = frame_bgr.shape[:2]
    out: list[dict[str, Any]] = []
    boxes = getattr(r0, "boxes", None)
    if boxes is None:
        return []
    names = getattr(r0, "names", {}) or {}
    for i, box in enumerate(boxes):
        xyxy = box.xyxy[0].tolist()
        conf = float(box.conf[0]) if box.conf is not None else 0.0
        cls_id = int(box.cls[0]) if box.cls is not None else -1
        label = str(names.get(cls_id, cls_id))
        x1, y1, x2, y2 = xyxy
        out.append(
            {
                "object_id": f"yolo-{cls_id}-{i}",
                "label": label,
                "confidence": conf,
                "bbox": {
                    "x": 100.0 * x1 / max(w, 1),
                    "y": 100.0 * y1 / max(h, 1),
                    "width": 100.0 * (x2 - x1) / max(w, 1),
                    "height": 100.0 * (y2 - y1) / max(h, 1),
                },
            }
        )
    return out


def grab_camera_frame() -> Any | None:
    try:
        import cv2  # type: ignore
    except ImportError:
        return None
    idx = int(os.environ.get("JARVIS_VISION_CAMERA", "0"))
    cap = cv2.VideoCapture(idx)
    if not cap.isOpened():
        return None
    ok, frame = cap.read()
    cap.release()
    return frame if ok else None


def build_tracks(mode: str, t: float) -> list[dict[str, Any]]:
    if mode == "yolo":
        frame = grab_camera_frame()
        if frame is not None:
            tracked = yolo_tracks(frame)
            if tracked is not None:
                return tracked
        logger.warning("YOLO indisponible — fallback mock")
    return mock_tracks(t)


async def send_detections(ws: Any, tracks: list[dict[str, Any]]) -> None:
    msg = {
        "type": "perception",
        "action": "detections",
        "source": SOURCE,
        "ts": time.time(),
        "objects": tracks,
    }
    await ws.send(json.dumps(msg))


async def run_loop(ws_url: str, mode: str, interval_s: float, once: bool) -> int:
    try:
        import websockets
    except ImportError:
        print("pip install websockets", file=sys.stderr)
        return 1

    logger.info("Vision Worker → %s · mode=%s", ws_url, mode)
    async with websockets.connect(ws_url, open_timeout=5, close_timeout=2) as ws:
        # Drain optional hello / boot messages
        async def _drain() -> None:
            try:
                while True:
                    raw = await asyncio.wait_for(ws.recv(), timeout=0.05)
                    logger.debug("core ← %s", str(raw)[:120])
            except (asyncio.TimeoutError, Exception):
                return

        await _drain()
        t0 = time.time()
        while True:
            tracks = build_tracks(mode, time.time() - t0)
            await send_detections(ws, tracks)
            logger.info("envoyé %d track(s)", len(tracks))
            if once:
                # Lire ack
                try:
                    ack = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    logger.info("ack %s", ack)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("pas d'ack : %s", exc)
                return 0
            await asyncio.sleep(interval_s)


def main() -> int:
    parser = argparse.ArgumentParser(description="JARVIS Vision Worker (local)")
    parser.add_argument("--ws", default=DEFAULT_WS, help="URL WebSocket Core")
    parser.add_argument(
        "--mode",
        default=os.environ.get("JARVIS_VISION_MODE", "mock"),
        choices=("mock", "yolo"),
    )
    parser.add_argument("--interval", type=float, default=float(os.environ.get("JARVIS_VISION_INTERVAL_S", "0.5")))
    parser.add_argument("--mock-once", action="store_true", help="Une frame puis exit")
    parser.add_argument("--print-only", action="store_true", help="Pas de WS — dump JSON stdout")
    args = parser.parse_args()

    if args.print_only:
        tracks = build_tracks(args.mode, 0.0)
        print(json.dumps({"type": "perception", "action": "detections", "objects": tracks}, indent=2))
        return 0

    return asyncio.run(run_loop(args.ws, args.mode, args.interval, args.mock_once))


if __name__ == "__main__":
    raise SystemExit(main())
