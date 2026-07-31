"""
User Manager — charge profil, rôle, permissions (§10.1 / §2).

Persistance : SQLAlchemy (PostgreSQL prod / SQLite fallback).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func, select

from jarvis_core.db.config import database_url, describe_backend
from jarvis_core.db.models import AuthAuditRow, UserRow
from jarvis_core.db.session import get_session_factory, reset_engine, run_migrations, session_scope

from .db import ensure_user_profile_dir
from .models import ROLE_PERMISSIONS, Role, User

logger = logging.getLogger("jarvis.auth.users")

_PBKDF2_ITER = 120_000


def _utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def hash_pin(pin: str, *, salt: bytes | None = None) -> str:
    """PIN hashé — jamais en clair. Format: pbkdf2$iter$salt_hex$hash_hex"""
    if salt is None:
        salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, _PBKDF2_ITER)
    return f"pbkdf2${_PBKDF2_ITER}${salt.hex()}${digest.hex()}"


def verify_pin(pin: str, stored: str | None) -> bool:
    if not stored or not pin:
        return False
    try:
        algo, iters_s, salt_hex, hash_hex = stored.split("$", 3)
        if algo != "pbkdf2":
            return False
        iters = int(iters_s)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        digest = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, iters)
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


def _row_to_user(row: UserRow) -> User:
    return User(
        id=row.id,
        username=row.username,
        display_name=row.display_name,
        role=Role(row.role),
        pin_hash=row.pin_hash,
        face_enrolled=bool(row.face_enrolled),
        voice_enrolled=bool(row.voice_enrolled),
        gesture_enrolled=bool(row.gesture_enrolled),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class UserManager:
    def __init__(self, db_path: Any = None, *, database_url_override: str | None = None) -> None:
        """
        db_path : Path SQLite (tests / smoke) — ignore JARVIS_DATABASE_URL.
        database_url_override : URL explicite.
        """
        reset_engine()
        if database_url_override:
            self.url = database_url_override
        elif db_path is not None:
            path = Path(db_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            self.url = database_url(sqlite_path=path)
        else:
            self.url = database_url()

        run_migrations(url=self.url)
        self._factory = get_session_factory(url=self.url)
        self.db_path = self.url  # compat status / logs
        logger.info("UserManager DB → %s", describe_backend(self.url))

    def close(self) -> None:
        reset_engine()

    def count_users(self) -> int:
        with session_scope(url=self.url) as s:
            return int(s.scalar(select(func.count()).select_from(UserRow)) or 0)

    def has_users(self) -> bool:
        return self.count_users() > 0

    def is_first_run(self) -> bool:
        return not self.has_users()

    def get_by_id(self, user_id: str) -> User | None:
        with session_scope(url=self.url) as s:
            row = s.get(UserRow, user_id)
            return _row_to_user(row) if row else None

    def get_by_username(self, username: str) -> User | None:
        key = username.strip()
        with session_scope(url=self.url) as s:
            row = s.scalar(
                select(UserRow).where(func.lower(UserRow.username) == key.lower())
            )
            return _row_to_user(row) if row else None

    def list_users(self) -> list[User]:
        with session_scope(url=self.url) as s:
            rows = s.scalars(select(UserRow).order_by(UserRow.created_at.asc())).all()
            return [_row_to_user(r) for r in rows]

    def create_user(
        self,
        username: str,
        *,
        display_name: str | None = None,
        role: Role | None = None,
        pin: str | None = None,
        face_enrolled: bool = False,
        voice_enrolled: bool = False,
        gesture_enrolled: bool = False,
    ) -> User:
        username = username.strip()
        if not username:
            raise ValueError("username requis")
        if self.get_by_username(username):
            raise ValueError(f"username déjà pris : {username}")

        if role is None:
            role = Role.ADMIN if self.is_first_run() else Role.USER

        now = _utcnow()
        user_id = str(uuid.uuid4())
        pin_hash = hash_pin(pin) if pin else None

        with session_scope(url=self.url) as s:
            s.add(
                UserRow(
                    id=user_id,
                    username=username,
                    display_name=display_name or username,
                    role=role.value,
                    pin_hash=pin_hash,
                    face_enrolled=face_enrolled,
                    voice_enrolled=voice_enrolled,
                    gesture_enrolled=gesture_enrolled,
                    created_at=now,
                    updated_at=now,
                )
            )
            s.flush()  # FK auth_audit.user_id → users.id
            s.add(
                AuthAuditRow(
                    user_id=user_id,
                    event="user_created",
                    method="enroll",
                    detail=f"role={role.value}",
                    created_at=now,
                )
            )

        ensure_user_profile_dir(user_id)
        user = self.get_by_id(user_id)
        assert user is not None
        logger.info("User créé %s role=%s", username, role.value)
        return user

    def mark_biometrics(
        self,
        user_id: str,
        *,
        face: bool | None = None,
        voice: bool | None = None,
        gesture: bool | None = None,
    ) -> User:
        with session_scope(url=self.url) as s:
            row = s.get(UserRow, user_id)
            if not row:
                raise ValueError("utilisateur inconnu")
            if face is not None:
                row.face_enrolled = face
            if voice is not None:
                row.voice_enrolled = voice
            if gesture is not None:
                row.gesture_enrolled = gesture
            row.updated_at = _utcnow()
            s.flush()
            return _row_to_user(row)

    def verify_user_pin(self, username: str, pin: str) -> User | None:
        user = self.get_by_username(username)
        if not user:
            return None
        if verify_pin(pin, user.pin_hash):
            return user
        return None

    def permissions_for(self, user: User) -> frozenset[str]:
        return ROLE_PERMISSIONS[user.role]

    def status(self) -> dict[str, Any]:
        users = self.list_users()
        meta = describe_backend(self.url)
        return {
            "first_run": self.is_first_run(),
            "user_count": len(users),
            "db_path": self.url if meta["backend"] == "sqlite" else meta["backend"],
            "users": [u.to_public_dict() for u in users],
            "backend": meta["backend"],
            "note": "PostgreSQL+SQLAlchemy+Alembic = cible prod ; SQLite = fallback local",
        }

    def _audit(
        self,
        user_id: str | None,
        event: str,
        *,
        method: str | None = None,
        detail: str | None = None,
    ) -> None:
        with session_scope(url=self.url) as s:
            s.add(
                AuthAuditRow(
                    user_id=user_id,
                    event=event,
                    method=method,
                    detail=detail,
                    created_at=_utcnow(),
                )
            )
