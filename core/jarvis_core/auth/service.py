"""
Auth Service — enroll / login / elevate / lock.

Biométrie réelle (face/voice/Holomat) = stubs pour l'instant :
le HUD continue ses simulateurs ; le Core enregistre l'état et émet
user_authenticated. Hermes ne décide pas des droits.
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any

from .models import AuthSession, Role, User
from .user_manager import UserManager, verify_pin

logger = logging.getLogger("jarvis.auth.service")

# Entrée de secours (docs/RECOVERY.md § niveau 0)
RECOVERY_MAX_FAILS = 5      # avant verrouillage, comme un PIN de téléphone
RECOVERY_LOCK_S = 300       # 5 min de blocage
RECOVERY_TTL_S = 900        # 15 min : on entre pour réparer, pas pour rester


class AuthService:
    def __init__(self, users: UserManager | None = None) -> None:
        self.users = users or UserManager()
        self._sessions: dict[str, AuthSession] = {}
        self._recovery_fails = 0
        self._recovery_locked_until = 0.0
        # Une session HUD active par connexion logique (simplifié)
        self.active: AuthSession | None = None

    def status(self) -> dict[str, Any]:
        base = self.users.status()
        base["session"] = self.active.to_event() if self.active else None
        return base

    def enroll(
        self,
        username: str,
        *,
        display_name: str | None = None,
        pin: str | None = None,
        face: bool = False,
        voice: bool = False,
        gesture: bool = False,
        role: str | None = None,
    ) -> dict[str, Any]:
        r: Role | None = None
        if role:
            r = Role(role.upper())
        user = self.users.create_user(
            username,
            display_name=display_name,
            role=r,
            pin=pin,
            face_enrolled=face,
            voice_enrolled=voice,
            gesture_enrolled=gesture,
        )
        return {"ok": True, "user": user.to_public_dict(), "first_admin": user.role == Role.ADMIN and self.users.count_users() == 1}

    def login(
        self,
        *,
        username: str | None = None,
        user_id: str | None = None,
        method: str = "stub",
        confidence: float = 0.0,
        pin: str | None = None,
    ) -> dict[str, Any]:
        user: User | None = None
        if pin and username:
            user = self.users.verify_user_pin(username, pin)
            method = "pin"
            confidence = 1.0 if user else 0.0
        elif user_id:
            user = self.users.get_by_id(user_id)
        elif username:
            user = self.users.get_by_username(username)
        else:
            # Stub MFA : si un seul user, login sur lui (dev laptop)
            users = self.users.list_users()
            if len(users) == 1:
                user = users[0]
            elif users:
                return {"ok": False, "error": "préciser username (multi-users)"}

        if not user:
            return {"ok": False, "error": "utilisateur inconnu ou PIN invalide"}

        session = AuthSession(
            session_id=str(uuid.uuid4()),
            user_id=user.id,
            username=user.username,
            role=user.role,
            method=method,
            confidence=confidence,
            admin_elevated=False,
            permissions=user.permissions(),
        )
        self._sessions[session.session_id] = session
        self.active = session
        self.users._audit(user.id, "login", method=method, detail=f"conf={confidence}")
        logger.info("Login %s method=%s", user.username, method)
        return {"ok": True, "event": session.to_event()}

    def recovery_login(
        self, pin: str, *, username: str | None = None
    ) -> dict[str, Any]:
        """Entrée de secours par PIN seul — **niveau 0** (docs/RECOVERY.md).

        Ouvre une session admin SANS caméra, SANS micro, SANS Hermes, et sans
        exiger de session préalable. C'est le point qui distingue un vrai
        chemin de secours d'un second chemin de panne : `elevate_admin()`
        réclame une session, et cette session vient de la reconnaissance
        faciale — donc caméra morte = PIN refusé quoi qu'on tape.

        Trois garde-fous, non négociables (RECOVERY.md § niveau 0) :
          • verrouillage après N échecs, comme un PIN de téléphone
          • session BORNÉE dans le temps — une session de secours oubliée
            ouverte est une porte ouverte
          • tracée dans `auth_audit`, succès comme échec

        L'annonce vocale (« Mode administrateur activé ») est faite par
        l'appelant : une entrée en secours ne doit jamais être discrète.
        """
        now = time.monotonic()

        if self._recovery_locked_until > now:
            wait = int(self._recovery_locked_until - now)
            self.users._audit(None, "recovery_locked", method="recovery_pin")
            return {
                "ok": False,
                "error": f"verrouillé — réessayer dans {wait} s",
                "locked": True,
                "retry_after_s": wait,
            }

        # Sans username : on cible les administrateurs. Le PIN seul doit
        # suffire, mais il ne doit ouvrir que ce qui sert à réparer.
        candidates = (
            [u for u in [self.users.get_by_username(username)] if u]
            if username
            else [u for u in self.users.list_users() if u.role == Role.ADMIN]
        )

        user = next(
            (u for u in candidates if u.pin_hash and verify_pin(pin, u.pin_hash)),
            None,
        )

        if not user:
            self._recovery_fails += 1
            remaining = RECOVERY_MAX_FAILS - self._recovery_fails
            self.users._audit(
                None, "recovery_failed", method="recovery_pin", detail=f"reste={max(0, remaining)}"
            )
            if self._recovery_fails >= RECOVERY_MAX_FAILS:
                self._recovery_locked_until = now + RECOVERY_LOCK_S
                self._recovery_fails = 0
                logger.warning("Recovery verrouillé %s s après %s échecs", RECOVERY_LOCK_S, RECOVERY_MAX_FAILS)
                return {
                    "ok": False,
                    "error": "trop de tentatives — accès verrouillé",
                    "locked": True,
                    "retry_after_s": RECOVERY_LOCK_S,
                    "line": "pin_locked",
                }
            return {"ok": False, "error": "PIN incorrect", "remaining": remaining, "line": "pin_rejected"}

        if not user.has("dashboard_access"):
            self.users._audit(user.id, "recovery_denied", method="recovery_pin")
            return {"ok": False, "error": "permission dashboard_access refusée"}

        self._recovery_fails = 0
        session = AuthSession(
            session_id=str(uuid.uuid4()),
            user_id=user.id,
            username=user.username,
            role=user.role,
            method="recovery_pin",
            confidence=1.0,
            # Élevée d'emblée : on entre ici pour réparer, pas pour naviguer.
            admin_elevated=True,
            permissions=user.permissions(),
            expires_at=time.time() + RECOVERY_TTL_S,
        )
        self._sessions[session.session_id] = session
        self.active = session
        self.users._audit(user.id, "recovery_login", method="recovery_pin", detail=f"ttl={RECOVERY_TTL_S}s")
        logger.warning("SESSION DE SECOURS ouverte pour %s (TTL %s s)", user.username, RECOVERY_TTL_S)
        return {"ok": True, "event": session.to_event(), "line": "admin_mode"}

    def purge_expired(self) -> bool:
        """Ferme la session active si son TTL de secours est dépassé."""
        if self.active and self.active.expired:
            self.users._audit(self.active.user_id, "recovery_expired", method="recovery_pin")
            logger.info("Session de secours expirée — fermeture")
            self._sessions.pop(self.active.session_id, None)
            self.active = None
            return True
        return False

    def elevate_admin(self, *, method: str = "stub") -> dict[str, Any]:
        """Re-auth élevée Dashboard — exige dashboard_access (ADMIN)."""
        if not self.active:
            return {"ok": False, "error": "aucune session HUD"}
        user = self.users.get_by_id(self.active.user_id)
        if not user or not user.has("dashboard_access"):
            return {"ok": False, "error": "permission dashboard_access refusée"}
        self.active.admin_elevated = True
        self.active.method = f"{self.active.method}+{method}"
        self.users._audit(user.id, "admin_elevate", method=method)
        return {"ok": True, "event": self.active.to_event()}

    def revoke_admin(self) -> dict[str, Any]:
        if self.active:
            self.active.admin_elevated = False
            self.users._audit(self.active.user_id, "admin_revoke", method="ui")
        return {"ok": True, "session": self.active.to_event() if self.active else None}

    def logout(self) -> dict[str, Any]:
        if self.active:
            self.users._audit(self.active.user_id, "logout", method="lock")
            self._sessions.pop(self.active.session_id, None)
            self.active = None
        return {"ok": True}
