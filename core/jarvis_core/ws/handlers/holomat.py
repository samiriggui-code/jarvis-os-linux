"""Phase 2 — handlers WS."""
from __future__ import annotations

import json
import logging
import time
from typing import Any

logger = logging.getLogger("jarvis.core")


class HolomatHandlerMixin:

    async def handle_holomat(self, ws: Any, data: dict[str, Any]) -> None:
        """Events type=holomat — face + calibration machine (§6.8)."""
        from ...auth.profiles import load_calibration, save_calibration

        action = str(data.get("action", "status"))
        calib = load_calibration()

        # Le moteur se charge en tâche de fond : distinguer « pas encore prêt »
        # de « indisponible », sinon le HUD affiche « missing » pendant le boot.
        face_ready = self.face is not None and self.face.ready
        face_state = self.face.status() if self.face is not None else {"state": "absent"}
        # `camera` = dernier rapport d'un client (indicatif). Holomat (face_engine)
        # reste indépendant : un device sans cam n'éteint pas le service.
        camera = "unknown" if self._camera_ok is None else ("ok" if self._camera_ok else "missing")

        from ...vision.face_mesh import ALGO_NAME
        from ...vision.face_engine import PRESENCE_HITS_NEEDED

        if action == "camera":
            # Périphérique local du client — ne touche pas la brique holomat.
            ok = bool(data.get("ok", False))
            self.note_camera(ok, None if ok else str(data.get("error") or "camera_unavailable"))
            await ws.send(json.dumps({
                "type": "holomat_status",
                "camera": "ok" if ok else "missing",
                "calibrated": bool(calib.get("calibrated")),
                "face_engine": face_ready,
                "face": face_state,
            }))
            return

        if action == "status":
            await ws.send(json.dumps({
                "type": "holomat_status",
                "camera": camera,
                "calibrated": bool(calib.get("calibrated")),
                "calibration": calib,
                "face_engine": face_ready,
                "algo": ALGO_NAME if face_ready else None,
                "face": face_state,
            }))
            return

        if action in ("calibrate_start", "calibrate"):
            # MVP : enregistre que la calib a été lancée avec caméra ON (Charuco full = Holomat Manager plus tard)
            camera_on = bool(data.get("camera_on", False))
            if not camera_on:
                await ws.send(json.dumps({
                    "type": "holomat_calibrate_result",
                    "ok": False,
                    "error": "camera_required",
                    "message": "Active la caméra (Settings → Vision) avant calibration Holomat.",
                }))
                return
            saved = save_calibration({
                "calibrated": True,
                "cameraDeviceId": data.get("cameraDeviceId") or data.get("camera_device_id"),
                "method": data.get("method", "charuco_stub"),
                "source": "hud_settings",
                "note": "Stub calib — remplacer par pipeline Charuco vendor/vision/Holomat",
            })
            await ws.send(json.dumps({
                "type": "holomat_calibrate_result",
                "ok": True,
                "calibrated": True,
                "calibration": saved,
                "path": "core/data/holomat/calibration.json",
            }))
            await ws.send(json.dumps({
                "type": "holomat_status",
                "camera": "ok",
                "calibrated": True,
                "calibration": saved,
                "face_engine": face_ready,
            }))
            return

        if action == "get_calibration":
            await ws.send(json.dumps({
                "type": "holomat_calibrate_result",
                "ok": True,
                "calibration": calib,
            }))
            return

        if self.face is None:
            await ws.send(json.dumps({"type": "holomat_error", "error": "face_engine_unavailable"}))
            return

        # Les actions suivantes ont besoin des modèles. Si le chargement de fond
        # n'est pas fini, on l'attend au lieu de refuser : tous les appelants
        # partagent la même tâche, et le reste du Core (chat, voix, PIN) est
        # resté disponible pendant ce temps — c'était l'inverse avant.
        if not self.face.ready and not await self.face.load():
            await ws.send(json.dumps({
                "type": "holomat_error",
                "error": "face_engine_unavailable",
                "face": self.face.status(),
            }))
            return

        if action == "face_enroll_begin":
            user_id = str(data.get("user_id") or "").strip()
            username = str(data.get("username") or "").strip()
            if not user_id:
                await ws.send(json.dumps({"type": "holomat_error", "error": "user_id requis"}))
                return
            self.face.enroll_begin(user_id, username)
            await ws.send(json.dumps({
                "type": "FACE_PROGRESS",
                "progress": 0,
                "confidence": 0,
                "phase": "camera_on",
                "mode": "enroll",
                "user_id": user_id,
                "hudText": "OPTICAL SENSOR ONLINE",
                "hudSubtext": "Acquisition biométrique",
            }))
            return

        if action == "face_reset_all":
            out = self.face.reset_all_face_profiles()
            if self.auth is not None:
                for uid in out.get("user_ids") or []:
                    try:
                        self.auth.users.mark_biometrics(str(uid), face=False, voice=False)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("face_reset_all DB %s: %s", uid, exc)
            await ws.send(json.dumps({"type": "face_reset_all_result", **out}))
            return

        if action == "face_reset_user":
            user_id = str(data.get("user_id") or "").strip()
            if not user_id:
                await ws.send(json.dumps({
                    "type": "face_reset_user_result",
                    "ok": False,
                    "error": "user_id requis",
                }))
                return
            out = self.face.reset_face_profile(user_id)
            if out.get("ok") and self.auth is not None:
                try:
                    self.auth.users.mark_biometrics(user_id, face=False)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("face_reset_user DB %s: %s", user_id, exc)
            await ws.send(json.dumps({"type": "face_reset_user_result", **out}))
            return

        if action == "face_frame":
            mode = str(data.get("mode", "verify"))
            jpeg_b64 = str(data.get("jpeg_b64", ""))
            # Trace d'entrée — prouve CAMERA HUD → WS → Core (avant YuNet).
            now_recv = time.time()
            jpeg_len = len(jpeg_b64)
            if now_recv - getattr(self, "_face_recv_log_ts", 0.0) > 2.0:
                self._face_recv_log_ts = now_recv
                logger.info(
                    "[CORE FACE] frame received size=%s ts=%.3f mode=%s",
                    jpeg_len,
                    now_recv,
                    mode,
                )
            if not jpeg_b64:
                await ws.send(json.dumps({"type": "holomat_error", "error": "jpeg_b64 manquant"}))
                return

            logger.debug("[CORE FACE] processing mode=%s size=%s", mode, jpeg_len)

            if mode == "enroll":
                user_id = str(data.get("user_id") or "").strip()
                username = str(data.get("username") or "").strip()
                if not user_id:
                    await ws.send(json.dumps({"type": "holomat_error", "error": "user_id requis pour enroll"}))
                    return
                ev = await self.face.enroll_add_frame(user_id, jpeg_b64, username=username)
                if ev.get("type") == "holomat_error":
                    await ws.send(json.dumps(ev))
                    return
                # Signaux séquence alignés sur FACE_* réels (contrat FACE_AUTH_CONTRACT).
                if ev.get("face_found") and ev.get("type") == "FACE_PROGRESS":
                    self.sequences.signal("face.landmarks")
                if ev.get("type") == "FACE_SUCCESS" and ev.get("mode") == "enroll":
                    # Samples prêts — le modèle disque vient au commit.
                    self.sequences.signal("face.landmarks")
            else:
                ev = await self.face.verify_frame(
                    jpeg_b64,
                    username=data.get("username"),
                    user_id=data.get("user_id"),
                )
                # `face.matched` n'est émis QUE sur une reconnaissance réelle :
                # la séquence doit attendre le vrai verdict, pas la simple
                # arrivée d'une image. Sinon JARVIS annonce « identité
                # confirmée » devant n'importe qui.
                if ev.get("type") == "FACE_SUCCESS" and ev.get("user_id"):
                    self.sequences.signal("face.matched")
                    # SEUL endroit du programme où naît une attestation
                    # biométrique. C'est ici que le Core CONSTATE une
                    # identité ; `login()` exigera cette note et refusera un
                    # `user_id` que le HUD se contenterait d'affirmer.
                    matched_id = str(ev.get("user_id") or "")
                    if self.auth is not None and matched_id:
                        self.auth.attest_biometric(
                            matched_id, "face", float(ev.get("confidence") or 0.0)
                        )

            # Présence = visage détecté (enroll/verify sans gate strict).
            if ev.get("face_found"):
                self._presence_hits += 1
                if self._presence_hits >= PRESENCE_HITS_NEEDED:
                    self.sequences.signal("face.presence")
                    self.sequences.signal("face.scanning")
            else:
                self._presence_hits = 0
                reason = str(ev.get("reason") or "")
                now = time.monotonic()
                if reason and now - getattr(self, "_face_miss_log_ts", 0.0) > 5.0:
                    self._face_miss_log_ts = now
                    logger.info("face miss · reason=%s mode=%s", reason, mode)

            # Trace minimale : prouve que le HUD envoie bien des frames.
            now_ok = time.monotonic()
            if now_ok - getattr(self, "_face_frame_log_ts", 0.0) > 4.0:
                self._face_frame_log_ts = now_ok
                logger.info(
                    "[CORE FACE] processing mode=%s type=%s found=%s conf=%s",
                    mode,
                    ev.get("type"),
                    ev.get("face_found"),
                    ev.get("confidence"),
                )

            await ws.send(json.dumps(ev))
            return

        if action == "face_enroll_commit":
            user_id = str(data.get("user_id") or "").strip()
            username = str(data.get("username") or "").strip()
            if not user_id:
                await ws.send(json.dumps({
                    "type": "face_enroll_commit_result",
                    "ok": False,
                    "error": "user_id requis",
                }))
                return
            commit = await self.face.enroll_commit(user_id, username)
            if commit.get("ok"):
                self.sequences.signal("face.model")
            if commit.get("ok") and self.auth is not None:
                try:
                    self.auth.users.mark_biometrics(user_id, face=True)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("face_enroll_commit: profil disque ok, DB ignoree: %s", exc)
            await ws.send(json.dumps({"type": "face_enroll_commit_result", **commit}))
            return

        await ws.send(json.dumps({"type": "holomat_error", "error": f"action inconnue: {action}"}))
    def note_camera(self, ok: bool, error: str | None = None) -> None:
        """Un HUD rapporte l'état de SA caméra locale (périphérique device).

        N'altère PAS la brique superviseur `holomat` : Holomat est le moteur
        CV partagé. Caméra absente sur le kiosk ≠ Holomat mort pour le laptop.
        La narration `peripheral_camera_*` passe par `handle_peripheral`.
        """
        self._camera_ok = ok
        if error and not ok:
            logger.info("caméra device · indisponible · %s", error)
        elif ok:
            logger.debug("caméra device · ok")
