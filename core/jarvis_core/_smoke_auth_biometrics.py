"""Smoke — enroll face + voix persistés (DB + disque).

Vérifie le parcours complet sans HUD :
  1. auth.enroll (flags face + voice)
  2. voice_auth_phrase.json + mark_biometrics(voice=True)
  3. face_profile via FaceEngine + mark_biometrics(face=True)
  4. match_users (phrase) + verify_frame (optionnel image)

Usage (depuis core/) :
  python -m jarvis_core._smoke_auth_biometrics
  JARVIS_SMOKE_FACE_IMAGE=photo.jpg python -m jarvis_core._smoke_auth_biometrics
"""
from __future__ import annotations

import base64
import json
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
from jarvis_core.auth.models import Role  # noqa: E402
from jarvis_core.auth.voice_phrase import (  # noqa: E402
    DEFAULT_CHALLENGE,
    load_phrase,
    match_users,
    phrase_path,
    save_phrase,
)


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def _jpeg_b64_from_path(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def _voice_enroll(users: UserManager, users_dir: Path, user_id: str, username: str) -> None:
    samples = [
        DEFAULT_CHALLENGE,
        "hey jarvis",
        f"jarvis active toi {username}",
    ]
    save_phrase(users_dir, user_id, phrase=DEFAULT_CHALLENGE, samples=samples)
    users.mark_biometrics(user_id, voice=True)


def _face_enroll(users_dir: Path, user_id: str, username: str, jpeg_b64: str) -> None:
    from jarvis_core.vision.face_engine import FaceEngine, ENROLL_SAMPLES_NEEDED

    engine = FaceEngine()
    engine.enroll_begin(user_id, username)
    last: dict = {}
    for _ in range(ENROLL_SAMPLES_NEEDED + 2):
        last = engine.enroll_add_frame(user_id, jpeg_b64, username=username)
        if last.get("type") == "FACE_SUCCESS" and last.get("mode") == "enroll":
            break
    check(f"face samples {username}", last.get("type") == "FACE_SUCCESS", str(last.get("reason")))
    commit = engine.enroll_commit(user_id, username)
    check(f"face commit {username}", commit.get("ok"), str(commit.get("error")))


def main() -> int:
    print("SMOKE auth biometrics (face + voix → DB + disque)")

    img_env = os.environ.get("JARVIS_SMOKE_FACE_IMAGE", "").strip()
    jpeg: str | None = None
    if img_env and Path(img_env).is_file():
        jpeg = _jpeg_b64_from_path(Path(img_env))
        print(f"  [INFO] image face {img_env}")
    else:
        print("  [INFO] pas d'image — face enroll skip (voix seule)")

    with tempfile.TemporaryDirectory(prefix="jarvis_bio_") as tmp:
        data = Path(tmp)
        db = data / "jarvis.db"
        users_dir = data / "users"
        users_dir.mkdir(parents=True, exist_ok=True)

        import jarvis_core.db.config as cfg

        original = cfg.default_data_dir
        cfg.default_data_dir = lambda: data  # type: ignore[method-assign]

        users = UserManager(db)
        try:
            auth = AuthService(users)

            r1 = auth.enroll("samir", pin="1234", face=True, voice=True, role="ADMIN")
            check("enroll samir", r1.get("ok"))
            samir_id = r1["user"]["id"]

            r2 = auth.enroll("ines", pin="5678", face=True, voice=True, role="CHILD")
            check("enroll ines CHILD", r2.get("ok") and r2["user"]["role"] == Role.CHILD.value)
            ines_id = r2["user"]["id"]

            for uid, name in ((samir_id, "samir"), (ines_id, "ines")):
                _voice_enroll(users, users_dir, uid, name)
                u = users.get_by_id(uid)
                check(f"DB voice_enrolled {name}", u and u.voice_enrolled)
                check(
                    f"fichier voice {name}",
                    phrase_path(users_dir, uid).is_file(),
                )
                loaded = load_phrase(users_dir, uid)
                check(f"voice phrase lisible {name}", bool(loaded and loaded.get("samples")))

            if jpeg:
                for uid, name in ((samir_id, "samir"), (ines_id, "ines")):
                    _face_enroll(users_dir, uid, name, jpeg)
                    users.mark_biometrics(uid, face=True)
                    fp = users_dir / uid / "face_profile"
                    check(f"fichier face_profile {name}", fp.is_file())
                    raw = json.loads(fp.read_text(encoding="utf-8"))
                    check(f"face_profile algo {name}", bool(raw.get("algo")))
                    u = users.get_by_id(uid)
                    check(f"DB face_enrolled {name}", u and u.face_enrolled)

                from jarvis_core.vision.face_engine import FaceEngine

                verify = FaceEngine().verify_frame(jpeg)
                check(
                    "verify face retourne FACE_*",
                    verify.get("type") in ("FACE_SUCCESS", "FACE_FAILED"),
                    verify.get("type"),
                )
            else:
                print("  [SKIP] face fichiers — JARVIS_SMOKE_FACE_IMAGE")

            pool = [u.to_public_dict() for u in users.list_users()]
            hit_s = match_users(users_dir, DEFAULT_CHALLENGE, pool, username_hint="samir")
            check("voice match samir", hit_s and hit_s.get("user_id") == samir_id)
            hit_i = match_users(users_dir, "hey jarvis", pool, username_hint="ines")
            check("voice match ines", hit_i and hit_i.get("user_id") == ines_id)

            auth.attest_biometric(ines_id, "voice", 0.91)
            login = auth.login(user_id=ines_id, method="voice", confidence=0.99)
            check("login ines après attest voice", login.get("ok"))

        finally:
            cfg.default_data_dir = original
            users.close()

    print("\nSMOKE auth biometrics : PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
