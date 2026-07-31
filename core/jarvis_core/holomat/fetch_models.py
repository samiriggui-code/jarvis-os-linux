"""Télécharge YuNet + SFace dans holomat/data/."""
from __future__ import annotations

from pathlib import Path
from urllib.request import urlretrieve

DATA = Path(__file__).resolve().parent / "data"
FILES = {
    "face_detection_yunet_2023mar.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
}


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        dest = DATA / name
        if dest.exists() and dest.stat().st_size > 10_000:
            print("OK", name, dest.stat().st_size)
            continue
        print("DL", name, "…")
        urlretrieve(url, dest)
        print("OK", name, dest.stat().st_size)


if __name__ == "__main__":
    main()
