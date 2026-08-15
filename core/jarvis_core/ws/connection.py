"""Registre connexions WebSocket — id stable par client (Phase 3)."""
from __future__ import annotations

import uuid
import weakref
from typing import Any


class ConnectionRegistry:
    def __init__(self) -> None:
        self._ids: weakref.WeakKeyDictionary[Any, str] = weakref.WeakKeyDictionary()
        self._device_by_conn: dict[str, str] = {}
        self._ws_by_device: dict[str, Any] = {}

    def bind(self, ws: Any) -> str:
        cid = str(uuid.uuid4())
        self._ids[ws] = cid
        return cid

    def get(self, ws: Any) -> str | None:
        return self._ids.get(ws)

    def unbind(self, ws: Any) -> str | None:
        cid = self._ids.pop(ws, None)
        device_id = None
        if cid:
            device_id = self._device_by_conn.pop(cid, None)
        if device_id and self._ws_by_device.get(device_id) is ws:
            del self._ws_by_device[device_id]
        return cid

    def set_device(self, ws: Any, device_id: str) -> None:
        cid = self.get(ws)
        if not cid:
            return
        did = str(device_id or "").strip()
        if not did:
            return
        previous = self._ws_by_device.get(did)
        if previous is not None and previous is not ws:
            # Nouvelle connexion remplace l'ancienne pour ce device_id.
            old_cid = self._ids.get(previous)
            if old_cid:
                self._device_by_conn.pop(old_cid, None)
        self._device_by_conn[cid] = did
        self._ws_by_device[did] = ws

    def device_for(self, ws: Any) -> str | None:
        cid = self.get(ws)
        if not cid:
            return None
        return self._device_by_conn.get(cid)

    def ws_for_device(self, device_id: str) -> Any | None:
        did = str(device_id or "").strip()
        if not did:
            return None
        return self._ws_by_device.get(did)

    def is_device_socket(self, ws: Any) -> bool:
        """True si ce WS est un agent machine (pas un HUD)."""
        return self.device_for(ws) is not None

    def device_sockets(self) -> set[Any]:
        return set(self._ws_by_device.values())