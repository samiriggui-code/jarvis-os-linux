"""Core executors — surfaces, vision, devices (Phase 6)."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

logger = logging.getLogger("jarvis.core")


class SurfaceExecutorsMixin:

    async def _execute_capabilities(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..capabilities import CAPABILITIES, allows
        from ..surfaces.publisher import publish_result_surface

        role = self._session_role()
        lines: list[str] = []
        for cap in CAPABILITIES.values():
            if not allows(cap, role):
                continue
            note = (cap.note or "").strip()
            lines.append(
                f"{cap.intent} · {cap.app_id}"
                + (f" — {note}" if note else "")
            )
        body = (
            f"{len(lines)} intentions disponibles pour votre profil. "
            "Demandez une action (« cherche… », « verrouille… ») : "
            "JARVIS ouvre une surface composée quand c’est pertinent."
        )
        await publish_result_surface(
            self,
            "reach",
            title="Outils & capacités",
            body=body,
            source="system.capabilities",
            items=lines[:30],
        )
        spoken = f"J'ai {len(lines)} intentions disponibles. Je les affiche."
        ev = await self.speak(spoken, user_id=self._session_user_id() or "local")
        await self.broadcast(ev)
        return {"ok": True, "count": len(lines)}

    async def _execute_introspect(self, payload: dict[str, Any]) -> dict[str, Any]:
        from pathlib import Path

        from ..capabilities import CAPABILITIES, allows
        from ..surfaces.publisher import publish_result_surface

        role = self._session_role()
        prompt = str(payload.get("prompt") or "").lower()
        items: list[str] = []

        items.append("—— Intentions orchestrateur ——")
        for cap in CAPABILITIES.values():
            if not allows(cap, role):
                continue
            items.append(f"{cap.intent} [{cap.owner.value}] · app={cap.app_id}")

        items.append("—— Composants surface (catalogue) ——")
        try:
            for name in sorted(self.surfaces.catalog.names):
                d = self.surfaces.catalog.get(name) or {}
                desc = str(d.get("description") or "")[:80]
                items.append(f"{name} — {desc}")
        except Exception as exc:  # noqa: BLE001
            items.append(f"(catalogue illisible : {exc})")

        items.append("—— Compétences Hermes (SKILL.md) ——")
        skill_roots = [
            Path("/opt/jarvis/deploy/hermes/skills"),
            Path(__file__).resolve().parents[2] / "deploy" / "hermes" / "skills",
        ]
        found = False
        for root in skill_roots:
            if not root.is_dir():
                continue
            for skill_md in sorted(root.glob("*/SKILL.md")):
                found = True
                name = skill_md.parent.name
                try:
                    head = skill_md.read_text(encoding="utf-8")[:400]
                    first = next(
                        (ln.strip("# ").strip() for ln in head.splitlines() if ln.strip()),
                        name,
                    )
                except Exception:  # noqa: BLE001
                    first = name
                items.append(f"skill:{name} — {first}")
            if found:
                break
        if not found:
            items.append("(aucun SKILL.md trouvé sous deploy/hermes/skills)")

        body = (
            "Introspection JARVIS : intentions, composants agentiques, compétences Hermes. "
            "Demandez une action précise pour l’exécuter (Policy → autorisation)."
        )
        if "code" in prompt:
            body += " Le code produit vit dans core/jarvis_core et hud/src — pas d’exécution shell libre."

        await publish_result_surface(
            self,
            "reach",
            title="Introspection JARVIS",
            body=body,
            source="system.introspect",
            items=items[:60],
        )
        spoken = "Voici ce que je peux faire — intentions, surfaces et compétences."
        ev = await self.speak(spoken, user_id=self._session_user_id() or "local")
        await self.broadcast(ev)
        return {"ok": True, "items": len(items)}

    async def _execute_camera_view(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..surface import SurfaceRejected, validate_document
        from ..surfaces.publisher import publish_result_surface

        prompt = str(payload.get("prompt") or "").strip().lower()
        lg = any(w in prompt for w in ("lg", "thinq", "chambre", "nuc"))

        await self.broadcast({"type": "hud_command", "action": "camera_on"})
        await self.broadcast({
            "type": "hud_command",
            "action": "open_space",
            "app": "vision",
        })
        await asyncio.sleep(0.2)

        body = (
            "Aperçu caméra du navigateur (getUserMedia). "
            + (
                "Caméra LG ThinQ / RTSP IP : pas encore câblée — "
                "sur le kiosk NUC, choisissez la webcam USB LG dans les permissions navigateur."
                if lg
                else "Demandez « caméra LG » pour le détail chambre / NUC."
            )
        )
        document = {
            "surfaces": {
                "vision": {
                    "root": ["cam-preview", "cam-note"],
                    "components": {
                        "cam-preview": {
                            "name": "CameraPreview",
                            "props": {"mirrored": True, "opacity": 1},
                            "state": "idle",
                        },
                        "cam-note": {
                            "name": "ResultPanel",
                            "props": {
                                "title": "Visuel caméra",
                                "body": body,
                                "source": "core.holomat",
                                "items": [
                                    "Flux = navigateur (pas ThinQ cloud)",
                                    "Kiosk NUC → webcam USB locale",
                                    "Distant → caméra du portable",
                                ],
                            },
                            "state": "idle",
                        },
                    },
                }
            }
        }
        try:
            permissions, context = self._surface_guards()
            document = validate_document(
                document,
                self.surfaces.catalog,
                permissions=permissions,
                context=context,
                bindings=self.bindings,
            )
        except SurfaceRejected as exc:
            logger.warning("surface caméra refusée · %s", exc)
            await publish_result_surface(
                self,
                "vision",
                title="Visuel caméra",
                body=f"Impossible d'afficher CameraPreview ({exc}). {body}",
                source="core.holomat",
                items=[],
            )
            spoken = "J'ouvre la caméra, mais la surface a été refusée."
            await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
            return {"ok": False, "reason": str(exc)}

        event = self.surfaces.snapshot(document)
        await self.broadcast(event)
        await asyncio.sleep(0.15)
        again = self.surfaces.resnapshot()
        if again is not None:
            await self.broadcast(again)

        spoken = "Voici le flux caméra."
        ev = await self.speak(spoken, user_id=self._session_user_id() or "local")
        await self.broadcast(ev)
        return {"ok": True, "app": "vision", "text": spoken}

    async def _execute_devices_list(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..device_software import inventory_stats, list_software_caps
        from ..surfaces.publisher import publish_result_surface

        rows = self.devices.list_devices()
        lines: list[str] = []
        for row in rows:
            device_id = str(row.get("device_id") or "")
            dev = self.devices.get_device(device_id)
            stats = inventory_stats(dev)
            inv_note = ""
            if stats:
                inv_note = (
                    f" · apps {stats.get('launchable_apps', '?')}/"
                    f"{stats.get('total_apps', '?')}"
                )
            runtime = str(row.get("runtime_kind") or row.get("type") or "")
            lines.append(
                f"{device_id} · {runtime} · "
                f"{'online' if row.get('online') else 'offline'}"
                f"{inv_note}"
            )
        body = f"{len(lines)} appareil(s) enregistré(s)."
        await publish_result_surface(
            self,
            "connexions",
            title="Connexions",
            body=body,
            source="devices.list",
            items=lines[:40],
        )
        spoken = f"J'affiche {len(lines)} connexions."
        await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
        return {"ok": True, "count": len(lines)}

    async def _execute_devices_software(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..device_software import inventory_stats, list_software_caps, planned_host_caps
        from ..surfaces.publisher import publish_result_surface

        origin = self.connections.device_for(getattr(self, "_intent_ws", None))
        items: list[str] = []
        agents = 0
        for dev in self.devices.iter_online():
            if dev.runtime_kind not in ("windows_agent", "fake_agent", ""):
                if dev.runtime_kind in ("browser", "web_hud", "web"):
                    continue
            software = list_software_caps(dev)
            if not software and dev.runtime_kind not in ("windows_agent", "fake_agent"):
                continue
            agents += 1
            if origin and dev.device_id != origin and dev.device_mode == "personal":
                continue
            stats = inventory_stats(dev)
            header = (
                f"=== {dev.device_id} · {stats.get('launchable_apps', 0)}/"
                f"{stats.get('total_apps', len(software))} lançables ==="
            )
            items.append(header)
            for row in software[:25]:
                mark = "✓" if row.get("launchable") else "·"
                items.append(f"  [{mark}] {row.get('display_name')} ({row.get('app_id')})")
            if len(software) > 25:
                items.append(f"  … +{len(software) - 25} autres")
            for planned in planned_host_caps(dev):
                items.append(
                    f"  [plan] {planned.get('capability_id')} → "
                    f"{planned.get('owner_target')}"
                )

        if not items:
            body = "Aucun inventaire logiciel — agent Windows hors ligne ?"
        else:
            body = f"Inventaire logiciel · {agents} agent(s)."
        await publish_result_surface(
            self,
            "connexions",
            title="Logiciels",
            body=body,
            source="devices.software",
            items=items[:60],
        )
        spoken = "Voici les logiciels déclarés par vos machines."
        await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
        return {"ok": True, "agents": agents}

    async def _execute_devices_metrics(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Santé PC — lit ``system.metrics`` des agents Windows online."""
        from ..surfaces.publisher import publish_result_surface

        items: list[str] = []
        agents = 0
        for dev in self.devices.iter_online():
            if dev.runtime_kind not in ("windows_agent", "fake_agent"):
                continue
            cap = dev.capabilities.get("system.metrics")
            if cap is None:
                continue
            agents += 1
            meta = cap.metadata if isinstance(cap.metadata, dict) else {}
            label = (dev.metadata or {}).get("hostname") or (dev.metadata or {}).get("label") or dev.device_id
            if not meta.get("ok"):
                items.append(f"=== {label} · métriques indisponibles ===")
                items.append(f"  {meta.get('error') or 'en attente'}")
                continue
            items.append(f"=== {label} ===")
            items.append(f"  CPU {meta.get('cpu_percent', '—')} %")
            items.append(
                f"  RAM {meta.get('ram_percent', '—')} % "
                f"({meta.get('ram_total_gb', '—')} Go)"
            )
            items.append(
                f"  Disque {meta.get('disk_percent', '—')} % "
                f"({meta.get('disk_total_gb', '—')} Go)"
            )
            items.append(f"  Processus {meta.get('process_count', '—')}")

        if not items:
            body = "Aucun agent Windows online avec system.metrics — agent déconnecté ?"
            spoken = "Je ne vois pas ton PC en ligne. Vérifie l'agent Windows."
        else:
            body = f"Santé machine · {agents} agent(s)."
            spoken = "Voici l'état de ton PC."

        await publish_result_surface(
            self,
            "connexions",
            title="Santé PC",
            body=body,
            source="devices.metrics",
            items=items[:40],
        )
        await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
        return {"ok": True, "agents": agents}

    async def _execute_devices_topology(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..surfaces.publisher import publish_result_surface

        nuc = self.devices.get_device("nuc-main")
        items: list[str] = []
        if nuc:
            items.append(f"nuc-main · core · mode={nuc.device_mode}")
        for dev in self.devices.list_devices():
            if dev.device_id == "nuc-main":
                continue
            items.append(
                f"{dev.device_id} · {dev.device_mode} · "
                f"{'online' if dev.online else 'offline'}"
            )
        await publish_result_surface(
            self,
            "reseau",
            title="Topologie",
            body="Appareils JARVIS et modes device.",
            source="devices.topology",
            items=items[:40],
        )
        spoken = "Voici la topologie réseau."
        await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
        return {"ok": True, "nodes": len(items)}

    @staticmethod
    def _parse_mission_project_name(payload: dict[str, Any]) -> str:
        direct = str(payload.get("project_name") or "").strip()
        if direct:
            return direct
        prompt = str(payload.get("prompt") or "")
        if match := re.search(
            r"(?:nouveau\s+)?projet\s+([\w\- ]{2,64})",
            prompt,
            flags=re.I,
        ):
            return match.group(1).strip()
        return ""

    async def _start_mission_dev_run(
        self,
        ws: Any | None,
        *,
        project_name: str,
        scenario: str = "cursor",
    ) -> dict[str, Any]:
        """Entrée unique tuile / voix / WS ``mission_dev``."""
        from ..policy import RiskLevel

        decision = self.policy.evaluate(
            action="mission_dev_start",
            text=project_name,
            risk=RiskLevel.INFO,
        )
        if not decision.allowed:
            err = decision.reason or "Action refusée par la Policy Engine."
            payload = {"type": "mission_dev_error", "error": err}
            await self.broadcast(payload)
            if ws is not None:
                await ws.send(json.dumps(payload))
            return {"ok": False, "intent": "core.mission_dev", "error": err}

        hermes_ok: bool | None = None
        hermes = self.supervisor.components.get("hermes")
        if hermes is not None:
            from ..supervisor import READY

            hermes_ok = hermes.state == READY

        async def send(payload: dict[str, Any]) -> None:
            await self.broadcast(payload)
            if ws is not None:
                await ws.send(json.dumps(payload))

        async def speak(text: str) -> None:
            uid = self._session_user_id(ws) or "local"
            if ws is not None:
                await ws.send(json.dumps(self.cmd("set_orb_state", state="speaking")))
            ev = await self.speak(text, user_id=uid)
            if ws is not None:
                await ws.send(json.dumps(ev))
                if ev.get("type") == "tts_skipped":
                    await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))

        await self.mission_dev.start(
            send=send,
            speak=speak,
            project_name=project_name,
            scenario=scenario,
            owner_user_id=self._session_user_id(ws),
            hermes_ok=hermes_ok,
            hermes_bridge=self.hermes,
            session_role=self._session_role(ws),
        )
        return {
            "ok": True,
            "intent": "core.mission_dev",
            "started": True,
            "project_name": project_name,
        }

    async def _execute_mission_dev(self, payload: dict[str, Any]) -> dict[str, Any]:
        ws = getattr(self, "_intent_ws", None)
        project_name = self._parse_mission_project_name(payload)
        if project_name:
            return await self._start_mission_dev_run(
                ws,
                project_name=project_name,
                scenario=str(payload.get("scenario") or "cursor"),
            )

        await self.broadcast({
            "type": "hud_command",
            "action": "open_space",
            "app": "mission-control-dev",
        })
        await self._publish_mission_dev_board(
            voice_hint=(
                "Voix : « nouveau ticket … » · « assigne à cursor » · "
                "« lance le run » · « nouveau projet MonNom » pour une mission complète."
            ),
        )
        spoken = "Mission Control Dev — board ouvert. Parlez pour agir."
        await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
        return {
            "ok": True,
            "intent": "core.mission_dev",
            "text": spoken,
        }

    async def _maybe_publish_surface_decision(
        self,
        *,
        intent: str | None = None,
        tool: str | None = None,
        debounce_key: str | None = None,
        summary: str | None = None,
    ) -> bool:
        from ..surface import SurfaceRejected, validate_document
        from ..surface_decision import decide_document

        decided = decide_document(intent=intent, tool=tool, summary=summary)
        if decided is None:
            return False
        surface_id, document = decided

        key = debounce_key or f"{intent or ''}:{tool or ''}:{surface_id}"
        now = time.monotonic()
        last_at: dict[str, float] = getattr(self, "_surface_decision_at", {})
        if key in last_at and (now - last_at[key]) < 5.0:
            return False

        try:
            permissions, context = self._surface_guards()
            document = validate_document(
                document,
                self.surfaces.catalog,
                permissions=permissions,
                context=context,
                bindings=self.bindings,
            )
        except SurfaceRejected as exc:
            logger.warning("surface decision refusée · %s — %s", surface_id, exc)
            return False
        except Exception as exc:  # noqa: BLE001
            logger.warning("surface decision impossible · %s", exc)
            return False

        event = self.surfaces.snapshot(document)
        await self.broadcast(
            {
                "type": "hud_command",
                "action": "open_space",
                "app": surface_id,
            }
        )
        await asyncio.sleep(0.25)
        await self.broadcast(event)
        await asyncio.sleep(0.15)
        again = self.surfaces.resnapshot()
        if again is not None:
            await self.broadcast(again)

        last_at[key] = time.monotonic()
        self._surface_decision_at = last_at
        logger.info(
            "surface decision · intent=%s tool=%s → surface_id=%s",
            intent,
            tool,
            surface_id,
        )
        return True

    async def _on_hermes_agent_event(self, ev: Any) -> None:
        from ..tool_events import AgentToolEvent, record_tool_event, timeline_payload_agent

        if not isinstance(ev, AgentToolEvent):
            return
        payload = timeline_payload_agent(ev)
        self.emit("TOOL_EVENT", payload, source="hermes")
        await self.broadcast(payload)
        try:
            from ..capabilities import for_intent

            cap = for_intent(ev.intent) if ev.intent else None
            record_tool_event(
                ev.to_journal(
                    owner="hermes",
                    risk=int(cap.risk) if cap else 0,
                    operation=cap.operation.value if cap else None,
                    role=self._session_role(),
                    user_id=self._session_user_id(),
                )
            )
        except Exception:  # noqa: BLE001
            logger.debug("journal AgentToolEvent ignoré", exc_info=True)

        if ev.event in ("tool.started", "tool.completed", "agent.completed"):
            await self._maybe_publish_surface_decision(
                intent=ev.intent,
                tool=ev.tool,
                summary=ev.summary,
                debounce_key=f"hermes:{ev.run_id or ''}:{ev.intent or ''}:{ev.tool or ''}:{ev.event}",
            )

    async def _publish_result_surface(
        self,
        surface_id: str,
        *,
        title: str,
        body: str,
        source: str = "",
        items: list[str] | None = None,
    ) -> None:
        from ..surfaces.publisher import publish_result_surface

        await publish_result_surface(
            self,
            surface_id,
            title=title,
            body=body,
            source=source,
            items=items,
        )

    def _surface_component_name(self, surface_id: str, component_id: str) -> str | None:
        surface = self.surfaces.document.get("surfaces", {}).get(surface_id)
        if not isinstance(surface, dict):
            return None
        node = surface.get("components", {}).get(component_id)
        return node.get("name") if isinstance(node, dict) else None

    def _surface_guards(self) -> tuple[set[str], set[str]]:
        from ..surface import permissions_for

        permissions = permissions_for(self._session_role(), self.surfaces.catalog)
        context: set[str] = {"camera"}
        if getattr(self, "face", None) is not None:
            context.add("face")
        return permissions, context
