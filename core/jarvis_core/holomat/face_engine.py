"""
Holomat FaceEngine — OpenCV 5 FaceDetectorYN + FaceRecognizerSF (SFace).

Modèles ONNX dans holomat/data/ (opencv_zoo).
Cahier §6.8 — plugin Core, pas dans le HUD.
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

from ..auth.db import default_data_dir

logger = logging.getLogger("jarvis.holomat.face")

DATA = Path(__file__).resolve().parent / "data"
YUNET = DATA / "face_detection_yunet_2023mar.onnx"
SFACE = DATA / "face_recognition_sface_2021dec.onnx"

ENROLL_SAMPLES_NEEDED = 8
# SFace cosine : docs OpenCV ~0.363 pour match — on vise un peu plus strict
VERIFY_THRESHOLD = 0.363
# Détection de base (enroll / verify) : visage YuNet crédible.
# Le « champ auth » (présence) est plus souple : enfant devant TV + cam USB
# large → visage souvent < 12 % et un peu bas dans le cadre.
MIN_FACE_SCORE = 0.55
MIN_FACE_PX = 28
# Présence : assez visible pour parler, pas un point au fond du salon.
PRESENCE_FRAC_W = 0.05
PRESENCE_FRAC_H = 0.06
PRESENCE_CENTER_TOL_X = 0.48
PRESENCE_CENTER_TOL_Y = 0.48
PRESENCE_HITS_NEEDED = 2


@dataclass
class FaceDetectResult:
    found: bool
    embedding: np.ndarray | None = None
    box: tuple[int, int, int, int] | None = None
    quality: float = 0.0
    reason: str | None = None


@dataclass
class EnrollBuffer:
    username: str
    samples: list[np.ndarray] = field(default_factory=list)

    @property
    def progress(self) -> float:
        return min(100.0, 100.0 * len(self.samples) / ENROLL_SAMPLES_NEEDED)


class FaceEngine:
    def __init__(self) -> None:
        if not YUNET.exists() or not SFACE.exists():
            raise RuntimeError(
                f"Modèles ONNX manquants sous {DATA} "
                "(face_detection_yunet_*.onnx + face_recognition_sface_*.onnx)"
            )
        # scoreThreshold bas : enfants / profil / lumière salon TV.
        self._detector = cv2.FaceDetectorYN_create(str(YUNET), "", (320, 320), 0.55, 0.3, 5000)
        self._recognizer = cv2.FaceRecognizerSF_create(str(SFACE), "")
        self._enroll: dict[str, EnrollBuffer] = {}
        logger.info("FaceEngine prêt · YuNet + SFace")

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
        """Détecte un visage + embedding SFace.

        `for_presence=True` : filtre « devant la cam » (annonce auth).
        Sinon (enroll / verify) : tout visage YuNet crédible compte — un enfant
        un peu bas / un peu loin doit quand même s'enrôler.
        """
        h, w = bgr.shape[:2]
        self._detector.setInputSize((w, h))
        _, faces = self._detector.detect(bgr)
        if faces is None or len(faces) == 0:
            return FaceDetectResult(found=False, reason="no_face")

        # faces: [x,y,w,h, x_re,y_re, x_le,y_le, x_nt,y_nt, x_rcm,y_rcm, x_lcm,y_lcm, score]
        faces = sorted(faces, key=lambda f: float(f[2]) * float(f[3]), reverse=True)
        face = faces[0]
        score = float(face[-1])
        x, y, fw, fh = [int(v) for v in face[:4]]
        if score < MIN_FACE_SCORE:
            return FaceDetectResult(found=False, reason="low_score", box=(x, y, fw, fh))
        if fw < MIN_FACE_PX or fh < MIN_FACE_PX:
            return FaceDetectResult(found=False, reason="too_small", box=(x, y, fw, fh))

        if for_presence:
            if fw / max(w, 1) < PRESENCE_FRAC_W or fh / max(h, 1) < PRESENCE_FRAC_H:
                return FaceDetectResult(found=False, reason="too_far", box=(x, y, fw, fh))
            cx = (x + fw * 0.5) / max(w, 1)
            cy = (y + fh * 0.5) / max(h, 1)
            if abs(cx - 0.5) > PRESENCE_CENTER_TOL_X or abs(cy - 0.5) > PRESENCE_CENTER_TOL_Y:
                return FaceDetectResult(found=False, reason="out_of_field", box=(x, y, fw, fh))

        aligned = self._recognizer.alignCrop(bgr, face)
        feat = self._recognizer.feature(aligned)
        vec = np.asarray(feat, dtype=np.float32).reshape(-1)
        n = np.linalg.norm(vec)
        if n < 1e-8:
            return FaceDetectResult(found=False, reason="no_face")
        vec = vec / n
        area_ratio = (fw * fh) / float(h * w)
        quality = float(np.clip(score * 0.7 + min(area_ratio * 8, 1.0) * 0.3, 0, 1))
        return FaceDetectResult(found=True, embedding=vec, box=(x, y, fw, fh), quality=quality)

    def enroll_begin(self, username: str) -> None:
        key = username.strip().lower()
        self._enroll[key] = EnrollBuffer(username=username.strip())

    def enroll_add_frame(self, username: str, jpeg_b64: str) -> dict[str, Any]:
        key = username.strip().lower()
        buf = self._enroll.get(key)
        if buf is None:
            self.enroll_begin(username)
            buf = self._enroll[key]

        img = self.decode_jpeg_b64(jpeg_b64)
        if img is None:
            return {
                "type": "FACE_PROGRESS",
                "progress": buf.progress,
                "confidence": 0.0,
                "phase": "camera_on",
                "reason": "bad_frame",
                "face_found": False,
                "hudText": "OPTICAL SENSOR ONLINE",
                "hudSubtext": "Frame invalide",
            }

        det = self.detect_and_embed(img)
        if not det.found or det.embedding is None:
            phase = "obstruction" if det.reason in ("too_small", "low_score") else "camera_on"
            return {
                "type": "FACE_PROGRESS",
                "progress": buf.progress,
                "confidence": 0.0,
                "phase": phase,
                "reason": det.reason,
                "face_found": False,
                "hudText": "OPTICAL SENSOR ONLINE",
                "hudSubtext": "Placez votre visage face à la caméra",
            }

        # Chaque détection valide = 1 sample (8 → 100 %).
        # Pas de dédup agressif : un visage immobile a cosine ~0.99+ et
        # bloquait l’enrôlement à 12.5 % (1/8).
        buf.samples.append(det.embedding)

        if len(buf.samples) > ENROLL_SAMPLES_NEEDED:
            buf.samples = buf.samples[-ENROLL_SAMPLES_NEEDED:]

        done = len(buf.samples) >= ENROLL_SAMPLES_NEEDED
        ev: dict[str, Any] = {
            "type": "FACE_PROGRESS",
            "progress": buf.progress,
            "confidence": float(det.quality),
            "phase": "reconstruction",
            "samples": len(buf.samples),
            "needed": ENROLL_SAMPLES_NEEDED,
            "face_found": True,
            "hudText": "BIOMETRIC SYNTHESIS",
            "hudSubtext": f"FACIAL MATRIX {int(buf.progress)}%",
        }
        if det.box is not None:
            ih, iw = img.shape[:2]
            bx, by, bw, bh = det.box
            ev["box"] = {
                "x": bx / max(iw, 1),
                "y": by / max(ih, 1),
                "w": bw / max(iw, 1),
                "h": bh / max(ih, 1),
            }
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

    def enroll_commit(self, username: str, user_id: str) -> dict[str, Any]:
        key = username.strip().lower()
        buf = self._enroll.get(key)
        if not buf or len(buf.samples) < max(3, ENROLL_SAMPLES_NEEDED // 2):
            return {"ok": False, "error": "pas assez d'échantillons faciaux"}
        mean = np.mean(np.stack(buf.samples, axis=0), axis=0)
        mean = mean / (np.linalg.norm(mean) + 1e-8)
        path = self._profile_path(user_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 2,
            "algo": "opencv_sface",
            "username": username,
            "user_id": user_id,
            "embedding": mean.astype(np.float32).tolist(),
            "samples": len(buf.samples),
            "threshold": VERIFY_THRESHOLD,
        }
        path.write_text(json.dumps(payload), encoding="utf-8")
        self._enroll.pop(key, None)
        logger.info("face_profile écrit %s (%d samples)", path, len(buf.samples))
        return {"ok": True, "path": str(path), "samples": payload["samples"]}

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
            return {
                "type": "FACE_PROGRESS",
                "progress": 5,
                "confidence": 0.0,
                "phase": "obstruction" if det.reason == "too_small" else "camera_on",
                "reason": det.reason,
                "face_found": False,
                "hudText": "SCAN FACIAL",
                "hudSubtext": (
                    "Visage non détecté" if det.reason == "no_face"
                    else "Trop loin — approchez-vous" if det.reason == "too_far"
                    else "Hors champ d'authentification" if det.reason == "out_of_field"
                    else "Approchez-vous"
                ),
            }

        matches = self._load_candidates(username=username, user_id=user_id)
        if not matches:
            return {
                "type": "FACE_FAILED",
                "reason": "no_profile",
                "face_found": True,
                "hudText": "PROFIL INCONNU",
                "hudSubtext": "Aucun profil facial — PIN ou enrôlement admin",
            }

        best_id = None
        best_name = None
        best_score = -1.0
        for uid, uname, emb in matches:
            # cosine (vecteurs déjà L2)
            score = float(np.dot(det.embedding, emb))
            if score > best_score:
                best_score = score
                best_id = uid
                best_name = uname

        # jauge 0..99 tant que sous seuil
        progress = float(np.clip(best_score / max(VERIFY_THRESHOLD, 1e-3) * 95.0, 0, 99))
        if best_score >= VERIFY_THRESHOLD and best_id:
            return {
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

        return {
            "type": "FACE_PROGRESS",
            "progress": progress,
            "confidence": max(0.0, best_score),
            "phase": "reconstruction",
            "face_found": True,
            "hudText": "BIOMETRIC SYNTHESIS",
            "hudSubtext": f"FACIAL MATRIX {int(progress)}%",
        }

    def _profile_path(self, user_id: str) -> Path:
        return default_data_dir() / "users" / user_id / "face_profile"

    def _load_embedding(self, user_id: str) -> np.ndarray | None:
        path = self._profile_path(user_id)
        if not path.exists() or path.stat().st_size < 8:
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            emb = np.array(data["embedding"], dtype=np.float32)
            n = np.linalg.norm(emb)
            if n < 1e-6:
                return None
            return emb / n
        except Exception as exc:  # noqa: BLE001
            logger.warning("face_profile illisible %s: %s", path, exc)
            return None

    def _load_candidates(
        self, *, username: str | None, user_id: str | None
    ) -> list[tuple[str, str, np.ndarray]]:
        from ..auth.user_manager import UserManager

        users = UserManager()
        out: list[tuple[str, str, np.ndarray]] = []
        try:
            if user_id:
                u = users.get_by_id(user_id)
                if u:
                    emb = self._load_embedding(u.id)
                    if emb is not None:
                        out.append((u.id, u.username, emb))
            elif username:
                u = users.get_by_username(username)
                if u:
                    emb = self._load_embedding(u.id)
                    if emb is not None:
                        out.append((u.id, u.username, emb))
            else:
                for u in users.list_users():
                    if not u.face_enrolled:
                        continue
                    emb = self._load_embedding(u.id)
                    if emb is not None:
                        out.append((u.id, u.username, emb))
        finally:
            users.close()
        return out
