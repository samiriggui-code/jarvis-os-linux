"""MediaPipe Face Mesh / Landmarker — détection + embedding landmarks (Core only)."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.request import urlretrieve

import cv2
import numpy as np

logger = logging.getLogger("jarvis.vision.face_mesh")

DATA = Path(__file__).resolve().parent / "data"
LANDMARKER_PATH = DATA / "face_landmarker.task"
LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)

LANDMARK_COUNT = 468
NOSE_TIP = 1
LEFT_EYE_OUTER = 33
RIGHT_EYE_OUTER = 263
EMBEDDING_DIM = LANDMARK_COUNT * 3
ALGO_NAME = "mediapipe_facemesh"


@dataclass
class MeshDetectResult:
    found: bool
    embedding: np.ndarray | None = None
    box: tuple[int, int, int, int] | None = None
    quality: float = 0.0
    reason: str | None = None


def _ensure_landmarker_model() -> Path:
    DATA.mkdir(parents=True, exist_ok=True)
    if LANDMARKER_PATH.exists() and LANDMARKER_PATH.stat().st_size > 10_000:
        return LANDMARKER_PATH
    logger.info("Téléchargement face_landmarker.task …")
    urlretrieve(LANDMARKER_URL, LANDMARKER_PATH)
    return LANDMARKER_PATH


def embedding_from_landmarks(landmarks: Any) -> np.ndarray:
    """468 points normalisés : centre nez, échelle inter-oculaire."""
    if hasattr(landmarks, "landmark"):
        pts_src = landmarks.landmark[:LANDMARK_COUNT]
    else:
        pts_src = landmarks[:LANDMARK_COUNT]
    pts = np.array([[lm.x, lm.y, lm.z] for lm in pts_src], dtype=np.float32)
    nose = pts[NOSE_TIP]
    scale = float(np.linalg.norm(pts[RIGHT_EYE_OUTER] - pts[LEFT_EYE_OUTER])) + 1e-8
    vec = ((pts - nose) / scale).reshape(-1)
    norm = float(np.linalg.norm(vec))
    if norm < 1e-8:
        return vec.astype(np.float32)
    return (vec / norm).astype(np.float32)


class _TasksLandmarker:
    """MediaPipe >= 1.0 — FaceLandmarker (tasks API)."""

    def __init__(self, model_path: Path) -> None:
        from mediapipe.tasks.python import vision
        from mediapipe.tasks.python.core import base_options as base_options_module

        opts = vision.FaceLandmarkerOptions(
            base_options=base_options_module.BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.IMAGE,
            num_faces=1,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        self._detector = vision.FaceLandmarker.create_from_options(opts)
        self._vision = vision

    def close(self) -> None:
        self._detector.close()

    def process(self, rgb: np.ndarray) -> list[Any]:
        import mediapipe as mp

        if not rgb.flags["C_CONTIGUOUS"]:
            rgb = np.ascontiguousarray(rgb)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._detector.detect(mp_image)
        return list(result.face_landmarks or [])


class _LegacyFaceMesh:
    """MediaPipe 0.10.x — solutions.face_mesh."""

    def __init__(self) -> None:
        import mediapipe as mp

        self._mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def close(self) -> None:
        self._mesh.close()

    def process(self, rgb: np.ndarray) -> list[Any]:
        results = self._mesh.process(rgb)
        return list(results.multi_face_landmarks or [])


class FaceMeshBackend:
    """Wrapper MediaPipe — 468 landmarks, 1 visage par frame."""

    def __init__(self) -> None:
        try:
            import mediapipe as mp  # noqa: F401
        except ImportError as exc:
            raise RuntimeError(
                "mediapipe requis — pip install mediapipe "
                "(python -m jarvis_core.vision.fetch_models pour le .task)"
            ) from exc

        self._impl: _TasksLandmarker | _LegacyFaceMesh
        try:
            model = _ensure_landmarker_model()
            self._impl = _TasksLandmarker(model)
            backend = "tasks"
        except Exception as exc:
            logger.warning("FaceLandmarker tasks indisponible (%s) — fallback solutions", exc)
            self._impl = _LegacyFaceMesh()
            backend = "solutions"

        logger.info("FaceMesh prêt · %d landmarks · %s · backend=%s", LANDMARK_COUNT, ALGO_NAME, backend)

    def close(self) -> None:
        self._impl.close()

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

        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        faces = self._impl.process(rgb)
        if not faces:
            return MeshDetectResult(found=False, reason="no_face")

        lm = faces[0]
        if hasattr(lm, "landmark"):
            xs = [p.x for p in lm.landmark[:LANDMARK_COUNT]]
            ys = [p.y for p in lm.landmark[:LANDMARK_COUNT]]
        else:
            xs = [p.x for p in lm[:LANDMARK_COUNT]]
            ys = [p.y for p in lm[:LANDMARK_COUNT]]

        x0, x1 = min(xs), max(xs)
        y0, y1 = min(ys), max(ys)
        bx = int(x0 * w)
        by = int(y0 * h)
        bw = max(1, int((x1 - x0) * w))
        bh = max(1, int((y1 - y0) * h))
        box = (bx, by, bw, bh)

        if bw < min_px or bh < min_px:
            return MeshDetectResult(found=False, reason="too_small", box=box)

        area_ratio = (bw * bh) / float(h * w)
        score = float(np.clip(0.55 + area_ratio * 4.0, 0.0, 1.0))
        if score < min_score:
            return MeshDetectResult(found=False, reason="low_score", box=box)

        if for_presence:
            if bw / max(w, 1) < presence_frac_w or bh / max(h, 1) < presence_frac_h:
                return MeshDetectResult(found=False, reason="too_far", box=box)
            cx = (bx + bw * 0.5) / max(w, 1)
            cy = (by + bh * 0.5) / max(h, 1)
            if abs(cx - 0.5) > presence_tol_x or abs(cy - 0.5) > presence_tol_y:
                return MeshDetectResult(found=False, reason="out_of_field", box=box)

        emb = embedding_from_landmarks(lm)
        quality = float(np.clip(score * 0.7 + min(area_ratio * 8, 1.0) * 0.3, 0, 1))
        return MeshDetectResult(found=True, embedding=emb, box=box, quality=quality)
