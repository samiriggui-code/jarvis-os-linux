"""
JARVIS Auth — modèles §10.1

Persistance : SQLAlchemy → PostgreSQL (prod) / SQLite (fallback).
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Role(str, Enum):
    ADMIN = "ADMIN"
    USER = "USER"
    CHILD = "CHILD"
    GUEST = "GUEST"


# Permissions par rôle (cahier §10.1) — le HUD ne décide jamais seul.
ROLE_PERMISSIONS: dict[Role, frozenset[str]] = {
    Role.ADMIN: frozenset({
        "hud_access",
        "dashboard_access",
        "hermes_access",
        "tools_access",
        "agents_access",
        "linux_admin",
        "user_management",
        "home_control",
        "media_control",
    }),
    Role.USER: frozenset({
        "hud_access",
        "home_control",
        "media_control",
        "apps_access",
    }),
    Role.CHILD: frozenset({
        "hud_access",
        "media_control_limited",
        "apps_access_limited",
    }),
    Role.GUEST: frozenset({
        "hud_access_basic",
    }),
}


@dataclass
class User:
    id: str
    username: str
    display_name: str
    role: Role
    pin_hash: str | None = None
    title: str | None = None  # monsieur | madame | mademoiselle
    birth_date: str | None = None  # YYYY-MM-DD
    face_enrolled: bool = False
    voice_enrolled: bool = False
    gesture_enrolled: bool = False
    created_at: str = ""
    updated_at: str = ""

    def permissions(self) -> frozenset[str]:
        return ROLE_PERMISSIONS[self.role]

    def has(self, permission: str) -> bool:
        return permission in self.permissions()

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "role": self.role.value,
            "title": self.title,
            "birth_date": self.birth_date,
            "permissions": sorted(self.permissions()),
            "biometrics": {
                "face": self.face_enrolled,
                "voice": self.voice_enrolled,
                "gesture": self.gesture_enrolled,
            },
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class AuthSession:
    """Session HUD en mémoire (pas un JWT cloud)."""
    session_id: str
    user_id: str
    username: str
    role: Role
    method: str
    confidence: float = 0.0
    admin_elevated: bool = False
    permissions: frozenset[str] = field(default_factory=frozenset)

    # Session de secours : ouverte au PIN seul, sans caméra ni micro. Bornée
    # dans le temps — une session de secours oubliée ouverte est une porte
    # ouverte. `None` = session normale, sans expiration.
    expires_at: float | None = None

    @property
    def expired(self) -> bool:
        return self.expires_at is not None and time.time() > self.expires_at

    def to_event(self) -> dict[str, Any]:
        """Payload Core → HUD : user_authenticated (§10.1)."""
        return {
            "type": "user_authenticated",
            "session_id": self.session_id,
            "user": {
                "id": self.user_id,
                "username": self.username,
                "role": self.role.value,
            },
            "method": self.method,
            "confidence": self.confidence,
            "admin_elevated": self.admin_elevated,
            "permissions": sorted(self.permissions),
            "recovery": self.method == "recovery_pin",
            "expires_at": self.expires_at,
        }
