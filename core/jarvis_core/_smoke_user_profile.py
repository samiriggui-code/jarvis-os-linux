"""Smoke local : create_user avec title + birth_date (SQLite temp)."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from jarvis_core.auth.user_manager import UserManager  # noqa: E402
from jarvis_core.auth.models import Role  # noqa: E402


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "jarvis.db"
        users = UserManager(db)
        assert users.is_first_run()
        u = users.create_user(
            "samir",
            display_name="Samir",
            role=Role.ADMIN,
            pin="0000",
            title="monsieur",
            birth_date="1990-05-12",
        )
        assert u.title == "monsieur"
        assert u.birth_date == "1990-05-12"
        pub = u.to_public_dict()
        assert pub["title"] == "monsieur"
        assert pub["birth_date"] == "1990-05-12"
        assert users.count_users() == 1
        users.close()
        print("OK smoke user profile fields")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
