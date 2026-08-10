"""
Auth Service — enroll / login / elevate / lock.

═══ LE CORE N'ACCEPTE PAS UNE IDENTITÉ, IL LA CONSTATE ═══════════════════

`login()` recevait un `user_id` du HUD et ouvrait la session dessus, sans rien
vérifier. Le raisonnement tenait — la reconnaissance faciale venait de tourner
côté Core quelques secondes plus tôt — mais le point d'entrée, lui, faisait
confiance à un identifiant envoyé par le client. Un simple message WebSocket

    {"type":"auth","action":"login","user_id":"<id de l'admin>"}

ouvrait une session administrateur sans caméra, sans micro et sans PIN.

D'où l'ATTESTATION : quand le Core reconnaît réellement quelqu'un, il le note
ici. `login()` exige ensuite cette note. Le HUD ne transmet plus une identité,
il demande l'ouverture d'une session pour une identité que le Core a lui-même
établie — et qu'il est seul à pouvoir établir.

Trois propriétés qui comptent :

  • **usage unique** — consommée à l'ouverture. Une reconnaissance = une
    session, pas un laissez-passer réutilisable.
  • **périssable** — au-delà de `PROOF_TTL_S`, elle ne vaut plus rien : une
    attestation qui traîne, c'est une porte laissée entrouverte.
  • **hors de portée du client** — rien dans le protocole WS ne permet de la
    créer. Elle naît dans `handle_holomat`, sur un vrai verdict biométrique.

Le PIN, lui, n'en a pas besoin : il est vérifié pour de bon (`verify_user_pin`).
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Any

from .models import AuthSession, Role, User
from .session_store import ConnectionSessionStore
from .user_manager import UserManager, verify_pin

logger = logging.getLogger("jarvis.auth.service")

# Entrée de secours (docs/RECOVERY.md § niveau 0)
RECOVERY_MAX_FAILS = 5      # avant verrouillage, comme un PIN de téléphone
RECOVERY_LOCK_S = 300       # 5 min de blocage
RECOVERY_TTL_S = 900        # 15 min : on entre pour réparer, pas pour rester

#: Durée de validité d'une attestation biométrique.
#:
#: Entre la reconnaissance et l'appel à `login()`, le HUD déroule toute la fin
#: de sa séquence — fusion des facteurs, salutation, chargement du profil.
#: Comptez une vingtaine de secondes. 120 s laisse la marge nécessaire sans
#: transformer une reconnaissance en autorisation permanente.
PROOF_TTL_S = 120.0

#: Échappatoire de développement : autorise `login()` sans attestation.
#:
#: Existe pour ne pas bloquer un poste sans caméra, et **désactivée par
#: défaut**. Le chemin normal dans ce cas reste le PIN, qui est réellement
#: vérifié et que le HUD propose déjà sur un démarrage bloqué.
ENV_ALLOW_UNVERIFIED = "JARVIS_AUTH_ALLOW_UNVERIFIED"


class AuthService:
    def __init__(self, users: UserManager | None = None) -> None:
        self.users = users or UserManager()
        self._sessions: dict[str, AuthSession] = {}
        self._recovery_fails = 0
        self._recovery_locked_until = 0.0
        self._conn_sessions = ConnectionSessionStore()
        #: Attestations biométriques en attente : user_id → (péremption,
        #: confiance, méthode). Alimenté par le Core sur un vrai verdict,
        #: jamais par un message du HUD.
        self._proofs: dict[str, tuple[float, float, str]] = {}

    @property
    def active(self) -> AuthSession | None:
        """Compat legacy — une seule connexion ou smokes sans connection_id."""
        return self._conn_sessions.active_compat()

    @active.setter
    def active(self, session: AuthSession | None) -> None:
        if session is None:
            self._conn_sessions.pop(None)
        else:
            self._conn_sessions.set(session, connection_id=None)

    def session_for(self, connection_id: str | None) -> AuthSession | None:
        return self._conn_sessions.get(connection_id)

    def _attach_session(
        self, session: AuthSession, *, connection_id: str | None
    ) -> None:
        self._sessions[session.session_id] = session
        self._conn_sessions.set(session, connection_id=connection_id)

    def on_disconnect(self, connection_id: str) -> None:
        sess = self._conn_sessions.drop_connection(connection_id)
        if sess:
            self._sessions.pop(sess.session_id, None)
            self.users._audit(sess.user_id, "logout", method="ws_disconnect")
            logger.info("Session fermée · disconnect · %s", sess.username)

    # ── attestation biométrique ──────────────────────────────────────────

    def attest_biometric(self, user_id: str, method: str, confidence: float) -> None:
        """Le Core a reconnu quelqu'un (phrase vocale / futur speaker-ID).

        Appelants légitimes : `handle_voice` (verify_phrase), éventuellement
        Holomat hors auth. Ne PAS exposer via une route WS HUD libre.
        """
        self._proofs[user_id] = (time.time() + PROOF_TTL_S, confidence, method)
        logger.info("attestation biométrique · %s · %s (%.2f)", user_id, method, confidence)

    def _consume_proof(self, user_id: str) -> tuple[float, str] | None:
        """Retire et renvoie l'attestation si elle est encore valable."""
        proof = self._proofs.pop(user_id, None)
        if proof is None:
            return None
        peremption, confidence, method = proof
        if time.time() > peremption:
            logger.info("attestation périmée · %s", user_id)
            return None
        return confidence, method

    def purge_proofs(self) -> None:
        maintenant = time.time()
        self._proofs = {
            uid: p for uid, p in self._proofs.items() if p[0] > maintenant
        }

    def status(self, *, connection_id: str | None = None) -> dict[str, Any]:
        base = self.users.status()
        sess = self.session_for(connection_id)
        base["session"] = sess.to_event() if sess else None
        if connection_id:
            base["connection_id"] = connection_id
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
        title: str | None = None,
        birth_date: str | None = None,
    ) -> dict[str, Any]:
        r: Role | None = None
        if role:
            r = Role(role.upper())
        user = self.users.create_user(
            username,
            display_name=display_name,
            role=r,
            pin=pin,
            title=title,
            birth_date=birth_date,
            face_enrolled=face,
            voice_enrolled=voice,
            gesture_enrolled=gesture,
        )
        return {"ok": True, "user": user.to_public_dict(), "first_admin": user.role == Role.ADMIN and self.users.count_users() == 1}

    def ensure_member(
        self,
        username: str,
        *,
        display_name: str | None = None,
        pin: str | None = None,
        role: str | None = None,
        title: str | None = None,
        birth_date: str | None = None,
    ) -> dict[str, Any]:
        """Compte foyer pour enrôlement face — sans ordre imposé.

        Utilisateur déjà connu → retourne son id (ré-enrôlement face).
        Sinon → crée le profil (1er du système = ADMIN, ensuite USER/CHILD).
        """
        key = username.strip()
        if not key:
            return {"ok": False, "error": "username requis"}

        existing = self.users.get_by_username(key)
        if existing:
            return {
                "ok": True,
                "user": existing.to_public_dict(),
                "created": False,
                "re_enroll": True,
            }

        if self.users.is_first_run():
            enroll_role = Role.ADMIN
        else:
            requested = str(role or "USER").upper()
            enroll_role = Role.CHILD if requested == "CHILD" else Role.USER

        user = self.users.create_user(
            key,
            display_name=display_name,
            role=enroll_role,
            pin=pin,
            title=title,
            birth_date=birth_date,
        )
        return {
            "ok": True,
            "user": user.to_public_dict(),
            "created": True,
            "re_enroll": False,
            "first_admin": user.role == Role.ADMIN and self.users.count_users() == 1,
        }

    def login(
        self,
        *,
        username: str | None = None,
        user_id: str | None = None,
        method: str = "stub",
        confidence: float = 0.0,
        pin: str | None = None,
        connection_id: str | None = None,
    ) -> dict[str, Any]:
        user: User | None = None
        # Le PIN est le seul facteur que `login()` vérifie lui-même — et il le
        # vérifie pour de bon. Il n'a donc pas besoin d'attestation.
        if pin and username:
            user = self.users.verify_user_pin(username, pin)
            method = "pin"
            confidence = 1.0 if user else 0.0
            if not user:
                return {"ok": False, "error": "utilisateur inconnu ou PIN invalide"}
        else:
            candidat = None
            if user_id:
                candidat = self.users.get_by_id(user_id)
            elif username:
                candidat = self.users.get_by_username(username)
            else:
                # Ancien « stub MFA » : un seul utilisateur en base → session
                # ouverte sur lui, sans rien demander. Sur le NUC du foyer ça
                # n'a aucun sens, et c'était une porte ouverte de plus.
                users = self.users.list_users()
                if len(users) == 1:
                    candidat = users[0]
                elif users:
                    return {"ok": False, "error": "préciser username (multi-users)"}

            if not candidat:
                return {"ok": False, "error": "utilisateur inconnu"}

            preuve = self._consume_proof(candidat.id)
            if preuve is not None:
                # Le Core a bien reconnu cette personne : on retient SA mesure
                # de confiance, pas celle annoncée par le client.
                confidence, method = preuve
            elif os.environ.get(ENV_ALLOW_UNVERIFIED) == "1":
                logger.warning(
                    "login sans attestation accepté (%s=1) · %s — développement UNIQUEMENT",
                    ENV_ALLOW_UNVERIFIED, candidat.username,
                )
            else:
                # Le refus est volontairement avare : ne pas indiquer si
                # l'utilisateur existe, ni si l'attestation a expiré ou n'a
                # jamais existé. Le journal, lui, dit tout.
                logger.warning(
                    "login refusé — aucune attestation biométrique pour « %s »",
                    candidat.username,
                )
                return {
                    "ok": False,
                    "error": "authentification requise",
                    "hint": "biométrie non vérifiée par le Core — utiliser le code d'accès",
                }
            user = candidat

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
        self._attach_session(session, connection_id=connection_id)
        self.users._audit(user.id, "login", method=method, detail=f"conf={confidence}")
        logger.info("Login %s method=%s conn=%s", user.username, method, connection_id or "global")
        return {"ok": True, "event": session.to_event()}

    def recovery_login(
        self, pin: str, *, username: str | None = None, connection_id: str | None = None
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
        self._attach_session(session, connection_id=connection_id)
        self.users._audit(user.id, "recovery_login", method="recovery_pin", detail=f"ttl={RECOVERY_TTL_S}s")
        logger.warning("SESSION DE SECOURS ouverte pour %s (TTL %s s)", user.username, RECOVERY_TTL_S)
        return {"ok": True, "event": session.to_event(), "line": "admin_mode"}

    def purge_expired(self) -> bool:
        """Ferme les sessions dont le TTL de secours est dépassé."""
        closed = False
        for cid, sess in list(self._conn_sessions.all_bindings()):
            if not sess.expired:
                continue
            self.users._audit(sess.user_id, "recovery_expired", method="recovery_pin")
            self._sessions.pop(sess.session_id, None)
            if cid:
                self._conn_sessions.drop_connection(cid)
            else:
                self._conn_sessions.pop(None)
            closed = True
        if closed:
            logger.info("Session(s) de secours expirée(s) — fermeture")
        return closed

    def elevate_admin(
        self, *, method: str = "stub", connection_id: str | None = None
    ) -> dict[str, Any]:
        """Re-auth élevée Dashboard — exige dashboard_access (ADMIN)."""
        sess = self.session_for(connection_id)
        if not sess:
            return {"ok": False, "error": "aucune session HUD"}
        user = self.users.get_by_id(sess.user_id)
        if not user or not user.has("dashboard_access"):
            return {"ok": False, "error": "permission dashboard_access refusée"}
        sess.admin_elevated = True
        sess.method = f"{sess.method}+{method}"
        self.users._audit(user.id, "admin_elevate", method=method)
        return {"ok": True, "event": sess.to_event()}

    def revoke_admin(self, *, connection_id: str | None = None) -> dict[str, Any]:
        sess = self.session_for(connection_id)
        if sess:
            sess.admin_elevated = False
            self.users._audit(sess.user_id, "admin_revoke", method="ui")
        return {"ok": True, "session": sess.to_event() if sess else None}

    def logout(self, *, connection_id: str | None = None) -> dict[str, Any]:
        sess = self._conn_sessions.pop(connection_id)
        if sess:
            self.users._audit(sess.user_id, "logout", method="lock")
            self._sessions.pop(sess.session_id, None)
        return {"ok": True}
