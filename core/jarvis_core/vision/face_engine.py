"""
Holomat FaceEngine — MediaPipe Face Mesh (Core).

468 landmarks → embedding normalisé → cosine match multi-profil.
Cahier §6.8 — tout le pipeline auth faciale vit ici, pas dans le HUD.
"""
from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .face_mesh import FaceMeshBackend, LANDMARK_COUNT
from .opencv_face import (
    ALGO_NAME as OPENCV_ALGO,
    VERIFY_THRESHOLD as OPENCV_THRESHOLD,
    OpenCvSFaceBackend,
    cpu_has_avx,
)

logger = logging.getLogger("jarvis.vision.face")

ENROLL_SAMPLES_NEEDED = 8
# Seuil MediaPipe Face Mesh (cosine landmarks) — SFace utilise OPENCV_THRESHOLD.
VERIFY_THRESHOLD_MESH = 0.88
MIN_FACE_SCORE = 0.5
MIN_FACE_PX = 28
PRESENCE_FRAC_W = 0.05
PRESENCE_FRAC_H = 0.06
PRESENCE_CENTER_TOL_X = 0.48
PRESENCE_CENTER_TOL_Y = 0.48
PRESENCE_HITS_NEEDED = 2

# Compat imports / smokes
VERIFY_THRESHOLD = VERIFY_THRESHOLD_MESH
ALGO_NAME = "mediapipe_facemesh"
EMBEDDING_DIM = LANDMARK_COUNT * 3


@dataclass
class FaceDetectResult:
    found: bool
    embedding: np.ndarray | None = None
    box: tuple[int, int, int, int] | None = None
    quality: float = 0.0
    reason: str | None = None


@dataclass
class EnrollBuffer:
    user_id: str
    username: str
    samples: list[np.ndarray] = field(default_factory=list)

    @property
    def progress(self) -> float:
        return min(100.0, 100.0 * len(self.samples) / ENROLL_SAMPLES_NEEDED)


