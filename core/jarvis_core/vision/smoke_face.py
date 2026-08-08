"""Test isolé FaceEngine — image → MediaPipe Face Mesh → embedding.

Usage (depuis core/) :
  python -m jarvis_core.vision.smoke_face path/to/face.jpg
  python -m jarvis_core.vision.smoke_face --webcam   # 1 frame OpenCV

Ne touche pas au WebSocket ni au HUD. Confirme uniquement le moteur CV.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Smoke FaceEngine (MediaPipe Face Mesh)")
    parser.add_argument("image", nargs="?", help="JPEG/PNG avec un visage")
    parser.add_argument("--webcam", action="store_true", help="Capturer 1 frame webcam locale")
    args = parser.parse_args(argv)

    print("[FACE ENGINE] loading…")
    t0 = time.monotonic()
    from .face_engine import FaceEngine

    engine = FaceEngine()
    print(f"[FACE ENGINE] ready · {int((time.monotonic() - t0) * 1000)} ms")

    if args.webcam:
        import cv2

        cap = cv2.VideoCapture(0)
        ok, frame = cap.read()
        cap.release()
        if not ok or frame is None:
            print("[FACE ENGINE] camera FAIL — aucune frame")
            return 2
        print(f"[FACE ENGINE] camera OK · shape={frame.shape}")
        bgr = frame
    else:
        if not args.image:
            parser.error("fournir une image ou --webcam")
        path = Path(args.image)
        if not path.is_file():
            print(f"[FACE ENGINE] fichier introuvable : {path}")
            return 2
        import cv2

        bgr = cv2.imread(str(path))
        if bgr is None:
            print("[FACE ENGINE] decode FAIL")
            return 2
        print(f"[FACE ENGINE] image OK · {path.name} shape={bgr.shape}")

    det = engine.detect_and_embed(bgr, for_presence=True)
    if not det.found:
        print(f"[FACE ENGINE] face detected: NO · reason={det.reason}")
        return 1

    emb = det.embedding
    n = int(emb.shape[0]) if emb is not None else 0
    print(
        f"[FACE ENGINE] face detected: YES · box={det.box} quality={det.quality:.3f}"
    )
    print(f"[FACE ENGINE] embedding generated: YES · dim={n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
