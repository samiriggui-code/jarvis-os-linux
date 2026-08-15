"""Phase 2 — handlers WS."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

logger = logging.getLogger("jarvis.core")

from ...ws.peripherals import PERIPHERAL_LINES
from ...ws.routes import PERIPHERAL_DETECT_GROUP_S, ROUTES


class SystemHandlerMixin:
    _PERIPHERAL_LINES = PERIPHERAL_LINES

    async def handle_device(self, ws: Any, data: dict[str, Any]) -> None:
        """WS ``type=device`` — délègue au DeviceRegistry (discovery only)."""
        result = self.devices.handle_message(data if isinstance(data, dict) else {})
        if result.get("ok") and result.get("type") == "device_registered":
            device = result.get("device") or {}
            device_id = str(device.get("device_id") or data.get("device_id") or "")
            if device_id:
                self.connections.set_device(ws, device_id)
        await ws.send(json.dumps(result))

    async def handle_device_execute_result(self, ws: Any, data: dict[str, Any]) -> None:
        """Agent → Core : résultat ``device.execute`` (P4 + P5 accept)."""
        from ...dev_agent.types import CAPABILITY_DEV_AGENT_RUN

        request_id = str(data.get("request_id") or "")
        cap_id = str(data.get("capability_id") or "")
        if cap_id == CAPABILITY_DEV_AGENT_RUN:
            accepted = self.dev_agent_dispatch.complete_accept(request_id, data)
        else:
            accepted = self.device_dispatch.complete(request_id, data)
        await ws.send(
            json.dumps(
                {
                    "ok": accepted,
                    "type": "device_execute_result_ack",
                    "request_id": request_id,
                }
            )
        )

    async def handle_device_run_progress(self, ws: Any, data: dict[str, Any]) -> None:
        accepted = self.dev_agent_dispatch.on_progress(data)
        await ws.send(
            json.dumps(
                {
                    "ok": accepted,
                    "type": "device_run_progress_ack",
                    "run_id": data.get("run_id"),
                }
            )
        )

    async def handle_device_run_completed(self, ws: Any, data: dict[str, Any]) -> None:
        accepted = self.dev_agent_dispatch.on_completed(data)
        await ws.send(
            json.dumps(
                {
                    "ok": accepted,
                    "type": "device_run_completed_ack",
                    "run_id": data.get("run_id"),
                }
            )
        )

    async def handle_device_run_failed(self, ws: Any, data: dict[str, Any]) -> None:
        accepted = self.dev_agent_dispatch.on_failed(data)
        await ws.send(
            json.dumps(
                {
                    "ok": accepted,
                    "type": "device_run_failed_ack",
                    "run_id": data.get("run_id"),
                }
            )
        )

    async def handle_device_run_cancel_result(self, ws: Any, data: dict[str, Any]) -> None:
        accepted = self.dev_agent_dispatch.on_cancel_result(data)
        await ws.send(
            json.dumps(
                {
                    "ok": accepted,
                    "type": "device_run_cancel_result_ack",
                    "run_id": data.get("run_id"),
                }
            )
        )

    async def handle_device_run_status_result(self, ws: Any, data: dict[str, Any]) -> None:
        accepted = self.dev_agent_dispatch.on_status_result(data)
        await ws.send(
            json.dumps(
                {
                    "ok": accepted,
                    "type": "device_run_status_result_ack",
                    "run_id": data.get("run_id"),
                }
            )
        )

    async def handle_peripheral(self, ws: Any, data: dict[str, Any]) -> None:
        """Le HUD rapporte l'état d'un périphérique. On ne parle qu'au CHANGEMENT.

        Répéter « branchez votre caméra » toutes les dix secondes pendant que
        l'utilisateur cherche le bon câble, c'est la meilleure façon de faire
        débrancher l'enceinte aussi. Le constat est dit une fois ; ensuite,
        silence, jusqu'à ce que l'état change réellement.
        """
        device = str(data.get("device", ""))
        lines = self._PERIPHERAL_LINES.get(device)
        if lines is None:
            return
        missing, denied, ready, lost = lines

        ok = bool(data.get("ok", False))
        reason = str(data.get("reason") or "")
        previous = self._peripherals.get(device)
        self._peripherals[device] = ok

        # La caméra alimente aussi la vérification de démarrage HOLOMAT VISION.
        if device == "camera":
            self.note_camera(ok, None if ok else (reason or "camera_unavailable"))

        if previous == ok:
            return  # rien de neuf : on se tait

        # Pendant auth/boot ou session déjà ouverte : on MET À JOUR l'état
        # mais on ne parle pas. Sinon denied→ready caméra double le monologue
        # d'identification, et continue après unlock.
        running = getattr(self.sequences, "_running", None)
        session_open = bool(self.auth is not None and getattr(self.auth, "active", None))
        quiet = bool(getattr(self, "_voice_quiet", False) or session_open
                     or running in ("auth", "boot", "enrollment", "unlock", "lock", "lock_auto"))
        if quiet:
            return

        if not ok:
            # Le refus d'accès prime sur tout le reste : le matériel EST là,
            # et « rebranchez votre caméra » enverrait chercher un câble déjà
            # en place. Sans ce test en premier, une permission révoquée en
            # cours de session s'annonçait « le flux s'est interrompu ».
            if reason == "denied":
                await self.say(denied)
            else:
                # « Perdu » ≠ « absent » : le premier suppose qu'on l'avait.
                await self.say(lost if previous is True else missing)
            return

        # Premier rapport favorable : c'est l'état NOMINAL, il n'y a rien à
        # annoncer. Dire « Sortie audio rétablie » au démarrage, alors qu'elle
        # n'a jamais manqué, c'est parler d'un incident qui n'a pas eu lieu.
        if previous is None:
            return

        # Retour à la normale. `peripheral_detecting` d'abord : c'est la
        # phrase qui accuse réception du geste, et qui dit à l'utilisateur
        # qu'il peut lâcher le câble.
        #
        # Une webcam à micro intégré fait remonter DEUX périphériques d'un
        # coup : un seul geste, donc une seule annonce de détection. Sans ce
        # garde-fou on entend « Un instant, détection en cours » deux fois de
        # suite, ce qui donne l'impression que le premier essai a raté.
        now = time.monotonic()
        if now - self._detecting_said_at > PERIPHERAL_DETECT_GROUP_S:
            self._detecting_said_at = now
            await self.say("peripheral_detecting")
        await self.say(ready)

        known = [self._peripherals.get(d) for d in self._PERIPHERAL_LINES]
        if all(v is True for v in known):
            await self.say("peripheral_all_ready")
            await self.say("peripheral_resume")
    async def handle_gesture(self, ws: Any, data: dict[str, Any]) -> None:
        """Confidences MediaPipe → bus. Le HUD mesure, le bus décide.

        Rien n'est renvoyé sur `ws` : c'est le seul handler muet, et c'est
        voulu. Le HUD apprendra qu'un geste a été retenu en recevant
        `GESTURE_DETECTED` par le forwarder, comme n'importe quel client.
        """
        from ...gestures import signals_from_hud

        for kind, payload in signals_from_hud(data):
            self.bus.publish(kind, payload, source="hud")
    async def handle_preferences(self, ws: Any, data: dict[str, Any]) -> None:
        """save/get hud_preferences + gesture_profile → core/data/users/<id>/."""
        from ...auth.profiles import (
            load_gesture_profile,
            load_hud_preferences,
            resolve_user_id,
            save_gesture_profile,
            save_hud_preferences,
        )

        action = str(data.get("action", "get"))
        user_id = resolve_user_id(
            str(data.get("user_id") or data.get("userId") or "") or None,
            self._session_user_id(),
        )

        if action in ("get", "get_hud_preferences", "load"):
            prefs = load_hud_preferences(user_id)
            gesture = load_gesture_profile(user_id)
            await ws.send(json.dumps({
                "type": "preferences_result",
                "ok": True,
                "user_id": user_id,
                "prefs": prefs,
                "gesture": gesture,
            }))
            return

        if action in ("save_hud_preferences", "save_prefs"):
            prefs = data.get("prefs")
            if not isinstance(prefs, dict):
                await ws.send(json.dumps({"type": "preferences_result", "ok": False, "error": "prefs requis"}))
                return
            result = save_hud_preferences(user_id, prefs)
            await ws.send(json.dumps({"type": "preferences_result", "action": "save_hud_preferences", **result}))
            return

        if action in ("save_gesture_profile", "save_gesture"):
            profile = data.get("profile")
            if not isinstance(profile, dict):
                await ws.send(json.dumps({"type": "preferences_result", "ok": False, "error": "profile requis"}))
                return
            result = save_gesture_profile(user_id, profile)
            # La sensibilité prend effet tout de suite : pas besoin de relancer.
            self._apply_gesture_sensitivity(profile)
            # …et les bindings aussi, sinon le routeur servirait son cache.
            self.gestures.invalidate()
            if self.auth is not None and user_id != "local":
                try:
                    self.auth.users.mark_biometrics(user_id, gesture=True)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("mark gesture_enrolled: %s", exc)
            await ws.send(json.dumps({"type": "preferences_result", "action": "save_gesture_profile", **result}))
            return

        await ws.send(json.dumps({"type": "preferences_result", "ok": False, "error": f"action inconnue: {action}"}))
    async def handle_memory(self, ws: Any, data: dict[str, Any]) -> None:
        """Memory Manager local — type=memory → memories.json par user."""
        from ...auth.profiles import resolve_user_id
        from ... import memory as mem

        action = str(data.get("action", "list"))
        user_id = resolve_user_id(
            str(data.get("user_id") or data.get("userId") or "") or None,
            self._session_user_id(),
        )

        if action in ("list", "get", "status"):
            items = mem.list_items(user_id)
            await ws.send(json.dumps({
                "type": "memory_result",
                "ok": True,
                "action": "list",
                "user_id": user_id,
                "items": items,
                "sync": {
                    "local": True,
                    "cloud": False,
                    "git": False,
                },
            }))
            return

        if action in ("add", "create"):
            title = str(data.get("title") or "Souvenir")
            content = str(data.get("content") or "")
            tags = data.get("tags") if isinstance(data.get("tags"), list) else ["notes"]
            if not content.strip():
                await ws.send(json.dumps({"type": "memory_result", "ok": False, "error": "content requis"}))
                return
            item = mem.add_item(user_id, title=title, content=content, tags=[str(t) for t in tags])
            await ws.send(json.dumps({
                "type": "memory_result",
                "ok": True,
                "action": "add",
                "item": item,
                "items": mem.list_items(user_id),
                "sync": {"local": True, "cloud": False, "git": False},
            }))
            return

        if action == "delete":
            item_id = str(data.get("id") or data.get("item_id") or "")
            ok = mem.delete_item(user_id, item_id) if item_id else False
            await ws.send(json.dumps({
                "type": "memory_result",
                "ok": ok,
                "action": "delete",
                "items": mem.list_items(user_id),
                "error": None if ok else "introuvable",
            }))
            return

        await ws.send(json.dumps({"type": "memory_result", "ok": False, "error": f"action inconnue: {action}"}))

    async def handle_tool_timeline(self, ws: Any, data: dict[str, Any]) -> None:
        """Bootstrap / refresh timeline outils — P2 HUD."""
        from ...tool_events import fetch_recent_timeline, timeline_snapshot_payload

        action = str(data.get("action") or "snapshot")
        if action == "snapshot":
            limit = int(data.get("limit") or 50)
            await ws.send(json.dumps(timeline_snapshot_payload(limit)))
            return
        if action == "recent":
            limit = int(data.get("limit") or 20)
            await ws.send(json.dumps({
                "type": "tool_timeline",
                "events": fetch_recent_timeline(limit),
            }))
            return
        await ws.send(json.dumps({
            "type": "core_error",
            "error": f"action tool_timeline inconnue: {action}",
        }))

    async def handle_ping(self, ws: Any, data: dict[str, Any]) -> None:
        await ws.send(
            json.dumps(
                self.cmd(
                    "display_notification",
                    message="Core en ligne — lien HUD établi.",
                    duration=3.0,
                )
            )
        )
    async def handle_stop_run(self, ws: Any, data: dict[str, Any]) -> None:
        """Barge-in : coupe la parole + annule la mission DEV en cours."""
        if self.mission_dev.running:
            self.mission_dev.abort()
        if self.voice is not None:
            await ws.send(json.dumps(self.voice.cancel()))
        await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))
    async def handle_mission_dev(self, ws: Any, data: dict[str, Any]) -> None:
        """Mission Control DEV — start / abort (scenario cursor Phase A).

        Cockpit de développement uniquement. Le cockpit maison (Mission Control
        HOME) aura son propre type WS ; les deux ne se croisent jamais ici.
        """
        action = str(data.get("action", "start"))

        async def send(payload: dict[str, Any]) -> None:
            await ws.send(json.dumps(payload))

        if action == "abort":
            self.mission_dev.abort()
            await send({"type": "mission_dev_finished", "ok": False, "error": "aborted"})
            return

        if action != "start":
            await send({"type": "mission_dev_error", "error": f"action inconnue: {action}"})
            return

        pname = str(data.get("project_name") or "").strip()
        if not pname:
            await send({
                "type": "mission_dev_error",
                "error": "Nom de projet manquant — dites « nouveau projet MonNom ».",
            })
            return

        await self._start_mission_dev_run(
            ws,
            project_name=pname,
            scenario=str(data.get("scenario") or "cursor"),
        )

    async def handle_mission_board(self, ws: Any, data: dict[str, Any]) -> None:
        """Mission DEV Board — kanban local (list/create/move/assign/comment/inbox)."""
        from ...mission_dev.board import BoardStoreError

        action = str(data.get("action") or "list")

        async def send(payload: dict[str, Any]) -> None:
            await ws.send(json.dumps(payload))

        try:
            result = self.mission_board.handle(
                action,
                data if isinstance(data, dict) else {},
                dev_runs=self.dev_runs,
            )
            await send({
                "type": "mission_board_result",
                "ok": True,
                "action": action,
                **result,
            })
        except BoardStoreError as exc:
            await send({
                "type": "mission_board_result",
                "ok": False,
                "action": action,
                "error": str(exc),
                "code": exc.code,
            })
        except Exception as exc:  # noqa: BLE001
            logger.exception("mission_board %s", action)
            await send({
                "type": "mission_board_result",
                "ok": False,
                "action": action,
                "error": str(exc),
            })

    async def handle_supervisor(self, ws: Any, data: dict[str, Any]) -> None:
        """État réel de chaque brique — ce que le HUD affiche au boot."""
        action = str(data.get("action", "status"))
        if action == "status":
            await ws.send(json.dumps({
                "type": "supervisor_status",
                **self.supervisor.status(),
                "bus": self.bus.stats(),
            }))
            return
        if action == "check":
            # Sonde tout de suite au lieu d'attendre le prochain tick.
            for comp in self.supervisor.components.values():
                comp.last_check = float("-inf")
            await self.supervisor.tick()
            await ws.send(json.dumps({
                "type": "supervisor_status",
                **self.supervisor.status(),
            }))
            return
        await ws.send(json.dumps({
            "type": "supervisor_status",
            "ok": False,
            "error": f"action inconnue: {action}",
        }))
    async def handle_agent_reach(self, ws: Any, data: dict[str, Any]) -> None:
        from ...agent_reach_status import status as reach_status

        action = str(data.get("action", "status"))
        if action in ("status", "doctor"):
            await ws.send(json.dumps({"type": "agent_reach_status", **reach_status()}))
            return
        await ws.send(json.dumps({
            "type": "agent_reach_status",
            "ok": False,
            "error": f"action inconnue: {action}",
        }))
    async def handle_providers(self, ws: Any, data: dict[str, Any]) -> None:
        """AI Provider Manager — requête directe (dashboard admin).

        Même donnée que la voix ``core.providers`` (executors/system.py), sans
        publier de surface ni parler : une simple lecture pour un client qui
        affiche, pas pour une composition HUD.
        """
        from ...usage import fetch_ollama_status, fetch_openrouter_key

        action = str(data.get("action", "status"))
        if action != "status":
            await ws.send(json.dumps({
                "type": "providers_result",
                "ok": False,
                "error": f"action inconnue: {action}",
            }))
            return
        mode = self.providers.current_mode()
        or_info = fetch_openrouter_key()
        ollama = fetch_ollama_status()
        await ws.send(json.dumps({
            "type": "providers_result",
            "ok": True,
            "mode": mode,
            "openrouter": or_info,
            "ollama": ollama,
        }))

    async def handle_hermes(self, ws: Any, data: dict[str, Any]) -> None:
        """Statut Hermes — requête directe (dashboard admin).

        Santé + toolsets réellement `enabled`/`configured` côté Hermes (pas la
        liste déclarée côté Core dans capabilities.py) — même lecture que
        celle qui décide en interne si une délégation est possible
        (``HermesBridge._usable``), exposée en lecture seule ici.
        """
        action = str(data.get("action", "status"))
        if action != "status":
            await ws.send(json.dumps({
                "type": "hermes_result",
                "ok": False,
                "error": f"action inconnue: {action}",
            }))
            return
        healthy = await self.hermes.health()
        toolsets: list[dict[str, Any]] = []
        if healthy:
            try:
                toolsets = await self.hermes.toolsets()
            except Exception as exc:  # noqa: BLE001 — statut dégradé, pas une panne du handler
                logger.warning("hermes.toolsets(): %s", exc)
        await ws.send(json.dumps({
            "type": "hermes_result",
            "ok": True,
            "configured": self.hermes.configured,
            "healthy": healthy,
            "url": self.hermes.url,
            "toolsets": toolsets,
        }))

    async def handle_voicebox(self, ws: Any, data: dict[str, Any]) -> None:
        """Statut voicebox — requête directe (dashboard admin).

        `VoiceManager.available` reste `None` tant qu'aucune sonde n'a eu
        lieu — on sonde ici plutôt que de renvoyer un statut jamais mesuré.
        """
        action = str(data.get("action", "status"))
        if action != "status":
            await ws.send(json.dumps({
                "type": "voicebox_result",
                "ok": False,
                "error": f"action inconnue: {action}",
            }))
            return
        if self.voice is None:
            await ws.send(json.dumps({
                "type": "voicebox_result",
                "ok": True,
                "available": False,
                "error": "VoiceManager non initialisé sur ce Core",
            }))
            return
        await self.voice.probe()
        await ws.send(json.dumps({
            "type": "voicebox_result",
            "ok": True,
            **self.voice.status(),
        }))

    async def handle_usage(self, ws: Any, data: dict[str, Any]) -> None:
        """Dashboard tokens — summary + séries + snapshots OpenRouter/ElevenLabs/Ollama."""
        from ...usage import dashboard_payload_async, series

        action = str(data.get("action", "summary"))
        gran = str(data.get("granularity", "day"))
        if gran not in ("hour", "day", "week", "month"):
            gran = "day"
        if action in ("summary", "dashboard", "status"):
            payload = await dashboard_payload_async(gran)
            await ws.send(json.dumps({"type": "usage_result", **payload}))
            return
        if action == "series":
            pts = await asyncio.to_thread(series, gran)
            await ws.send(json.dumps({
                "type": "usage_result",
                "ok": True,
                "granularity": gran,
                "series": pts,
            }))
            return
        await ws.send(json.dumps({
            "type": "usage_result",
            "ok": False,
            "error": f"action inconnue: {action}",
        }))
    async def on_message(self, ws: Any, raw: str) -> None:
        try:
            if isinstance(raw, (bytes, bytearray)):
                raw = raw.decode("utf-8", errors="replace")
            data = json.loads(raw)
        except json.JSONDecodeError:
            return
        if not isinstance(data, dict):
            return

        kind = str(data.get("type") or "")
        route = ROUTES.get(kind)
        if route is None:
            logger.debug("type WS ignoré : %r", kind)
            return

        payload = route.rewrite(data) if route.rewrite else data
        handler = getattr(self, route.handler)
        try:
            await handler(ws, payload)
        except Exception as exc:  # noqa: BLE001 — un handler cassé ne tue pas la connexion
            logger.exception("handler %s (%s) : %s", route.handler, kind, exc)
            await ws.send(json.dumps({
                "type": route.error_type,
                **route.error_extra,
                "error": str(exc),
            }))
