"""Smoke webcam → FaceEngine MediaPipe (Core, sans HUD).

Capture locale OpenCV, enroll + verify sur répertoire temporaire.

Usage (depuis core/, venv) :
  python -m jarvis_core._smoke_face_webcam
  python -m jarvis_core._smoke_face_webcam --device 1
  python -m jarvis_core._smoke_face_webcam --ws   # + face_frame WS si Core écoute

Succès :
  [OK] webcam frame
  [OK] face detectee
  [OK] enroll 8 samples
  [OK] verify FACE_SUCCESS

Viewer HTML (webcam + mesh + log Core) :
  python tools/face_smoke_serve.py
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
import tempfile
import time
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def _capture_bgr(device: int, *, warmup: int = 8) -> "object":
    import cv2

    cap = cv2.VideoCapture(device)
    if not cap.isOpened():
        check("webcam ouverte", False, f"device={device}")
    try:
        for _ in range(warmup):
            cap.read()
            time.sleep(0.05)
        ok, frame = cap.read()
        check("webcam frame", ok and frame is not None, f"device={device}")
        return frame
    finally:
        cap.release()


def _jpeg_b64(bgr) -> str:
    import cv2

    ok, buf = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    check("encode JPEG", ok)
    return base64.b64encode(buf.tobytes()).decode("ascii")


def _offline_smoke(jpeg_b64: str, *, frames_for_enroll: int) -> None:
    import jarvis_core.db.config as cfg
    from jarvis_core.vision.face_engine import ENROLL_SAMPLES_NEEDED, FaceEngine

    with tempfile.TemporaryDirectory(prefix="jarvis_face_webcam_") as tmp:
        data = Path(tmp)
        original = cfg.default_data_dir
        cfg.default_data_dir = lambda: data  # type: ignore[method-assign]
        try:
            print("\n-- FaceEngine offline (MediaPipe Face Mesh) --")
            t0 = time.monotonic()
            engine = FaceEngine()
            print(f"  moteur pret en {int((time.monotonic() - t0) * 1000)} ms")

            import cv2
            import numpy as np

            raw = base64.b64decode(jpeg_b64)
            bgr = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
            det = engine.detect_and_embed(bgr)
            check("face detectee", det.found, det.reason or "")
            check("embedding genere", det.embedding is not None, f"dim={det.embedding.shape[0] if det.embedding is not None else 0}")

            uid = "smoke-webcam-user"
            engine.enroll_begin(uid, "smoke")
            last: dict = {}
            n = max(ENROLL_SAMPLES_NEEDED, frames_for_enroll)
            for i in range(n + 2):
                last = engine.enroll_add_frame(uid, jpeg_b64, username="smoke")
                if last.get("type") == "FACE_SUCCESS" and last.get("mode") == "enroll":
                    break
            check(
                "enroll samples",
                last.get("type") == "FACE_SUCCESS",
                f"type={last.get('type')} progress={last.get('progress')}",
            )
            commit = engine.enroll_commit(uid, "smoke")
            check("enroll commit", commit.get("ok"), str(commit.get("error")))

            verify = engine.verify_frame(jpeg_b64)
            check(
                "verify FACE_SUCCESS",
                verify.get("type") == "FACE_SUCCESS" and verify.get("user_id") == uid,
                f"type={verify.get('type')} user={verify.get('username')} conf={verify.get('confidence')}",
            )
        finally:
            cfg.default_data_dir = original


async def _ws_smoke(uri: str, jpeg_b64: str) -> None:
    try:
        import websockets
    except ImportError:
        print("  [SKIP] WS — pip install websockets")
        return

    print(f"\n-- face_frame WS ({uri}) --")
    async with websockets.connect(uri, open_timeout=8, max_size=8 * 1024 * 1024) as ws:
        try:
            await asyncio.wait_for(ws.recv(), timeout=0.3)
        except asyncio.TimeoutError:
            pass

        await ws.send(json.dumps({"type": "holomat", "action": "status"}))
        t0 = time.monotonic()
        algo = None
        while time.monotonic() - t0 < 3.0:
            raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
            data = json.loads(raw)
            if data.get("type") == "holomat_status":
                algo = data.get("algo")
                check("Core face_engine", data.get("face_engine") is True, f"algo={algo}")
                break

        t0 = time.monotonic()
        await ws.send(json.dumps({
            "type": "holomat",
            "action": "face_frame",
            "mode": "verify",
            "jpeg_b64": jpeg_b64,
        }))
        got = None
        while time.monotonic() - t0 < 8.0:
            raw = await asyncio.wait_for(ws.recv(), timeout=8.0)
            data = json.loads(raw)
            if data.get("type") in ("FACE_PROGRESS", "FACE_SUCCESS", "FACE_FAILED", "holomat_error"):
                got = data
                break

        check("face_frame reponse", got is not None, "timeout")
        assert got is not None
        if got.get("type") == "holomat_error":
            check("FaceEngine WS", False, got.get("error"))
        else:
            check(
                "FaceEngine WS traite JPEG",
                got.get("type") in ("FACE_PROGRESS", "FACE_SUCCESS", "FACE_FAILED"),
                f"type={got.get('type')} found={got.get('face_found')} reason={got.get('reason')}",
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Smoke face webcam (Core Face Mesh)")
    parser.add_argument("--device", type=int, default=0, help="Index webcam OpenCV (defaut 0)")
    parser.add_argument("--warmup", type=int, default=10, help="Frames jetees avant capture")
    parser.add_argument("--ws", action="store_true", help="Tester aussi face_frame WS si Core tourne")
    parser.add_argument(
        "--ws-url",
        default=os.environ.get("JARVIS_CORE_WS", "ws://127.0.0.1:8765"),
        help="URL WebSocket Core",
    )
    args = parser.parse_args(argv)

    print("SMOKE face webcam — MediaPipe Face Mesh (Core)")
    print("Placez votre visage devant la camera…")

    bgr = _capture_bgr(args.device, warmup=args.warmup)
    print(f"  frame shape={bgr.shape}")

    jpeg_b64 = _jpeg_b64(bgr)
    print(f"  jpeg_b64 size={len(jpeg_b64)}")

    _offline_smoke(jpeg_b64, frames_for_enroll=8)

    if args.ws:
        asyncio.run(_ws_smoke(args.ws_url, jpeg_b64))

    print("\nSMOKE face webcam : PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
