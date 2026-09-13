"""Télécharge MediaPipe Face Landmarker + modèles OpenCV YuNet/SFace."""
from __future__ import annotations

from pathlib import Path
from urllib.request import urlretrieve

DATA = Path(__file__).resolve().parent / "data"

FACE_LANDMARKER = "face_landmarker.task"
FACE_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)

# OpenCV zoo — utilisés par FaceEngine (JARVIS_FACE_BACKEND=opencv)
OPENCV_MODELS = {
    "face_detection_yunet_2023mar.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        100_000,
        500_000,
    ),
    "face_recognition_sface_2021dec.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        20_000_000,
        50_000_000,
    ),
}


def _fetch(name: str, url: str, *, min_size: int = 10_000, max_size: int | None = None) -> None:
    dest = DATA / name
    if dest.exists():
        size = dest.stat().st_size
        if size > min_size and (max_size is None or size < max_size):
            print("OK", name, size)
            return
        print("BAD", name, size, "→ re-téléchargement")
        dest.unlink(missing_ok=True)
    print("DL", name, "...")
    urlretrieve(url, dest)
    print("OK", name, dest.stat().st_size)


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    _fetch(FACE_LANDMARKER, FACE_LANDMARKER_URL, min_size=1_000_000)
    for name, (url, lo, hi) in OPENCV_MODELS.items():
        _fetch(name, url, min_size=lo, max_size=hi)


if __name__ == "__main__":
    main()
