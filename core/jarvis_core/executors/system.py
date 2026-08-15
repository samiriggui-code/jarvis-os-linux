"""Core executors — tuiles système (P0 : stubs → vrais exécutants)."""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.core")


class SystemExecutorsMixin:

    async def _publish_validated_surface(
        self, surface_id: str, document: dict[str, Any]
    ) -> bool:
        """Diffuse un document surface admissible (sans debounce tool_event)."""
        from ..surface import SurfaceRejected, validate_document

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
            logger.warning("surface refusée · %s — %s", surface_id, exc)
            return False
        except Exception as exc:  # noqa: BLE001
            logger.warning("surface impossible · %s", exc)
            return False

        await self.broadcast(
            {"type": "hud_command", "action": "open_space", "app": surface_id}
        )
        await asyncio.sleep(0.25)
        event = self.surfaces.snapshot(document)
        await self.broadcast(event)
        await asyncio.sleep(0.15)
        again = self.surfaces.resnapshot()
        if again is not None:
            await self.broadcast(again)
        return True

    async def _execute_preferences(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..auth.profiles import load_hud_preferences
        from ..surfaces.publisher import publish_result_surface

        uid = self._session_user_id() or "local"
        prefs = load_hud_preferences(uid) or {}
        locale = prefs.get("locale") if isinstance(prefs.get("locale"), dict) else {}
        voice = prefs.get("voice") if isinstance(prefs.get("voice"), dict) else {}
        items = [
            f"user_id · {uid}",
            f"locale.mode · {locale.get('mode', '—')}",
            f"locale.sticky · {locale.get('stickyLanguage', '—')}",
            f"voice.preset · {voice.get('preset', prefs.get('voicePreset', '—'))}",
            f"clés prefs · {', '.join(sorted(k for k in prefs if k not in ('locale', 'voice'))) or '—'}",
        ]
        body = (
            "Préférences HUD chargées depuis le profil utilisateur. "
            "Les modifications passent par le panneau Réglages ou WS preferences."
        )
        await self.broadcast(
            {"type": "hud_command", "action": "open_space", "app": "settings"}
        )
        await publish_result_surface(
            self,
            "settings",
            title="Préférences",
            body=body,
            source="core.preferences",
            items=items,
        )
        spoken = "Voici vos préférences HUD."
        await self.broadcast(await self.speak(spoken, user_id=uid))
        return {"ok": True, "user_id": uid, "keys": list(prefs.keys())}

    async def _execute_neural_map(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..capabilities import CAPABILITIES, Owner
        from ..surfaces.publisher import publish_result_surface

        await self.broadcast(
            {"type": "hud_command", "action": "open_space", "app": "jarvis"}
        )
        core_n = sum(1 for c in CAPABILITIES.values() if c.owner is Owner.CORE)
        hermes_n = sum(1 for c in CAPABILITIES.values() if c.owner is Owner.HERMES)
        items = [
            f"intentions Core · {core_n}",
            f"intentions Hermes · {hermes_n}",
            f"Hermes · {getattr(self.hermes, 'url', '—')}",
            f"Provider · {self.providers.current_mode()}",
            "Circuit · match_intent → Policy → host_gate → IntentExecutor",
        ]
        body = (
            "Carte neurale : intentions enregistrées, pont Hermes, mode LLM actif. "
            "Demandez « introspection » pour le détail composants et skills."
        )
        await publish_result_surface(
            self,
            "jarvis",
            title="Neural Map",
            body=body,
            source="core.neural_map",
            items=items,
        )
        spoken = "J'ouvre la carte neurale."
        await self.broadcast(
            await self.speak(spoken, user_id=self._session_user_id() or "local")
        )
        return {"ok": True}

    async def _execute_dashboard(self, payload: dict[str, Any]) -> dict[str, Any]:
        await self.broadcast(
            {"type": "hud_command", "action": "open_space", "app": "hub"}
        )
        spoken = "J'ouvre le cockpit administrateur."
        await self.broadcast(
            await self.speak(spoken, user_id=self._session_user_id() or "local")
        )
        return {"ok": True, "app": "hub", "intent": "core.dashboard"}

    async def _execute_monitor(self, payload: dict[str, Any]) -> dict[str, Any]:
        from .. import metrics
        from ..surface_decision import decide_document, monitor_document
        from ..surfaces.publisher import publish_result_surface

        snap = self.supervisor.status()
        degraded = len(snap.get("degraded") or [])
        sample = metrics.sample(degraded=degraded) if metrics.AVAILABLE else None

        decided = decide_document(intent="core.monitor")
        if decided:
            _, document = decided
            if not await self._publish_validated_surface("monitor", document):
                await publish_result_surface(
                    self,
                    "monitor",
                    title="Moniteur",
                    body="SystemMonitor refusé — métriques texte ci-dessous.",
                    source="core.monitor",
                    items=[],
                )
        else:
            await self._publish_validated_surface("monitor", monitor_document())

        items: list[str] = []
        if sample:
            items.extend(
                [
                    f"CPU · {sample.get('cpu')}%",
                    f"RAM · {sample.get('ram')}% ({sample.get('ram_used_gb')} / {sample.get('ram_total_gb')} Go)",
                    f"Disque · {sample.get('disk')}%",
                    f"Uptime · {sample.get('uptime_s')} s",
                    f"Menace · {sample.get('threat_level')} ({sample.get('threat')})",
                ]
            )
        for comp in snap.get("components") or []:
            if isinstance(comp, dict):
                items.append(
                    f"{comp.get('name')} · {comp.get('state')} · {comp.get('detail') or '—'}"
                )

        spoken = "Moniteur système ouvert."
        if sample and sample.get("threat_level") in ("high", "critical"):
            spoken = f"Attention — charge {sample.get('threat_level')}."
        await self.broadcast(
            await self.speak(spoken, user_id=self._session_user_id() or "local")
        )
        return {"ok": True, "metrics": sample is not None, "components": len(items)}

    async def _execute_security(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..surfaces.publisher import publish_result_surface

        snap = self.supervisor.status()
        items = [
            "Policy · IA → Proposition → Policy → Autorisation → Exécution",
            "Hermes · pont unique, toolsets par rôle de session",
            "Surfaces · admission catalogue + gravité côté Core",
            f"Session · rôle={self._session_role()} user={self._session_user_id() or '—'}",
        ]
        for comp in snap.get("components") or []:
            if isinstance(comp, dict) and comp.get("name") in ("hermes", "voice", "users"):
                items.append(f"brique {comp.get('name')} · {comp.get('state')}")

        body = (
            "État sécurité et gouvernance : Policy Engine, sessions WS, admission surfaces. "
            "Aucun secret n'est affiché ici."
        )
        await publish_result_surface(
            self,
            "security",
            title="Sécurité & Policy",
            body=body,
            source="core.security",
            items=items[:25],
        )
        spoken = "Voici l'état sécurité et policy."
        await self.broadcast(
            await self.speak(spoken, user_id=self._session_user_id() or "local")
        )
        return {"ok": True}

    async def _execute_providers(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..surfaces.publisher import publish_result_surface
        from ..usage import fetch_ollama_status, fetch_openrouter_key

        mode = self.providers.current_mode()
        or_info = fetch_openrouter_key()
        ollama = fetch_ollama_status()
        items = [
            f"mode actif · {mode}",
            f"OpenRouter · {'ok' if or_info.get('ok') else or_info.get('error', 'non configuré')}",
            f"Ollama · {'ok' if ollama.get('ok') else ollama.get('error', 'non configuré')}",
        ]
        if ollama.get("model_count"):
            items.append(f"Ollama modèles · {ollama.get('model_count')}")
        if or_info.get("label"):
            items.append(f"OpenRouter label · {or_info.get('label')}")

        body = (
            "AI Provider Manager — bascule OpenRouter → Ollama VPS → mode système. "
            "Chat libre et compose passent par ce routeur."
        )
        await publish_result_surface(
            self,
            "cerveau",
            title="Cerveau / Providers",
            body=body,
            source="core.providers",
            items=items,
        )
        spoken = f"Mode LLM actif : {mode}."
        await self.broadcast(
            await self.speak(spoken, user_id=self._session_user_id() or "local")
        )
        return {"ok": True, "mode": mode}

    async def _execute_usage(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..surfaces.publisher import publish_result_surface
        from ..usage import dashboard_payload_async

        dash = await dashboard_payload_async(granularity="day")
        totals_root = dash.get("totals") if isinstance(dash.get("totals"), dict) else {}
        day = totals_root.get("day") if isinstance(totals_root.get("day"), dict) else {}
        items = [
            f"tokens (24h) · {day.get('tokens', 0)}",
            f"coût USD (24h) · {day.get('cost', 0)}",
            f"appels (24h) · {day.get('calls', 0)}",
            f"base · {dash.get('db', '—')}",
        ]
        for key in ("openrouter", "ollama", "elevenlabs"):
            block = dash.get(key) if isinstance(dash.get(key), dict) else {}
            if block.get("configured"):
                status = "ok" if block.get("ok") else block.get("error", "?")
                items.append(f"{key} · {status}")

        body = "Consommation tokens et snapshots providers (OpenRouter, Ollama, ElevenLabs)."
        await publish_result_surface(
            self,
            "tokens",
            title="Usage & tokens",
            body=body,
            source="core.usage",
            items=items,
        )
        spoken = "Voici la consommation tokens."
        await self.broadcast(
            await self.speak(spoken, user_id=self._session_user_id() or "local")
        )
        return {"ok": True, "totals": day}

    async def _execute_network(self, payload: dict[str, Any]) -> dict[str, Any]:
        role = metrics.host_role() if metrics.AVAILABLE else "core"
        items = [
            f"hôte Core · {host} ({role})",
            f"Hermes · {getattr(self.hermes, 'url', '—')}",
            f"Voicebox · {getattr(getattr(self.voice, 'client', None), 'base', '—')}",
        ]
        for dev in self.devices.list_devices()[:12]:
            if not isinstance(dev, dict):
                continue
            items.append(
                f"{dev.get('device_id')} · {'online' if dev.get('online') else 'offline'} · "
                f"{dev.get('type', '—')}"
            )

        body = (
            "Topologie réseau JARVIS : hôte Core, services amont, satellites connus. "
            "Pas de scan LAN actif — discovery via DeviceRegistry."
        )
        await publish_result_surface(
            self,
            "network",
            title="Réseau",
            body=body,
            source="system.network",
            items=items,
        )
        spoken = "Voici la topologie réseau connue."
        await self.broadcast(
            await self.speak(spoken, user_id=self._session_user_id() or "local")
        )
        return {"ok": True, "devices": len(items) - 3}

    async def _execute_missions(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..missions import MissionStore
        from ..surfaces.publisher import publish_result_surface

        prompt = str(payload.get("prompt") or "").strip().lower()
        uid = self._session_user_id() or "local"
        store = MissionStore()

        if any(w in prompt for w in ("ajoute", "ajouter", "nouvel", "nouveau", "crée", "cree")):
            title = prompt
            for token in (
                "ajoute objectif", "ajouter objectif", "nouvel objectif", "nouveau objectif",
                "ajoute un objectif", "ajoute", "ajouter", "nouvel", "nouveau", "objectif",
                "but", "goal",
            ):
                title = title.replace(token, " ")
            title = " ".join(title.split()).strip(" :,-")
            if not title:
                spoken = "Quel objectif voulez-vous ajouter ?"
                await self.broadcast(await self.speak(spoken, user_id=uid))
                return {"ok": False, "reason": "titre manquant"}
            mission = store.add(title, user_id=uid)
            spoken = f"Objectif enregistré : {mission.title}."
            await publish_result_surface(
                self,
                "objectifs",
                title="Objectifs",
                body=spoken,
                source="core.missions",
                items=[f"{mission.id} · {mission.title} · {mission.status}"],
            )
            await self.broadcast(await self.speak(spoken, user_id=uid))
            return {"ok": True, "action": "add", "mission": mission.to_dict()}

        if any(w in prompt for w in ("termine", "terminé", "termine", "fini", "fait", "complete", "complète")):
            ref = prompt
            for token in (
                "termine objectif", "marque comme fait", "objectif", "but", "termine", "fini", "fait",
            ):
                ref = ref.replace(token, " ")
            ref = " ".join(ref.split()).strip()
            mission = store.complete(ref, user_id=uid) if ref else None
            if mission is None:
                spoken = "Je ne trouve pas cet objectif à clôturer."
                await self.broadcast(await self.speak(spoken, user_id=uid))
                return {"ok": False, "reason": "introuvable"}
            spoken = f"Objectif terminé : {mission.title}."
            await self.broadcast(await self.speak(spoken, user_id=uid))
            return {"ok": True, "action": "complete", "mission": mission.to_dict()}

        missions = store.list_missions(user_id=uid, include_done=False)
        done = store.list_missions(user_id=uid, include_done=True)
        done_n = sum(1 for m in done if m.status == "done")
        items = [f"{m.id} · {m.title} · {m.status}" for m in missions[:20]]
        if not items and done_n:
            body = f"Aucun objectif ouvert — {done_n} terminé(s)."
        elif not items:
            body = "Aucun objectif pour l'instant. Dites « ajoute objectif … »."
        else:
            body = f"{len(missions)} objectif(s) ouvert(s), {done_n} terminé(s)."
        await publish_result_surface(
            self,
            "objectifs",
            title="Objectifs",
            body=body,
            source="core.missions",
            items=items or [f"terminés · {done_n}"],
        )
        spoken = body
        await self.broadcast(await self.speak(spoken, user_id=uid))
        return {"ok": True, "action": "list", "open": len(missions), "done": done_n}

    async def _execute_vps_code(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..surfaces.publisher import publish_result_surface

        root = os.environ.get("JARVIS_PROJECTS_ROOT", "").strip()
        prompt = str(payload.get("prompt") or "").strip()
        uid = self._session_user_id() or "local"

        projects: list[str] = []
        if root:
            base = Path(root)
            if base.is_dir():
                projects = sorted(
                    p.name for p in base.iterdir() if p.is_dir() and not p.name.startswith(".")
                )[:30]

        body = (
            "Éditeur distant : liste des projets locaux. "
            "Pour éditer un fichier, utilisez Mission Control Dev ou Hermes (toolset file)."
        )
        if not root:
            body = (
                "JARVIS_PROJECTS_ROOT non configuré. "
                "Définissez la variable pour lister vos dépôts, ou ouvrez Mission Control Dev."
            )
        items = projects or [f"racine · {root or '(non configurée)'}"]
        await publish_result_surface(
            self,
            "code",
            title="Code / projets",
            body=body,
            source="vps.code",
            items=items,
        )
        await self.broadcast({"type": "hud_command", "action": "open_space", "app": "code"})
        spoken = (
            f"J'ouvre l'espace code — {len(projects)} projet(s) listé(s)."
            if projects
            else "J'ouvre l'espace code — configurez JARVIS_PROJECTS_ROOT pour lister vos projets."
        )
        await self.broadcast(await self.speak(spoken, user_id=uid))
        return {"ok": True, "projects": projects, "prompt": prompt}

    async def _execute_remote_terminal(self, target: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Terminal admin (Dashboard) — VPS ou Pi salon, SSH via `remote_exec.py`.

        Aucune évaluation Policy ici : `ws/handlers/terminal.py` l'a déjà
        faite avant d'appeler `IntentExecutor.execute()` — ce niveau exécute
        une intention déjà autorisée, comme tous les autres `_execute_*`.
        """
        from .. import remote_exec

        command = str(payload.get("command") or "").strip()
        if not command:
            return {"ok": False, "error": "commande vide"}
        result = await remote_exec.run(target, command)
        return {
            "ok": result.ok,
            "output": result.output,
            "error": result.error,
            "returncode": result.returncode,
        }

    async def _execute_vps_terminal(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._execute_remote_terminal("vps", payload)

    async def _execute_pi_terminal(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._execute_remote_terminal("pi", payload)
