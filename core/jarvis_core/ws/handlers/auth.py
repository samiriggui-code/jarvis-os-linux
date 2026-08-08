"""Phase 2 — handlers WS."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


class AuthHandlerMixin:

    async def handle_auth(self, ws: Any, data: dict[str, Any]) -> None:
        """Events type=auth — n'altère pas ping/chat existants."""
        cid = self.connection_id(ws)
        action = str(data.get("action") or "status")
        # Narration (cache vocal) : doit parler même si Auth SQL est down.
        narration = action in ("say", "sequence_start", "sequence_stop", "enroll_signal")
        if self.auth is None and not narration:
            await ws.send(json.dumps({"type": "auth_error", "error": "auth_module_unavailable"}))
            return

        # Narration de l'identification — déclenchée par le HUD quand il ouvre
        # son écran d'auth, PAS par la connexion WebSocket. C'est la seule
        # façon que le récit colle à ce que l'utilisateur voit à l'écran.
        if data.get("action") == "sequence_stop":
            # Login réussi / refresh session : coupe le monologue immédiatement.
            self._voice_quiet = True
            try:
                self.sequences.abort()
            except Exception as exc:  # noqa: BLE001
                logger.debug("sequence abort : %s", exc)
            if self.voice is not None:
                try:
                    await ws.send(json.dumps(self.voice.cancel()))
                except Exception:  # noqa: BLE001
                    pass
            await ws.send(json.dumps({"type": "auth_sequence_stop", "ok": True}))
            return

        if data.get("action") == "sequence_start":
            # ⚠ Le nom était figé sur « auth ». Les scénarios `enrollment`,
            # `unlock`, `lock` et `admin` existaient dans `sequences.py` sans
            # que RIEN ne les lance : l'enrôlement se déroulait donc en silence
            # et le déverrouillage de session n'avait aucune voix. Ce n'était
            # pas un réglage à corriger, c'était un câble jamais posé.
            #
            # Liste blanche plutôt que nom libre : un client ne choisit pas
            # d'exécuter n'importe quoi dans le Core.
            wanted = str(data.get("sequence") or "auth")
            if wanted not in ("auth", "enrollment", "unlock", "lock", "lock_auto", "admin"):
                await ws.send(json.dumps({
                    "type": "auth_error", "error": f"séquence inconnue : {wanted}",
                }))
                return

            # Narration autorisée pour cette séquence (après un stop précédent).
            self._voice_quiet = False

            # Ne pas écraser un enrôlement foyer : le HUD qui recharge lance
            # souvent `auth` au reconnect et tuait la procédure Inès/famille.
            running = getattr(self.sequences, "_running", None)
            if running == "enrollment" and wanted != "enrollment":
                logger.info(
                    "sequence_start « %s » ignoré — enrollment en cours", wanted
                )
                await ws.send(json.dumps({
                    "type": "auth_sequence_start",
                    "ok": False,
                    "reason": "enrollment_in_progress",
                    "sequence": wanted,
                }))
                return

            # Une séquence en cours (souvent auth après face OK) : on la coupe
            # avant d'en lancer une autre, sinon le monologue continue.
            try:
                self.sequences.abort()
            except Exception:  # noqa: BLE001
                pass
            # Laisse l'ancienne tâche sortir de son sleep/await avant de
            # relancer — sinon run() voit encore `_running` et ignore.
            await asyncio.sleep(0.05)

            async def say_to(event: str, **kw: Any) -> dict[str, Any] | None:
                return await self.say(event, ws, **kw)

            self.sequences._say = say_to
            task = asyncio.create_task(
                self.sequences.run(wanted, **self._say_context(ws))
            )
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
            return

        if data.get("action") == "say":
            event = str(data.get("event") or "").strip()
            if not event:
                await ws.send(json.dumps({"type": "auth_error", "error": "event requis pour say"}))
                return
            bindings = data.get("bindings")
            if bindings is not None and not isinstance(bindings, dict):
                bindings = None
            await self.say(
                event,
                ws,
                user_id=str(data.get("user_id") or "local"),
                bindings=bindings,
                user_role=data.get("user_role"),
                address=data.get("address"),
            )
            return

        # Faits d'enrôlement rapportés par le HUD. `enroll.name` et
        # `enroll.profile` n'étaient émis NULLE PART : les deux étapes qui les
        # attendent restaient bloquées jusqu'à leur délai de trente secondes,
        # sans phrase de repli — une minute de silence au milieu du scénario.
        # Le Core ne peut pas les deviner : le nom se saisit à l'écran.
        if data.get("action") == "enroll_signal":
            step = str(data.get("step") or "")
            if step in ("name", "profile", "voice", "face"):
                self.sequences.signal(f"enroll.{step}")
                await ws.send(json.dumps({
                    "type": "auth_enroll_signal", "ok": True, "step": step,
                }))
            else:
                await ws.send(json.dumps({
                    "type": "auth_error", "error": f"étape d'enrôlement inconnue : {step}",
                }))
            return

        action = str(data.get("action", "status"))
        result: dict[str, Any]

        if action == "status":
            result = {"type": "auth_status", **self.auth.status(connection_id=cid)}
            hint = self._device_hint_for_ws(ws)
            if hint:
                result["device_hint"] = hint
        elif action == "start_enrollment":
            # Hermes / chat admin → même chemin que hud.enroll
            out = await self._start_kiosk_enrollment(data)
            username = str(data.get("username") or "").strip()
            if username and self.auth is not None:
                em = self.auth.ensure_member(
                    username,
                    display_name=data.get("display_name"),
                    role=str(data.get("role") or "USER"),
                )
                if em.get("ok"):
                    out["user"] = em.get("user")
                    out["created"] = em.get("created")
            result = {"type": "auth_enrollment_started", **out}
            await ws.send(json.dumps(result))
            return
        elif action == "enroll_member":
            try:
                if self.auth.users.is_first_run():
                    enroll_role = "ADMIN"
                else:
                    requested = str(data.get("role") or "USER").upper()
                    enroll_role = "CHILD" if requested == "CHILD" else "USER"
                result = {
                    "type": "auth_enroll_member_result",
                    **self.auth.ensure_member(
                        str(data.get("username") or ""),
                        display_name=data.get("display_name"),
                        pin=data.get("pin"),
                        role=enroll_role,
                    ),
                }
            except ValueError as exc:
                result = {"type": "auth_enroll_member_result", "ok": False, "error": str(exc)}
        elif action == "enroll":
            try:
                # Loi foyer : 0 user → ADMIN unique ; ensuite USER (ou CHILD).
                # Jamais un 2e ADMIN via cet endpoint.
                if self.auth.users.is_first_run():
                    enroll_role = "ADMIN"
                else:
                    requested = str(data.get("role") or "USER").upper()
                    enroll_role = "CHILD" if requested == "CHILD" else "USER"
                result = {
                    "type": "auth_enroll_result",
                    **self.auth.enroll(
                        str(data.get("username", "")),
                        display_name=data.get("display_name"),
                        pin=data.get("pin"),
                        face=bool(data.get("face", False)),
                        voice=bool(data.get("voice", False)),
                        gesture=bool(data.get("gesture", False)),
                        role=enroll_role,
                    ),
                }
            except ValueError as exc:
                result = {"type": "auth_enroll_result", "ok": False, "error": str(exc)}
        elif action == "login":
            result = {
                "type": "auth_login_result",
                **self.auth.login(
                    username=data.get("username"),
                    user_id=data.get("user_id"),
                    method=str(data.get("method", "stub")),
                    confidence=float(data.get("confidence", 0.0)),
                    pin=data.get("pin"),
                    connection_id=cid,
                ),
            }
            if result.get("ok") and result.get("event"):
                await ws.send(json.dumps(result["event"]))
                # Session ouverte : coupe immédiatement le monologue auth.
                self._voice_quiet = True
                try:
                    self.sequences.abort()
                except Exception:  # noqa: BLE001
                    pass
                if self.voice is not None:
                    try:
                        await ws.send(json.dumps(self.voice.cancel()))
                    except Exception:  # noqa: BLE001
                        pass
        elif action == "recovery_login":
            # Niveau 0 (docs/RECOVERY.md) : PIN seul, sans caméra ni micro.
            # Le seul chemin qui fonctionne quand la biométrie est morte.
            result = {
                "type": "auth_recovery_result",
                **self.auth.recovery_login(
                    str(data.get("pin") or ""),
                    username=data.get("username"),
                    connection_id=cid,
                ),
            }
            if result.get("ok") and result.get("event"):
                await ws.send(json.dumps(result["event"]))
                # Annoncé à voix haute : une entrée en secours ne doit jamais
                # être discrète. La maison doit entendre que quelqu'un est
                # entré par la porte de service.
                ev = await self.speak(
                    "Mode administrateur activé.",
                    user_id=(
                        self.auth.session_for(cid).user_id
                        if self.auth.session_for(cid)
                        else "local"
                    ),
                )
                await ws.send(json.dumps(ev))
        elif action == "elevate":
            result = {
                "type": "auth_elevate_result",
                **self.auth.elevate_admin(
                    method=str(data.get("method", "stub")),
                    connection_id=cid,
                ),
            }
            if result.get("ok") and result.get("event"):
                await ws.send(json.dumps(result["event"]))
        elif action == "revoke_admin":
            result = {"type": "auth_revoke_result", **self.auth.revoke_admin(connection_id=cid)}
        elif action == "logout":
            result = {"type": "auth_logout_result", **self.auth.logout(connection_id=cid)}
        elif action == "list_users":
            # Foyer / enrollment — réservé admin (dashboard_access ou user_management)
            sess = self.auth.session_for(cid)
            if not sess or not (
                "dashboard_access" in sess.permissions or "user_management" in sess.permissions
            ):
                result = {
                    "type": "auth_users",
                    "ok": False,
                    "error": "permission refusée (admin)",
                    "users": [],
                }
            else:
                result = {
                    "type": "auth_users",
                    "ok": True,
                    "users": [u.to_public_dict() for u in self.auth.users.list_users()],
                }
        else:
            result = {"type": "auth_error", "error": f"action inconnue: {action}"}

        await ws.send(json.dumps(result))
    def _session_user_id(self, ws: Any | None = None) -> str | None:
        if self.auth is None:
            return None
        try:
            cid = self.connection_id(ws) if ws is not None else None
            sess = self.auth.session_for(cid)
            if sess is None:
                st = self.auth.status(connection_id=cid)
                sess_data = st.get("session") or {}
                user = sess_data.get("user") or {}
            else:
                user = {"id": sess.user_id}
            uid = user.get("id")
            return str(uid) if uid else None
        except Exception:  # noqa: BLE001
            return None
