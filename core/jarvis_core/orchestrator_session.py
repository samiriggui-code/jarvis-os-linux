"""Phase 4 — session WS / broadcast / contexte vocal."""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


class OrchestratorSessionMixin:

    def connection_id(self, ws: Any) -> str | None:
        return self.connections.get(ws)

    def _session_role(self, ws: Any | None = None) -> str | None:
        """Rôle de la session active, en minuscules — `None` si personne."""
        sess = None
        if self.auth:
            cid = self.connection_id(ws) if ws is not None else None
            sess = self.auth.session_for(cid)
            if sess is None:
                sess = getattr(self.auth, "active", None)
        role = getattr(getattr(sess, "role", None), "value", None)
        return role.lower() if isinstance(role, str) else None

    def _say_context(self, ws: Any | None = None) -> dict[str, Any]:
        """Qui écoute — rôle, adresse et prénom de la session active."""
        sess = None
        if self.auth:
            cid = self.connection_id(ws) if ws is not None else None
            sess = self.auth.session_for(cid)
            if sess is None:
                sess = getattr(self.auth, "active", None)
        if sess is None:
            return {}

        ctx: dict[str, Any] = {"user_id": sess.user_id}
        if role := self._session_role(ws):
            ctx["user_role"] = role

        user = self.auth.users.get_by_id(sess.user_id) if self.auth else None
        bindings: dict[str, str] = {}
        if name := getattr(user, "display_name", None):
            bindings["user"] = str(name)

        try:
            from .auth.profiles import load_hud_preferences

            prefs = load_hud_preferences(sess.user_id) or {}
            title = str(prefs.get("title") or "").strip().lower()
            if title in ("monsieur", "madame", "mademoiselle"):
                bindings["titre"] = title
        except Exception:
            pass
        if bindings:
            ctx["bindings"] = bindings

        ctx["address"] = getattr(user, "address", None) or "vous"
        return ctx

    def _device_hint_for_ws(self, ws: Any | None) -> dict[str, Any] | None:
        """Indice appareil personnel lié à cette connexion (Phase 4)."""
        if ws is None:
            return None
        device_id = self.connections.device_for(ws)
        if not device_id:
            return None
        dev = self.devices.get_device(device_id)
        if dev is None:
            return None
        hint: dict[str, Any] = {
            "device_id": device_id,
            "device_mode": dev.device_mode,
        }
        if dev.device_mode == "personal" and dev.bound_user_id:
            hint["bound_user_id"] = dev.bound_user_id
        return hint

    def _route_context(
        self, ws: Any | None, *, capability_id: str | None = None
    ):
        device_id = self.connections.device_for(ws) if ws is not None else None
        return self.router.context_from(
            origin_device_id=device_id,
            session_user_id=self._session_user_id(ws),
            capability_id=capability_id,
        )

    def _bind_output_route(self, ws: Any | None):
        """Fixe `_tts_output_device_id` selon origine + device_mode."""
        result = self.router.resolve_output_device(self._route_context(ws))
        self._tts_output_device_id = result.device_id
        return result

    def _clear_output_route(self) -> None:
        self._tts_output_device_id = None

    async def broadcast(self, payload: dict[str, Any]) -> None:
        """Diffuse aux clients HUD uniquement — pas aux agents machine.

        Les agents Windows/Pi reçoivent uniquement des messages ciblés
        (``device.execute``, ack register). Les floods chat/surface/TTS
        satureraient sinon leur compteur + la bande passante.
        """
        text = json.dumps(payload)
        dead: list[Any] = []
        skip: set[Any] = set()
        conns = getattr(self, "connections", None)
        if conns is not None and hasattr(conns, "device_sockets"):
            try:
                skip = conns.device_sockets()
            except Exception:
                skip = set()
        for ws in self.clients:
            if ws in skip:
                continue
            try:
                await ws.send(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)
