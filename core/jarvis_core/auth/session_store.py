"""Sessions auth par connexion WS (Phase 3)."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import AuthSession


class ConnectionSessionStore:
    """Une session par `connection_id` ; fallback global pour smokes offline."""

    def __init__(self) -> None:
        self._by_conn: dict[str, AuthSession] = {}
        self._global: AuthSession | None = None

    def get(self, connection_id: str | None) -> AuthSession | None:
        if connection_id:
            return self._by_conn.get(connection_id)
        return self._global

    def set(self, session: AuthSession, *, connection_id: str | None) -> None:
        if connection_id:
            self._by_conn[connection_id] = session
        else:
            self._global = session

    def pop(self, connection_id: str | None) -> AuthSession | None:
        if connection_id:
            return self._by_conn.pop(connection_id, None)
        sess = self._global
        self._global = None
        return sess

    def drop_connection(self, connection_id: str) -> AuthSession | None:
        return self._by_conn.pop(connection_id, None)

    def all_bindings(self) -> list[tuple[str | None, AuthSession]]:
        out = [(cid, sess) for cid, sess in self._by_conn.items()]
        if self._global is not None:
            out.append((None, self._global))
        return out

    def active_compat(self) -> AuthSession | None:
        """Compat smokes / code legacy sans connection_id."""
        if self._global is not None:
            return self._global
        if len(self._by_conn) == 1:
            return next(iter(self._by_conn.values()))
        return None
