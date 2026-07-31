"""Smoke test Auth + User Manager — SQLite temporaire, zéro dépendance réseau."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

# Allow running as script from core/
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.auth import AuthService, Role, UserManager  # noqa: E402


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="jarvis_auth_") as tmp:
        db = Path(tmp) / "test.db"
        users = UserManager(db)
        try:
            auth = AuthService(users)

            assert users.is_first_run() is True
            assert auth.status()["first_run"] is True

            r1 = auth.enroll("samir", pin="1234", face=True, voice=True)
            assert r1["ok"] is True
            assert r1["user"]["role"] == Role.ADMIN.value
            assert "dashboard_access" in r1["user"]["permissions"]

            r2 = auth.enroll("alice", pin="9999")
            assert r2["ok"] is True
            assert r2["user"]["role"] == Role.USER.value
            assert "dashboard_access" not in r2["user"]["permissions"]

            bad = auth.login(username="samir", pin="0000")
            assert bad["ok"] is False

            ok = auth.login(username="samir", pin="1234")
            assert ok["ok"] is True
            assert ok["event"]["type"] == "user_authenticated"
            assert ok["event"]["user"]["role"] == "ADMIN"

            elev = auth.elevate_admin(method="face_stub")
            assert elev["ok"] is True
            assert elev["event"]["admin_elevated"] is True

            auth.logout()
            auth.login(username="alice", pin="9999")
            deny = auth.elevate_admin()
            assert deny["ok"] is False

            print("OK — auth smoke passed")
            print(f"  db={db}")
            print(f"  users={auth.status()['user_count']}")
            print(f"  backend={auth.status()['backend']}")
        finally:
            users.close()


if __name__ == "__main__":
    main()
