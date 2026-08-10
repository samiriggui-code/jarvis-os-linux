"""Backend OpenCV YuNet + SFace — NUC sans AVX (MediaPipe SIGILL).

Même contrat detect_and_embed que FaceMeshBackend, embeddings SFace (128-D).
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import cv2
import numpy as np

from .face_mesh import MeshDetectResult

logger = logging.getLogger("jarvis.vision.opencv_face")

DATA = Path(__file__).resolve().parent / "data"
YUNET = DATA / "face_detection_yunet_2023mar.onnx"
SFACE = DATA / "face_recognition_sface_2021dec.onnx"

ALGO_NAME = "opencv_sface"
VERIFY_THRESHOLD = 0.363
EMBEDDING_DIM = 128


def cpu_has_avx() -> bool:
    """MediaPipe manylinux exige AVX — absent sur certains NUC Atom/Celeron."""
    forced = os.environ.get("JARVIS_FACE_BACKEND", "auto").strip().lower()
    if forced == "opencv":
        return False
    if forced == "mediapipe":
        return True
    try:
        text = Path("/proc/cpuinfo").read_text(encoding="utf-8", errors="ignore")
        # espaces pour éviter faux positifs (ex. "avx512" sans "avx ")
        return " avx " in f" {text.replace(chr(9), ' ')} " or " avx2 " in f" {text.replace(chr(9), ' ')} "
    except OSError:
        return True


class OpenCvSFaceBackend:
    """YuNet détecte, SFace embed — pas de MediaPipe."""

    def __init__(self) -> None:
        if not YUNET.exists() or not SFACE.exists():
            raise RuntimeError(
                f"Modèles ONNX manquants sous {DATA} "
                "(python -m jarvis_core.vision.fetch_models)"
            )
        self._detector = cv2.FaceDetectorYN_create(str(YUNET), "", (320, 320), 0.7, 0.3, 5000)
        self._recognizer = cv2.FaceRecognizerSF_create(str(SFACE), "")
        logger.info("OpenCV Face prêt · YuNet + SFace · %s", ALGO_NAME)

    def close(self) -> None:
        self._detector = None  # type: ignore[assignment]
        self._recognizer = None  # type: ignore[assignment]

    def detect_and_embed(
        self,
        bgr: np.ndarray,
        *,
        for_presence: bool = False,
        min_score: float = 0.5,
        min_px: int = 28,
        presence_frac_w: float = 0.05,
        presence_frac_h: float = 0.06,
        presence_tol_x: float = 0.48,
        presence_tol_y: float = 0.48,
    ) -> MeshDetectResult:
        h, w = bgr.shape[:2]
        if h < 32 or w < 32:
            return MeshDetectResult(found=False, reason="bad_frame")

        self._detector.setInputSize((w, h))
        _, faces = self._detector.detect(bgr)
        if faces is None or len(faces) == 0:
            return MeshDetectResult(found=False, reason="no_face")

        faces = sorted(faces, key=lambda f: float(f[2]) * float(f[3]), reverse=True)
        face = faces[0]
        score = float(face[-1])
        x, y, fw, fh = [int(v) for v in face[:4]]
        box = (x, y, fw, fh)

        if score < min_score:
            return MeshDetectResult(found=False, reason="low_score", box=box)
        if fw < min_px or fh < min_px:
            return MeshDetectResult(found=False, reason="too_small", box=box)

        if for_presence:
            if fw / max(w, 1) < presence_frac_w or fh / max(h, 1) < presence_frac_h:
                return MeshDetectResult(found=False, reason="too_far", box=box)
            cx = (x + fw * 0.5) / max(w, 1)
            cy = (y + fh * 0.5) / max(h, 1)
            if abs(cx - 0.5) > presence_tol_x or abs(cy - 0.5) > presence_tol_y:
                return MeshDetectResult(found=False, reason="out_of_field", box=box)

        aligned = self._recognizer.alignCrop(bgr, face)
        feat = self._recognizer.feature(aligned)
        vec = np.asarray(feat, dtype=np.float32).reshape(-1)
        n = float(np.linalg.norm(vec))
        if n < 1e-8:
            return MeshDetectResult(found=False, reason="no_face", box=box)
        vec = vec / n
        area_ratio = (fw * fh) / float(h * w)
        quality = float(np.clip(score * 0.7 + min(area_ratio * 8, 1.0) * 0.3, 0, 1))
        return MeshDetectResult(found=True, embedding=vec, box=box, quality=quality)
