"""Télécharge le modèle MediaPipe Face Landmarker dans vision/data/."""
from __future__ import annotations

from pathlib import Path
from urllib.request import urlretrieve

DATA = Path(__file__).resolve().parent / "data"

FACE_LANDMARKER = "face_landmarker.task"
FACE_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)

# Legacy OpenCV zoo (optionnel, plus utilisé par FaceEngine)
LEGACY = {
    "face_detection_yunet_2023mar.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
}


def _fetch(name: str, url: str) -> None:
    dest = DATA / name
    if dest.exists() and dest.stat().st_size > 10_000:
        print("OK", name, dest.stat().st_size)
        return
    print("DL", name, "...")
    urlretrieve(url, dest)
    print("OK", name, dest.stat().st_size)


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    _fetch(FACE_LANDMARKER, FACE_LANDMARKER_URL)
    for name, url in LEGACY.items():
        _fetch(name, url)


if __name__ == "__main__":
    main()
