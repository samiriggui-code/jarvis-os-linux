"""
Mission Control DEV — orchestrateur Core (§15).

Cockpit d'orchestration du **développement logiciel**, et rien d'autre. Le
cockpit de la maison (domotique, sécurité, caméras) est Mission Control HOME :
un module distinct, qui ne partage avec celui-ci que le Core. Aucun des deux ne
doit dépendre de l'autre — règle d'architecture, pas préférence de style. D'où
l'absence volontaire de tout nom générique « mission » ici : le mot seul ne dit
pas de quel cockpit on parle, et c'est exactement la confusion à empêcher.

Inbound  : { type: 'mission_dev', action: 'start'|'abort', scenario, project_name }
Outbound : mission_dev_started | mission_dev_progress | mission_dev_finished
           | mission_dev_error

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

logger = logging.getLogger("jarvis.core.mission_dev")

Send = Callable[[dict[str, Any]], Awaitable[None]]
Speak = Callable[[str], Awaitable[None]]


def projects_root() -> Path:
    """Racine des workspaces Mission Control DEV.

    Priorité :
      1. ``JARVIS_PROJECTS_ROOT`` (ex. ``C:\\laragon\\www`` si le Core tourne
         sur le PC Windows, ou un partage monté sur le NUC)
      2. Windows : ``C:\\laragon\\www`` s'il existe (ou OS nt)
      3. sinon ``{default_data_dir()}/projects`` (NUC Linux typique)

    Le Core sur le NUC **ne peut pas** écrire sur le disque du laptop Windows
    sans agent satellite / partage — d'où la variable d'environnement.
    """
    env = (os.environ.get("JARVIS_PROJECTS_ROOT") or "").strip()
    if env:
        return Path(env)
    win = Path(r"C:\laragon\www")
    if os.name == "nt" or win.is_dir():
        return win
    return Path(default_data_dir()) / "projects"


CURSOR_STEPS: list[dict[str, str]] = [
    {"id": "memory", "label": "Création mémoire projet (DB)"},
    {"id": "hermes", "label": "Hermès — analyse & routage"},
    {"id": "agent-dev", "label": "Agent Dev"},
    {"id": "cursor", "label": "Contexte environnement de travail"},
    {"id": "git", "label": "Git — dépôt prêt"},
    {"id": "ready", "label": "Prêt pour développement"},
]

# Voix : UNE ligne courte par jalon TERMINÉ — pas de monologue running/done.
VOICE: dict[str, str] = {
    "memory:done": "Mémoire projet prête.",
    "hermes:done": "Routage prêt.",
    "agent-dev:done": "Agent en poste.",
    "cursor:done": "Contexte assemblé.",
    "git:done": "Dépôt initialisé.",
    "ready:done": "Prêt pour le développement.",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_name(name: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in "-_" else "-" for c in name.strip())
    return (cleaned.strip("-_") or "projet")[:64]


class MissionDevRunner:
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
            await send({"type": "mission_dev_error", "error": "mission_dev_already_running"})
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
        mission_dev_id: str,
        step_id: str,
        status: str,
        project_name: str,
        log: str | None = None,
        project_id: str | None = None,
    ) -> None:
        await send({
            "type": "mission_dev_progress",
            "mission_dev_id": mission_dev_id,
            "step_id": step_id,
            "status": status,
            "project_name": project_name,
            "project_id": project_id,
            "log": log,
            "scenario": "cursor",
        })
        line = VOICE.get(f"{step_id}:{status}")
        if line and status == "done":
            await speak(line)
            # Laisse le WAV finir avant l’étape suivante (plus de monologue empilé).
            await asyncio.sleep(1.8)
        elif status == "running":
            await asyncio.sleep(0.25)

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
        mission_dev_id = str(uuid.uuid4())
        self.active_id = mission_dev_id
        # Pas de HoloControl magique : le nom vient de la voix / du HUD.
        # Si absent, horodatage — jamais un projet fantôme « HoloControl ».
        raw = (project_name or "").strip()
        name = raw if raw else f"Projet-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}"
        safe = _safe_name(name)

        await send({
            "type": "mission_dev_started",
            "mission_dev_id": mission_dev_id,
            "project_name": name,
            "scenario": scenario,
            "steps": CURSOR_STEPS,
        })
        # Une seule intro — le reste = UI + une phrase par jalon done.
        await speak(f"Mission Control. Projet {name}.")
        await asyncio.sleep(1.2)
        project_id: str | None = None
        workspace: Path | None = None

        try:
            # 1 · memory — DB (PostgreSQL / SQLite réel via SQLAlchemy)
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_dev_id=mission_dev_id, step_id="memory", status="running",
                             project_name=name, log=f">> alloc mémoire · {name}")
            project_id = str(uuid.uuid4())
            root = projects_root() / safe
            root.mkdir(parents=True, exist_ok=True)
            workspace = root
            with session_scope() as s:
                s.add(ProjectRow(
                    id=project_id,
                    name=name,
                    status="init",
                    scenario=scenario,
                    owner_user_id=owner_user_id,
                    workspace_path=str(root.resolve()),
                    meta_json=json.dumps({
                        "mission_dev_id": mission_dev_id,
                        "projects_root": str(projects_root()),
                    }),
                    created_at=_now(),
                    updated_at=_now(),
                ))
            await self._emit(send, speak, mission_dev_id=mission_dev_id, step_id="memory", status="done",
                             project_name=name, project_id=project_id,
                             log=f">> projects.insert({name}) · {root}")
            await asyncio.sleep(0.35)

            # 2 · hermes — routage
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_dev_id=mission_dev_id, step_id="hermes", status="running",
                             project_name=name, project_id=project_id, log=">> analyse intent")
            route = "agent.dev"
            if hermes_ok is True:
                log_h = ">> Hermès health OK · route → agent.dev"
            elif hermes_ok is False:
                log_h = ">> Hermès hors ligne · route locale → agent.dev"
            else:
                log_h = ">> route locale → agent.dev"
            await asyncio.sleep(0.4)
            await self._emit(send, speak, mission_dev_id=mission_dev_id, step_id="hermes", status="done",
                             project_name=name, project_id=project_id, log=log_h)

            # 3 · agent-dev — scaffold workspace
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_dev_id=mission_dev_id, step_id="agent-dev", status="running",
                             project_name=name, project_id=project_id, log=f">> scaffold · {safe}/")
            assert workspace is not None
            (workspace / "src").mkdir(exist_ok=True)
            (workspace / "README.md").write_text(
                f"# {name}\n\nProjet créé par JARVIS Mission Control DEV.\n",
                encoding="utf-8",
            )
            (workspace / "src" / "main.ts").write_text(
                f"// {name} — point d'entrée\nexport {{}};\n",
                encoding="utf-8",
            )
            await self._emit(send, speak, mission_dev_id=mission_dev_id, step_id="agent-dev", status="done",
                             project_name=name, project_id=project_id,
                             log=f">> workspace · {workspace}")

            # 4 · cursor context
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_dev_id=mission_dev_id, step_id="cursor", status="running",
                             project_name=name, project_id=project_id, log=">> context pack")
            (workspace / ".cursor").mkdir(exist_ok=True)
            (workspace / "AGENTS.md").write_text(
                f"# {name}\n\nContexte injecté par JARVIS / Hermès.\n",
                encoding="utf-8",
            )
            (workspace / ".cursor" / "project.json").write_text(
                json.dumps({"name": name, "project_id": project_id, "mission_dev_id": mission_dev_id}, indent=2),
                encoding="utf-8",
            )
            await self._emit(send, speak, mission_dev_id=mission_dev_id, step_id="cursor", status="done",
                             project_name=name, project_id=project_id, log=">> AGENTS.md + .cursor/")

            # 5 · git
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_dev_id=mission_dev_id, step_id="git", status="running",
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
                send, speak, mission_dev_id=mission_dev_id, step_id="git", status="done",
                project_name=name, project_id=project_id,
                log=">> git init OK" if git_ok else ">> git indisponible — workspace sans dépôt",
            )

            # 6 · ready
            if self._abort.is_set():
                raise InterruptedError("aborted")
            await self._emit(send, speak, mission_dev_id=mission_dev_id, step_id="ready", status="running",
                             project_name=name, project_id=project_id, log=">> handshake")
            with session_scope() as s:
                row = s.get(ProjectRow, project_id)
                if row:
                    row.status = "ready"
                    row.updated_at = _now()
            await self._emit(send, speak, mission_dev_id=mission_dev_id, step_id="ready", status="done",
                             project_name=name, project_id=project_id,
                             log=f">> {name} · prêt développement")

            await send({
                "type": "mission_dev_finished",
                "mission_dev_id": mission_dev_id,
                "project_id": project_id,
                "project_name": name,
                "workspace_path": str(workspace) if workspace else None,
                "ok": True,
                "handoff": "cursor",
            })
        except InterruptedError:
            await send({
                "type": "mission_dev_finished",
                "mission_dev_id": mission_dev_id,
                "project_id": project_id,
                "project_name": name,
                "ok": False,
                "error": "aborted",
            })
        except Exception as exc:  # noqa: BLE001
            logger.exception("mission_dev failed")
            await send({
                "type": "mission_dev_error",
                "mission_dev_id": mission_dev_id,
                "project_id": project_id,
                "error": str(exc),
            })
        finally:
            self.active_id = None
            self._task = None
