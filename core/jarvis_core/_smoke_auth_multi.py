"""Phase 0 — auth multi-profil (sans HUD).

Vérifie :
  1. first_run → seul le 1er enroll est ADMIN
  2. 2e enroll → USER (pas ADMIN)
  3. attest + login + logout par utilisateur
  4. attestation non transférable entre profils
  5. (optionnel) face enroll ×2 + verify si image ou webcam

Usage :
  python -m jarvis_core._smoke_auth_multi
  JARVIS_SMOKE_FACE_IMAGE=photo.jpg python -m jarvis_core._smoke_auth_multi
  python -m jarvis_core._smoke_auth_multi --webcam

Face optionnel : skip propre si pas d'image / pas de visage détecté.
"""
from __future__ import annotations

import argparse
import base64
import logging
import os
import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.auth import AuthService, UserManager  # noqa: E402
from jarvis_core.auth.service import ENV_ALLOW_UNVERIFIED  # noqa: E402
from jarvis_core.auth.models import Role  # noqa: E402

# Refus login attendus dans les tests — pas une erreur de gate.
logging.getLogger("jarvis.auth.service").setLevel(logging.ERROR)


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def _auth_cases(auth: AuthService) -> None:
    os.environ.pop(ENV_ALLOW_UNVERIFIED, None)

    check("first_run au départ", auth.users.is_first_run())

    r1 = auth.enroll("samir", pin="1234", face=True, role="ADMIN")
    check("1er enroll OK", r1.get("ok"), str(r1.get("error")))
    admin = r1["user"]
    check("1er enroll = ADMIN", admin.get("role") == Role.ADMIN.value)
    check("plus first_run", not auth.users.is_first_run())

    r2 = auth.enroll("ines", pin="5678", face=True)
    check("2e enroll OK", r2.get("ok"))
    member = r2["user"]
    check("2e enroll = USER", member.get("role") == Role.USER.value)

    r3 = auth.enroll("zahra", pin="1111")
    check("3e enroll OK", r3.get("ok"))
    check("3e enroll = USER", r3["user"].get("role") == Role.USER.value)

    # Session admin
    auth.attest_biometric(admin["id"], "face", 0.88)
    login1 = auth.login(user_id=admin["id"], method="face", confidence=0.99)
    check("login admin après attest", login1.get("ok"))
    check("session active = admin", auth.active and auth.active.user_id == admin["id"])
    auth.logout()
    check("logout vide session", auth.active is None)

    # Session membre
    auth.attest_biometric(member["id"], "face", 0.85)
    login2 = auth.login(user_id=member["id"], method="face", confidence=0.99)
    check("login membre après attest", login2.get("ok"))
    check("session active = membre", auth.active and auth.active.user_id == member["id"])
    auth.logout()

    # Attestation admin ne sert pas pour membre
    auth.attest_biometric(admin["id"], "face", 0.90)
    bad = auth.login(user_id=member["id"], method="face", confidence=0.99)
    check("attest admin != login membre", not bad.get("ok"))

    em1 = auth.ensure_member("ines")
    check("ensure_member existant", em1.get("ok") and not em1.get("created"))
    check("ensure_member ines id stable", em1.get("user", {}).get("id") == member["id"])

    em2 = auth.ensure_member("yasmine", role="CHILD")
    check("ensure_member nouveau", em2.get("ok") and em2.get("created"))
    check("ensure_member enfant = CHILD", em2.get("user", {}).get("role") == Role.CHILD.value)


def _jpeg_b64_from_path(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def _jpeg_b64_webcam() -> str | None:
    try:
        import cv2
    except ImportError:
        return None
    cap = cv2.VideoCapture(0)
    ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        return None
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        return None
    return base64.b64encode(buf.tobytes()).decode("ascii")


def _face_multi(data_dir: Path, admin_id: str, member_id: str, jpeg_b64: str) -> None:
    from jarvis_core.vision.face_engine import FaceEngine, ENROLL_SAMPLES_NEEDED

    # FaceEngine lit users via auth.db.default_data_dir — patcher config + auth.db
    import jarvis_core.auth.db as auth_db
    import jarvis_core.db.config as cfg

    original_cfg = cfg.default_data_dir
    original_auth = auth_db.default_data_dir
    cfg.default_data_dir = lambda: data_dir  # type: ignore[method-assign]
    auth_db.default_data_dir = lambda: data_dir  # type: ignore[method-assign]

    def _restore_data_dir() -> None:
        cfg.default_data_dir = original_cfg  # type: ignore[method-assign]
        auth_db.default_data_dir = original_auth  # type: ignore[method-assign]

    try:
        engine = FaceEngine()
    except Exception as exc:
        print(f"  [SKIP] face engine indisponible — {exc}")
        _restore_data_dir()
        return

    try:
        for uid, name in ((admin_id, "samir"), (member_id, "ines")):
            engine.enroll_begin(uid, name)
            last: dict = {}
            for _ in range(ENROLL_SAMPLES_NEEDED + 2):
                last = engine.enroll_add_frame(uid, jpeg_b64, username=name)
                if last.get("type") == "FACE_SUCCESS" and last.get("mode") == "enroll":
                    break
            check(f"enroll face {name}", last.get("type") == "FACE_SUCCESS", str(last.get("reason")))
            commit = engine.enroll_commit(uid, name)
            check(f"commit face {name}", commit.get("ok"), str(commit.get("error")))

        verify = engine.verify_frame(jpeg_b64)
        check(
            "verify retourne FACE_SUCCESS ou FACE_FAILED",
            verify.get("type") in ("FACE_SUCCESS", "FACE_FAILED"),
            f"type={verify.get('type')}",
        )
        if verify.get("type") == "FACE_SUCCESS":
            check(
                "verify identifie un des deux profils",
                verify.get("user_id") in (admin_id, member_id),
                f"user_id={verify.get('user_id')}",
            )
            print(f"  [INFO] verify → {verify.get('username')} conf={verify.get('confidence')}")
    finally:
        _restore_data_dir()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--webcam", action="store_true", help="1 frame webcam pour test face")
    args = parser.parse_args(argv)

    print("PHASE0 auth multi-profil")
    with tempfile.TemporaryDirectory(prefix="jarvis_multi_") as tmp:
        data = Path(tmp)
        db = data / "jarvis.db"
        users = UserManager(db)
        try:
            auth = AuthService(users)
            _auth_cases(auth)

            jpeg: str | None = None
            img_env = os.environ.get("JARVIS_SMOKE_FACE_IMAGE", "").strip()
            if img_env and Path(img_env).is_file():
                jpeg = _jpeg_b64_from_path(Path(img_env))
                print(f"  [INFO] face image {img_env}")
            elif args.webcam:
                jpeg = _jpeg_b64_webcam()
                print("  [INFO] face webcam")

            if jpeg:
                print("\nPHASE0 face multi-profil (optionnel)")
                all_users = users.list_users()
                admin_u = next(u for u in all_users if u.username == "samir")
                member_u = next(u for u in all_users if u.username == "ines")
                _face_multi(data, admin_u.id, member_u.id, jpeg)
            else:
                print("  [SKIP] face multi — JARVIS_SMOKE_FACE_IMAGE ou --webcam")
        finally:
            users.close()

    print("\nPHASE0 auth multi-profil : PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
