"""Phase 2 — smoke multi-profil face (cross-identify offline).

Vérifie que FaceEngine.scanne tous les profils disque et choisit le meilleur match :
  - embedding A → user A (FACE_SUCCESS)
  - embedding B → user B (FACE_SUCCESS)
  - embedding bruit → sous seuil (FACE_PROGRESS, pas SUCCESS)
  - filtre username=ines → seulement Ines

Sans webcam ni MediaPipe : detect_and_embed est mocké ; profils = embeddings synthétiques.

Usage :
  python -m jarvis_core._smoke_face_multi
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from typing import Callable
from unittest.mock import patch

import numpy as np

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.vision.face_engine import (  # noqa: E402
    FaceDetectResult,
    FaceEngine,
    VERIFY_THRESHOLD,
)
from jarvis_core.vision.face_mesh import ALGO_NAME, EMBEDDING_DIM, LANDMARK_COUNT  # noqa: E402

UID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
UID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
NAME_A = "samir"
NAME_B = "ines"


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def _unit_vec(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.standard_normal(EMBEDDING_DIM).astype(np.float32)
    return v / (np.linalg.norm(v) + 1e-8)


def _write_profile(root: Path, user_id: str, username: str, embedding: np.ndarray) -> None:
    path = root / "users" / user_id / "face_profile"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 3,
        "algo": ALGO_NAME,
        "username": username,
        "user_id": user_id,
        "embedding": embedding.astype(np.float32).tolist(),
        "samples": 8,
        "threshold": VERIFY_THRESHOLD,
        "landmarks": LANDMARK_COUNT,
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def _patch_data_dir(data_dir: Path) -> Callable[[], None]:
    import jarvis_core.auth.db as auth_db
    import jarvis_core.db.config as cfg

    original_cfg = cfg.default_data_dir
    original_auth = auth_db.default_data_dir
    cfg.default_data_dir = lambda: data_dir  # type: ignore[method-assign]
    auth_db.default_data_dir = lambda: data_dir  # type: ignore[method-assign]

    def restore() -> None:
        cfg.default_data_dir = original_cfg  # type: ignore[method-assign]
        auth_db.default_data_dir = original_auth  # type: ignore[method-assign]

    return restore


def _fake_jpeg_b64() -> str:
    return "fake"


def run() -> None:
    emb_a = _unit_vec(42)
    emb_b = _unit_vec(99)
    check("embeddings distincts (cosine < 0.5)", float(np.dot(emb_a, emb_b)) < 0.5)

    with tempfile.TemporaryDirectory(prefix="jarvis_face_multi_") as tmp:
        data = Path(tmp)
        _write_profile(data, UID_A, NAME_A, emb_a)
        _write_profile(data, UID_B, NAME_B, emb_b)

        restore = _patch_data_dir(data)
        try:
            engine = FaceEngine()
        except Exception as exc:
            print(f"  [SKIP] FaceEngine indisponible — {exc}")
            restore()
            return
        finally:
            pass

        def mock_detect(_img, *, for_presence: bool = False) -> FaceDetectResult:
            del for_presence
            emb = mock_detect.current  # type: ignore[attr-defined]
            return FaceDetectResult(found=True, embedding=emb, box=(10, 10, 80, 80), quality=1.0)

        mock_detect.current = emb_a  # type: ignore[attr-defined]

        try:
            with patch.object(engine, "detect_and_embed", side_effect=mock_detect):
                with patch.object(engine, "decode_jpeg_b64", return_value=np.zeros((96, 96, 3), dtype=np.uint8)):
                    # Scan global → Samir
                    mock_detect.current = emb_a  # type: ignore[attr-defined]
                    r_a = engine.verify_frame(_fake_jpeg_b64())
                    check("verify A → FACE_SUCCESS", r_a.get("type") == "FACE_SUCCESS", str(r_a))
                    check("verify A → samir", r_a.get("user_id") == UID_A and r_a.get("username") == NAME_A)

                    # Scan global → Ines
                    mock_detect.current = emb_b  # type: ignore[attr-defined]
                    r_b = engine.verify_frame(_fake_jpeg_b64())
                    check("verify B → FACE_SUCCESS", r_b.get("type") == "FACE_SUCCESS", str(r_b))
                    check("verify B → ines", r_b.get("user_id") == UID_B and r_b.get("username") == NAME_B)

                    # Bruit → pas de match au seuil
                    noise = _unit_vec(777)
                    while float(np.dot(noise, emb_a)) >= VERIFY_THRESHOLD or float(np.dot(noise, emb_b)) >= VERIFY_THRESHOLD:
                        noise = _unit_vec(int(np.random.randint(1000, 9999)))
                    mock_detect.current = noise  # type: ignore[attr-defined]
                    r_n = engine.verify_frame(_fake_jpeg_b64())
                    check(
                        "bruit → pas FACE_SUCCESS",
                        r_n.get("type") != "FACE_SUCCESS",
                        f"type={r_n.get('type')} conf={r_n.get('confidence')}",
                    )

                    # Filtre username
                    mock_detect.current = emb_a  # type: ignore[attr-defined]
                    r_filter = engine.verify_frame(_fake_jpeg_b64(), username=NAME_B)
                    check(
                        "filtre username=ines + visage samir → pas SUCCESS samir",
                        r_filter.get("type") != "FACE_SUCCESS" or r_filter.get("user_id") != UID_A,
                        f"type={r_filter.get('type')} user={r_filter.get('username')}",
                    )

                    candidates = engine._scan_disk_candidates()
                    check("2 profils sur disque", len(candidates) == 2, f"n={len(candidates)}")
        finally:
            restore()

    print("\nPHASE2 face multi-profil : PASS")


def main() -> int:
    print("PHASE2 face multi-profil (cross-identify offline)")
    run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
