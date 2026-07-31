"""
Mission Control — orchestrateur Core (§15).

Inbound  : { type: 'mission', action: 'start'|'abort', scenario, project_name }
Outbound : mission_started | mission_progress | mission_finished | mission_error

Phase A : DB projects + workspace disque + git init.
Cursor natif / Agent Laptop = Phase B (HUD ouvre surface Cursor en attendant).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from ..db import default_data_dir, session_scope
from ..db.models import ProjectRow

logger = logging.getLogger("jarvis.core.mission")

Send = Callable[[dict[str, Any]], Awaitable[None]]
Speak = Callable[[str], Awaitable[None]]

CURSOR_STEPS: list[dict[str, str]] = [
    {"id": "memory", "label": "Création mémoire projet (DB)"},
    {"id": "hermes", "label": "Hermès — analyse & routage"},
    {"id": "agent-dev", "label": "Agent Dev"},
    {"id": "cursor", "label": "Contexte environnement de travail"},
    {"id": "git", "label": "Git — dépôt prêt"},
    {"id": "ready", "label": "Prêt pour développement"},
]

# Voix majordome (mission.yaml) — une ligne par jalon
VOICE: dict[str, str] = {
    "memory:running": "J'ouvre le journal du projet.",
    "memory:done": "Mémoire projet en place.",
    "hermes:running": "J'analyse la demande.",
    "hermes:done": "Orientation déterminée.",
    "agent-dev:running": "Délégation à l'agent de développement.",
    "agent-dev:done": "L'agent est en poste.",
    "cursor:running": "Je prépare le contexte de travail.",
    "cursor:done": "Contexte assemblé.",
    "git:running": "Initialisation du dépôt.",
    "git:done": "Le dépôt est initialisé.",
    "ready:running": "Vérification finale.",
    "ready:done": "Prêt pour le développement.",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_name(name: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in "-_" else "-" for c in name.strip())
    return (cleaned.strip("-_") or "projet")[:64]


class MissionRunner:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._abort = asyncio.Event()
        self.active_id: str | None = None

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    def abort(self) -> None:
        self._abort.set()

    async def start(
        self,
        *,
        send: Send,
        speak: Speak,
        project_name: str,
        scenario: str = "cursor",
        owner_user_id: str | None = None,
        hermes_ok: bool | None = None,
    ) -> None:
        if self.running:
            await send({"type": "mission_error", "error": "mission_already_running"})
            return
        self._abort = asyncio.Event()
        self._task = asyncio.create_task(
            self._run(
                send=send,
                speak=speak,
                project_name=project_name,
                scenario=scenario,
                owner_user_id=owner_user_id,
                hermes_ok=hermes_ok,
            )
        )

    async def _emit(
        self,
        send: Send,
        speak: Speak,
        *,
        mission_id: str,
        step_id: str,
        status: str,
        project_name: str,
        log: str | None = None,
        project_id: str | None = None,
    ) -> None:
        await send({
            "type": "mission_progress",
            "mission_id": mission_id,
            "step_id": step_id,
            "status": status,
            "project_name": project_name,
            "project_id": project_id,
            "log": log,
            "scenario": "cursor",
        })
        line = VOICE.get(f"{step_id}:{status}")
        if line:
            await speak(line)

    async def _run(
        self,
        *,
        send: Send,
        speak: Speak,
        project_name: str,
        scenario: str,
        owner_user_id: str | None,
        hermes_ok: bool | None,
    ) -> None:
        mission_id = str(uuid.uuid4())
        self.active_id = mission_id
        name = (project_name or "HoloControl").strip() or "HoloControl"
        safe = _safe_name(name)

        await send({
            "type": "mission_started",
            "mission_id": mission_id,
            "project_name": name,
            "scenario": scenario,
            "steps": CURSOR_STEPS,
        })
        await speak(f"Très bien. Projet {name} initialisé.")

        project_id: str | None = None
        workspace: Path | None = None

        try:
            # 1 · memory — DB
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_id=mission_id, step_id="memory", status="running",
                             project_name=name, log=f">> alloc mémoire · {name}")
            project_id = str(uuid.uuid4())
            root = Path(default_data_dir()) / "projects" / safe
            root.mkdir(parents=True, exist_ok=True)
            workspace = root
            with session_scope() as s:
                s.add(ProjectRow(
                    id=project_id,
                    name=name,
                    status="init",
                    scenario=scenario,
                    owner_user_id=owner_user_id,
                    workspace_path=str(root),
                    meta_json=json.dumps({"mission_id": mission_id}),
                    created_at=_now(),
                    updated_at=_now(),
                ))
            await self._emit(send, speak, mission_id=mission_id, step_id="memory", status="done",
                             project_name=name, project_id=project_id,
                             log=f">> schema projects.insert({name})")
            await asyncio.sleep(0.35)

            # 2 · hermes — routage
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_id=mission_id, step_id="hermes", status="running",
                             project_name=name, project_id=project_id, log=">> analyse intent")
            route = "agent.dev"
            if hermes_ok is True:
                log_h = ">> Hermès health OK · route → agent.dev"
            elif hermes_ok is False:
                log_h = ">> Hermès hors ligne · route locale → agent.dev"
            else:
                log_h = ">> route locale → agent.dev"
            await asyncio.sleep(0.4)
            await self._emit(send, speak, mission_id=mission_id, step_id="hermes", status="done",
                             project_name=name, project_id=project_id, log=log_h)

            # 3 · agent-dev — scaffold workspace
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_id=mission_id, step_id="agent-dev", status="running",
                             project_name=name, project_id=project_id, log=f">> scaffold · {safe}/")
            assert workspace is not None
            (workspace / "src").mkdir(exist_ok=True)
            (workspace / "README.md").write_text(
                f"# {name}\n\nProjet créé par JARVIS Mission Control.\n",
                encoding="utf-8",
            )
            (workspace / "src" / "main.ts").write_text(
                f"// {name} — point d'entrée\nexport {{}};\n",
                encoding="utf-8",
            )
            await self._emit(send, speak, mission_id=mission_id, step_id="agent-dev", status="done",
                             project_name=name, project_id=project_id,
                             log=f">> workspace · {workspace}")

            # 4 · cursor context
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_id=mission_id, step_id="cursor", status="running",
                             project_name=name, project_id=project_id, log=">> context pack")
            (workspace / ".cursor").mkdir(exist_ok=True)
            (workspace / "AGENTS.md").write_text(
                f"# {name}\n\nContexte injecté par JARVIS / Hermès.\n",
                encoding="utf-8",
            )
            (workspace / ".cursor" / "project.json").write_text(
                json.dumps({"name": name, "project_id": project_id, "mission_id": mission_id}, indent=2),
                encoding="utf-8",
            )
            await self._emit(send, speak, mission_id=mission_id, step_id="cursor", status="done",
                             project_name=name, project_id=project_id, log=">> AGENTS.md + .cursor/")

            # 5 · git
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_id=mission_id, step_id="git", status="running",
                             project_name=name, project_id=project_id, log=">> git init")
            git_ok = False
            try:
                r = subprocess.run(
                    ["git", "init"],
                    cwd=str(workspace),
                    capture_output=True,
                    text=True,
                    timeout=15,
                    check=False,
                )
                git_ok = r.returncode == 0
                (workspace / ".gitignore").write_text("node_modules/\n.dist/\n", encoding="utf-8")
            except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
                logger.warning("git init indisponible : %s", exc)
            await self._emit(
                send, speak, mission_id=mission_id, step_id="git", status="done",
                project_name=name, project_id=project_id,
                log=">> git init OK" if git_ok else ">> git indisponible — workspace sans dépôt",
            )

            # 6 · ready
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_id=mission_id, step_id="ready", status="running",
                             project_name=name, project_id=project_id, log=">> handshake")
            with session_scope() as s:
                row = s.get(ProjectRow, project_id)
                if row:
                    row.status = "ready"
                    row.updated_at = _now()
            await self._emit(send, speak, mission_id=mission_id, step_id="ready", status="done",
                             project_name=name, project_id=project_id,
                             log=f">> {name} · prêt développement")

            await send({
                "type": "mission_finished",
                "mission_id": mission_id,
                "project_id": project_id,
                "project_name": name,
                "workspace_path": str(workspace) if workspace else None,
                "ok": True,
                "handoff": "cursor",
            })
        except InterruptedError:
            await send({
                "type": "mission_finished",
                "mission_id": mission_id,
                "project_id": project_id,
                "project_name": name,
                "ok": False,
                "error": "aborted",
            })
        except Exception as exc:  # noqa: BLE001
            logger.exception("mission failed")
            await send({
                "type": "mission_error",
                "mission_id": mission_id,
                "project_id": project_id,
                "error": str(exc),
            })
        finally:
            self.active_id = None
            self._task = None