class FaceEngine:
    def __init__(self) -> None:
        # NUC sans AVX : importer MediaPipe tue le process (SIGILL). Jamais.
        use_mesh = cpu_has_avx()
        if use_mesh:
            try:
                self._backend = FaceMeshBackend()
                self._algo = "mediapipe_facemesh"
                self._threshold = VERIFY_THRESHOLD_MESH
                self._landmarks = LANDMARK_COUNT
            except Exception as exc:  # noqa: BLE001
                logger.warning("MediaPipe Face Mesh indisponible (%s) — OpenCV SFace", exc)
                use_mesh = False
        if not use_mesh:
            self._backend = OpenCvSFaceBackend()
            self._algo = OPENCV_ALGO
            self._threshold = OPENCV_THRESHOLD
            self._landmarks = 0
        self._enroll: dict[str, EnrollBuffer] = {}
        logger.info("FaceEngine prêt · %s · seuil=%.3f", self._algo, self._threshold)

    def decode_jpeg_b64(self, jpeg_b64: str) -> np.ndarray | None:
        try:
            raw = base64.b64decode(jpeg_b64, validate=False)
            arr = np.frombuffer(raw, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            return img
        except Exception as exc:  # noqa: BLE001
            logger.warning("decode jpeg failed: %s", exc)
            return None

    def detect_and_embed(
        self,
        bgr: np.ndarray,
        *,
        for_presence: bool = False,
    ) -> FaceDetectResult:
        mesh = self._backend.detect_and_embed(
            bgr,
            for_presence=for_presence,
            min_score=MIN_FACE_SCORE,
            min_px=MIN_FACE_PX,
            presence_frac_w=PRESENCE_FRAC_W,
            presence_frac_h=PRESENCE_FRAC_H,
            presence_tol_x=PRESENCE_CENTER_TOL_X,
            presence_tol_y=PRESENCE_CENTER_TOL_Y,
        )
        return FaceDetectResult(
            found=mesh.found,
            embedding=mesh.embedding,
            box=mesh.box,
            quality=mesh.quality,
            reason=mesh.reason,
        )

    def enroll_begin(self, user_id: str, username: str = "") -> None:
        key = user_id.strip()
        if not key:
            raise ValueError("user_id requis pour enroll_begin")
        label = (username or key).strip()
        self._enroll[key] = EnrollBuffer(user_id=key, username=label)

    def enroll_add_frame(
        self,
        user_id: str,
        jpeg_b64: str,
        *,
        username: str = "",
    ) -> dict[str, Any]:
        key = user_id.strip()
        if not key:
            return {"type": "holomat_error", "error": "user_id requis pour enroll"}
        buf = self._enroll.get(key)
        if buf is None:
            self.enroll_begin(key, username)
            buf = self._enroll[key]

        img = self.decode_jpeg_b64(jpeg_b64)
        if img is None:
            return self._progress_enroll(buf, 0.0, "bad_frame", False, "Frame invalide")

        det = self.detect_and_embed(img)
        if not det.found or det.embedding is None:
            phase = "obstruction" if det.reason in ("too_small", "low_score") else "camera_on"
            return self._progress_enroll(
                buf, 0.0, det.reason or "no_face", False,
                "Placez votre visage face à la caméra",
                phase=phase,
            )

        buf.samples.append(det.embedding)
        if len(buf.samples) > ENROLL_SAMPLES_NEEDED:
            buf.samples = buf.samples[-ENROLL_SAMPLES_NEEDED:]

        done = len(buf.samples) >= ENROLL_SAMPLES_NEEDED
        ev = self._progress_enroll(
            buf, det.quality, "ok", True, f"FACIAL MATRIX {int(buf.progress)}%",
            phase="reconstruction",
        )
        if det.box is not None:
            box = self._norm_box(det, img)
            if box:
                ev["box"] = box
        if done:
            ev.update({
                "type": "FACE_SUCCESS",
                "phase": "success",
                "mode": "enroll",
                "progress": 100,
                "hudText": "EMPREINTE FACIALE ACQUISE",
                "hudSubtext": f"{len(buf.samples)} samples",
            })
        return ev

    def _progress_enroll(
        self,
        buf: EnrollBuffer,
        confidence: float,
        reason: str,
        face_found: bool,
        subtext: str,
        *,
        phase: str = "camera_on",
    ) -> dict[str, Any]:
        return {
            "type": "FACE_PROGRESS",
            "progress": buf.progress,
            "confidence": confidence,
            "phase": phase,
            "reason": reason,
            "samples": len(buf.samples),
            "needed": ENROLL_SAMPLES_NEEDED,
            "face_found": face_found,
            "mode": "enroll",
            "user_id": buf.user_id,
            "hudText": "BIOMETRIC SYNTHESIS" if face_found else "OPTICAL SENSOR ONLINE",
            "hudSubtext": subtext,
        }

    def enroll_commit(self, user_id: str, username: str = "") -> dict[str, Any]:
        key = user_id.strip()
        if not key:
            return {"ok": False, "error": "user_id requis"}
        buf = self._enroll.get(key)
        if not buf or len(buf.samples) < max(3, ENROLL_SAMPLES_NEEDED // 2):
            return {"ok": False, "error": "pas assez d'échantillons faciaux"}
        mean = np.mean(np.stack(buf.samples, axis=0), axis=0)
        mean = mean / (np.linalg.norm(mean) + 1e-8)
        path = self._profile_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        label = (username or buf.username or key).strip()
        payload = {
            "version": 3,
            "algo": self._algo,
            "username": label,
            "user_id": key,
            "embedding": mean.astype(np.float32).tolist(),
            "samples": len(buf.samples),
            "threshold": self._threshold,
            "landmarks": self._landmarks,
        }
        path.write_text(json.dumps(payload), encoding="utf-8")
        self._enroll.pop(key, None)
        logger.info("face_profile écrit %s (%d samples, %s)", path, len(buf.samples), self._algo)
        return {"ok": True, "path": str(path), "samples": payload["samples"]}

    def reset_face_profile(self, user_id: str) -> dict[str, Any]:
        """Efface le profil facial d'un seul utilisateur (ré-enrôlement ciblé)."""
        key = user_id.strip()
        if not key:
            return {"ok": False, "error": "user_id requis"}
        removed = False
        path = self._profile_path(key)
        if path.is_file():
            try:
                path.unlink()
                removed = True
            except OSError as exc:
                logger.warning("face_profile non supprimé %s: %s", path, exc)
                return {"ok": False, "error": str(exc)}
        self._enroll.pop(key, None)
        return {"ok": True, "user_id": key, "removed": removed}

    def reset_all_face_profiles(self) -> dict[str, Any]:
        """Efface face + phrase vocale disque — smoke vault / ré-enrôlement."""
        from ..auth.db import default_data_dir

        users_dir = default_data_dir() / "users"
        removed_face = 0
        removed_voice = 0
        user_ids: list[str] = []
        if users_dir.is_dir():
            for entry in users_dir.iterdir():
                if not entry.is_dir():
                    continue
                touched = False
                for name in ("face_profile", "voice_auth_phrase.json"):
                    fp = entry / name
                    if fp.is_file() and fp.stat().st_size > 0:
                        try:
                            fp.unlink()
                            if name == "face_profile":
                                removed_face += 1
                            else:
                                removed_voice += 1
                            touched = True
                        except OSError as exc:
                            logger.warning("%s non supprimé %s: %s", name, fp, exc)
                if touched:
                    user_ids.append(entry.name)
        self._enroll.clear()
        logger.info(
            "biometric reset dev · face=%d · voice=%d",
            removed_face,
            removed_voice,
        )
        return {
            "ok": True,
            "removed": removed_face,
            "removed_face": removed_face,
            "removed_voice": removed_voice,
            "user_ids": user_ids,
        }

    def verify_frame(self, jpeg_b64: str, *, username: str | None = None, user_id: str | None = None) -> dict[str, Any]:
        img = self.decode_jpeg_b64(jpeg_b64)
        if img is None:
            return {
                "type": "FACE_PROGRESS",
                "progress": 0,
                "confidence": 0,
                "phase": "camera_on",
                "reason": "bad_frame",
                "face_found": False,
            }

        det = self.detect_and_embed(img)
        if not det.found or det.embedding is None:
            ev = {
                "type": "FACE_PROGRESS",
                "progress": 5,
                "confidence": 0.0,
                "phase": "obstruction" if det.reason == "too_small" else "camera_on",
                "reason": det.reason,
                "face_found": False,
                "hudText": "SCAN FACIAL",
                "hudSubtext": self._miss_message(det.reason),
            }
            box = self._norm_box(det, img)
            if box:
                ev["box"] = box
            return ev

        matches = self._load_candidates(username=username, user_id=user_id)
        if not matches and (username or user_id):
            matches = self._load_candidates(username=None, user_id=None)
        if not matches:
            ev = {
                "type": "FACE_FAILED",
                "reason": "no_profile",
                "face_found": True,
                "hudText": "PROFIL INCONNU",
                "hudSubtext": "Aucun profil facial — ré-enrôlement requis",
            }
            box = self._norm_box(det, img)
            if box:
                ev["box"] = box
            return ev

        best_id = None
        best_name = None
        best_score = -1.0
        for uid, uname, emb in matches:
            score = float(np.dot(det.embedding, emb))
            if score > best_score:
                best_score = score
                best_id = uid
                best_name = uname

        progress = float(np.clip(best_score / max(self._threshold, 1e-3) * 95.0, 0, 99))
        box = self._norm_box(det, img)
        if best_score >= self._threshold and best_id:
            ev = {
                "type": "FACE_SUCCESS",
                "progress": 100,
                "confidence": best_score,
                "phase": "success",
                "mode": "verify",
                "user_id": best_id,
                "username": best_name,
                "face_found": True,
                "hudText": "SIGNATURE VALIDÉE",
                "hudSubtext": f"conf {best_score:.2f}",
            }
            if box:
                ev["box"] = box
            return ev

        ev = {
            "type": "FACE_PROGRESS",
            "progress": progress,
            "confidence": max(0.0, best_score),
            "phase": "reconstruction",
            "face_found": True,
            "hudText": "BIOMETRIC SYNTHESIS",
            "hudSubtext": f"FACIAL MATRIX {int(progress)}%",
        }
        if box:
            ev["box"] = box
        return ev

    @staticmethod
    def _norm_box(det: FaceDetectResult, img: np.ndarray) -> dict[str, float] | None:
        if det.box is None:
            return None
        ih, iw = img.shape[:2]
        bx, by, bw, bh = det.box
        return {
            "x": bx / max(iw, 1),
            "y": by / max(ih, 1),
            "w": bw / max(iw, 1),
            "h": bh / max(ih, 1),
        }

    @staticmethod
    def _miss_message(reason: str | None) -> str:
        if reason == "no_face":
            return "Visage non détecté"
        if reason == "too_far":
            return "Trop loin — approchez-vous"
        if reason == "out_of_field":
            return "Hors champ d'authentification"
        return "Approchez-vous"

    def _profile_path(self, user_id: str) -> Path:
        from ..auth.db import default_data_dir

        return default_data_dir() / "users" / user_id / "face_profile"

    def _load_embedding(self, user_id: str) -> np.ndarray | None:
        path = self._profile_path(user_id)
        if not path.exists() or path.stat().st_size < 8:
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            algo = str(data.get("algo") or "")
            if algo and algo != self._algo:
                logger.debug("face_profile algo incompatible %s (attendu %s)", algo, self._algo)
                return None
            emb = np.array(data["embedding"], dtype=np.float32)
            # Mesh = 1404, SFace = 128 — sinon ré-enrôler
            expected = EMBEDDING_DIM if self._algo == "mediapipe_facemesh" else 128
            if emb.size != expected:
                logger.debug("face_profile dim %s != %s — ré-enrôler", emb.size, expected)
                return None
            n = np.linalg.norm(emb)
            if n < 1e-6:
                return None
            return emb / n
        except Exception as exc:  # noqa: BLE001
            logger.warning("face_profile illisible %s: %s", path, exc)
            return None

    def _profile_username(self, user_id: str) -> str:
        path = self._profile_path(user_id)
        if not path.exists():
            return user_id
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return str(data.get("username") or user_id).strip() or user_id
        except Exception:  # noqa: BLE001
            return user_id

    def _scan_disk_candidates(
        self,
        *,
        user_id: str | None = None,
        username: str | None = None,
    ) -> list[tuple[str, str, np.ndarray]]:
        from ..auth.db import default_data_dir

        out: list[tuple[str, str, np.ndarray]] = []
        root = default_data_dir() / "users"
        if not root.is_dir():
            return out
        want_uid = (user_id or "").strip() or None
        want_name = (username or "").strip().lower() or None
        for d in root.iterdir():
            if not d.is_dir():
                continue
            uid = d.name
            if want_uid and uid != want_uid:
                continue
            emb = self._load_embedding(uid)
            if emb is None:
                continue
            uname = self._profile_username(uid)
            if want_name and uname.lower() != want_name:
                continue
            out.append((uid, uname, emb))
        return out

    def _load_candidates(
        self, *, username: str | None, user_id: str | None
    ) -> list[tuple[str, str, np.ndarray]]:
        """Profils faciaux sur disque — ne dépend pas de PostgreSQL."""
        if user_id:
            uid = user_id.strip()
            emb = self._load_embedding(uid)
            if emb is not None:
                return [(uid, self._profile_username(uid), emb)]
            return self._scan_disk_candidates(user_id=uid)

        if username:
            found = self._scan_disk_candidates(username=username)
            if found:
                return found

        return self._scan_disk_candidates()
