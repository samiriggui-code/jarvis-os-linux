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
Phase B+ : dispatch ``dev.agent.run`` via DevAgentDispatch (P5) — corrélations :
  mission_dev_id / step_id / run_id / device_id / workspace_id / agent.
Cursor natif / Agent Laptop = branchement CLI futur (hors P5).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from ..db import default_data_dir, session_scope
from ..db.models import ProjectRow

logger = logging.getLogger("jarvis.core.mission_dev")

# États step Mission DEV pour un run dev.agent.run — distincts de RunState P5
# (qui reste l'autorité process côté DevAgentDispatch) : ceux-ci sont la vue
# Mission DEV du cycle de vie d'un step, cf. §10 mission P5-REAL-MISSION-DEV.
DEV_STEP_TERMINAL: frozenset[str] = frozenset({"COMPLETED", "FAILED", "CANCELLED", "TIMEOUT", "UNKNOWN"})

Send = Callable[[dict[str, Any]], Awaitable[None]]
Speak = Callable[[str], Awaitable[None]]
SpeakEntity = Callable[..., Awaitable[Any]]
HandoffSpeaker = Callable[..., Awaitable[None]]

TTS_PRODUCERS = frozenset({"claude", "cursor"})


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


def _vocalize_agent_text(text: str) -> str:
    """Nettoyage vocal minimal — pas de résumé LLM."""
    clean = (text or "").strip()
    if not clean:
        return "C'est fait."
    clean = re.sub(r"`([^`]+)`", r"\1", clean)
    clean = re.sub(r"\*\*([^*]+)\*\*", r"\1", clean)
    clean = re.sub(r"\*([^*]+)\*", r"\1", clean)
    return clean[:500]


def _authentic_producer(result: dict[str, Any], agent: str) -> bool:
    """P5 réel uniquement — fake/simulated ne déclenche pas TTS multi-speaker."""
    struct = result.get("structured_output")
    if not isinstance(struct, dict) or struct.get("simulated"):
        return False
    return struct.get("producer") == agent and agent in TTS_PRODUCERS


async def _restitute_step_voice(
    *,
    speak_entity: SpeakEntity | None,
    handoff_speaker: HandoffSpeaker | None,
    agent: str,
    producer: str | None,
    result: dict[str, Any],
    verification_status: str | None,
    read_only: bool,
) -> None:
    if speak_entity is None or producer not in TTS_PRODUCERS:
        return
    if not _authentic_producer(result, agent):
        return

    vocal = _vocalize_agent_text(str(result.get("agent_result") or ""))
    await speak_entity(vocal, speaker_entity=agent, producer=agent)
    if handoff_speaker is not None:
        await handoff_speaker(agent, "jarvis")

    if verification_status == "validated":
        if read_only:
            await speak_entity("Analyse validée.", speaker_entity="jarvis")
        else:
            await speak_entity(
                "Modification validée. Le smoke est passé.",
                speaker_entity="jarvis",
            )
    elif verification_status == "disputed":
        await speak_entity(
            "Validation incomplète. Les preuves observées ne confirment pas le résultat.",
            speaker_entity="jarvis",
        )


class MissionDevRunner:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._abort = asyncio.Event()
        self.active_id: str | None = None
        self._current_run_id: str | None = None

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    def abort(self) -> None:
        self._abort.set()

    async def cancel_dev_run(self, dev_agent_dispatch: Any) -> dict[str, Any]:
        """§19 — annule le run dev.agent.run actif du step en cours (jamais Cursor GUI)."""
        self._abort.set()
        run_id = self._current_run_id
        if not run_id:
            return {"ok": False, "error_code": "no_active_run"}
        return await dev_agent_dispatch.cancel_run(run_id)

    async def start(
        self,
        *,
        send: Send,
        speak: Speak,
        project_name: str,
        scenario: str = "cursor",
        owner_user_id: str | None = None,
        hermes_ok: bool | None = None,
        hermes_bridge: Any | None = None,
        session_role: str | None = None,
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
                hermes_bridge=hermes_bridge,
                session_role=session_role,
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
        hermes_bridge: Any | None,
        session_role: str | None,
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
                             project_name=name, project_id=project_id, log=">> kanban Hermes")
            log_h = ">> route locale → agent.dev"
            if hermes_bridge is not None and project_id:
                from .kanban import sync_project_card

                ok, detail = await sync_project_card(
                    hermes_bridge,
                    role=session_role,
                    project_name=name,
                    project_id=project_id,
                    mission_dev_id=mission_dev_id,
                )
                if ok:
                    log_h = f">> kanban Hermes · {detail[:96]}"
                elif hermes_ok is False:
                    log_h = ">> Hermès hors ligne · route locale → agent.dev"
                else:
                    log_h = f">> kanban skip · {detail[:72]}"
            elif hermes_ok is True:
                log_h = ">> Hermès health OK · kanban non tenté (bridge absent)"
            elif hermes_ok is False:
                log_h = ">> Hermès hors ligne · route locale → agent.dev"
            await asyncio.sleep(0.35)
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

    # ── P5 REAL — steps dev.agent.run (Claude / Cursor) ─────────────────
    #
    # Chemin distinct du scaffold ``_run`` ci-dessus (scenario="cursor" =
    # bootstrap disque/DB/git d'un nouveau projet). Ici : dispatcher un ou
    # plusieurs steps ``dev.agent.run`` réels via DevAgentDispatch (P5),
    # sans dupliquer son contrat ni créer un second orchestrateur — même
    # ``self._task``/``self._abort``/``self.active_id`` que le scaffold,
    # donc une seule mission active à la fois, comme avant.

    async def start_dev_agent_mission(
        self,
        *,
        send: Send,
        speak: Speak,
        steps: list[dict[str, Any]],
        dev_agent_dispatch: Any,
        policy_engine: Any,
        verification: Any,
        project_name: str = "",
        owner_user_id: str | None = None,
        speak_entity: SpeakEntity | None = None,
        handoff_speaker: HandoffSpeaker | None = None,
    ) -> None:
        if self.running:
            await send({"type": "mission_dev_error", "error": "mission_dev_already_running"})
            return
        if not steps:
            await send({"type": "mission_dev_error", "error": "no_steps"})
            return
        self._abort = asyncio.Event()
        self._task = asyncio.create_task(
            self._run_dev_agent(
                send=send,
                speak=speak,
                steps=steps,
                dev_agent_dispatch=dev_agent_dispatch,
                policy_engine=policy_engine,
                verification=verification,
                project_name=project_name,
                owner_user_id=owner_user_id,
                speak_entity=speak_entity,
                handoff_speaker=handoff_speaker,
            )
        )

    async def _emit_dev_step(
        self,
        send: Send,
        *,
        mission_dev_id: str,
        step_id: str,
        agent: str,
        state: str,
        project_name: str,
        run_id: str | None = None,
        device_id: str | None = None,
        workspace_id: str | None = None,
        producer: str | None = None,
        verification_status: str | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> None:
        await send({
            "type": "mission_dev_progress",
            "mission_dev_id": mission_dev_id,
            "step_id": step_id,
            "status": state,
            "project_name": project_name,
            "scenario": "dev_agent",
            "agent": agent,
            "run_id": run_id,
            "device_id": device_id,
            "workspace_id": workspace_id,
            "producer": producer,
            "verification_status": verification_status,
            "error_code": error_code,
            "error_message": error_message,
        })

    @staticmethod
    async def _wait_dev_run_terminal(
        dev_agent_dispatch: Any, run_id: str, *, timeout_s: float
    ) -> dict[str, Any]:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            st = dev_agent_dispatch.status(run_id)
            if str(st.get("state") or "") in DEV_STEP_TERMINAL:
                return st
            await asyncio.sleep(0.2)
        return dev_agent_dispatch.status(run_id)

    @staticmethod
    def _verify_dev_agent_step(
        verification: Any,
        *,
        mission_dev_id: str,
        step_id: str,
        agent: str,
        workspace_id: str,
        device_id: str | None,
        owner_user_id: str | None,
        result: dict[str, Any],
        read_only: bool,
    ) -> Any:
        from ..verification import Observation, VerificationRequest
        from ..verification_hooks import (
            build_dev_agent_observation,
            claimed_result_text,
            claimed_success_from_result,
        )

        observation: Observation = build_dev_agent_observation(result, read_only=read_only)
        request = VerificationRequest(
            mission_id=f"mission_dev:{mission_dev_id}:{step_id}",
            user_id=owner_user_id or "local",
            intent="core.mission_dev.dev_agent",
            proposition=f"dev.agent.run agent={agent} step={step_id}",
            action_demanded=str(result.get("agent_result") or "")[:500] or f"agent={agent}",
            claimed_result=claimed_result_text(result),
            claimed_success=claimed_success_from_result(result),
            observe=observation,
            device_id=device_id,
            wing="jarvis-os",
            room="missions",
            title=f"dev.agent.run · {agent} · {step_id}",
            importance="high",
            tags=["mission_dev", "dev_agent", agent],
        )
        return verification.run(request)

    async def _run_dev_agent(
        self,
        *,
        send: Send,
        speak: Speak,
        steps: list[dict[str, Any]],
        dev_agent_dispatch: Any,
        policy_engine: Any,
        verification: Any,
        project_name: str,
        owner_user_id: str | None,
        speak_entity: SpeakEntity | None = None,
        handoff_speaker: HandoffSpeaker | None = None,
    ) -> None:
        from ..dev_agent import DevAgentDispatchError, DevAgentRunParams
        from ..policy import Operation, RiskLevel

        mission_dev_id = str(uuid.uuid4())
        self.active_id = mission_dev_id
        name = (project_name or "").strip() or f"DevAgent-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}"
        safe = _safe_name(name)

        project_id = str(uuid.uuid4())
        step_records: list[dict[str, Any]] = []
        with session_scope() as s:
            s.add(ProjectRow(
                id=project_id,
                name=name,
                status="running",
                scenario="dev_agent",
                owner_user_id=owner_user_id,
                workspace_path=str(steps[0].get("workspace_id") or ""),
                meta_json=json.dumps({"mission_dev_id": mission_dev_id, "steps": step_records}),
                created_at=_now(),
                updated_at=_now(),
            ))

        def _persist_steps(status: str) -> None:
            with session_scope() as s:
                row = s.get(ProjectRow, project_id)
                if row:
                    row.status = status
                    row.meta_json = json.dumps({"mission_dev_id": mission_dev_id, "steps": step_records})
                    row.updated_at = _now()

        await send({
            "type": "mission_dev_started",
            "mission_dev_id": mission_dev_id,
            "project_name": name,
            "scenario": "dev_agent",
            "steps": [
                {"id": s.get("step_id") or f"step-{i + 1}", "label": f"{s.get('agent')} · {s.get('workspace_id')}"}
                for i, s in enumerate(steps)
            ],
        })
        await speak(f"Mission développement. {len(steps)} étape{'s' if len(steps) > 1 else ''}.")

        overall_ok = True
        try:
            for i, step in enumerate(steps):
                if self._abort.is_set():
                    raise InterruptedError("aborted")

                step_id = str(step.get("step_id") or f"step-{i + 1}")
                agent = str(step.get("agent") or "").strip().lower()
                workspace_id = str(step.get("workspace_id") or "").strip()
                prompt = str(step.get("prompt") or "")
                read_only = bool(step.get("read_only", False))
                collect_tests = list(step.get("collect_tests") or [])
                timeout_s = float(step.get("timeout_s") or 600.0)

                await self._emit_dev_step(
                    send, mission_dev_id=mission_dev_id, step_id=step_id, agent=agent,
                    state="PENDING", project_name=name, workspace_id=workspace_id,
                )

                params = DevAgentRunParams(
                    agent=agent,
                    workspace_id=workspace_id,
                    prompt=prompt,
                    read_only=read_only,
                    timeout_s=timeout_s,
                    collect_tests=collect_tests,
                    mission_dev_id=mission_dev_id,
                    step_id=step_id,
                )
                ops = params.operations()
                # §7 — READ seul : auto-grant. WRITE/EXECUTE : PolicyEngine réel,
                # tier HOME (grant + needs_confirmation, jamais ADMIN qui bloque
                # dur — un dev.agent.run scoped/git-observable n'est pas un rm -rf).
                risk = RiskLevel.MEDIA if ops == frozenset({"READ"}) else RiskLevel.HOME
                operation = Operation.EXECUTE if "EXECUTE" in ops else (
                    Operation.WRITE if "WRITE" in ops else Operation.READ
                )
                decision = policy_engine.evaluate(action="dev_agent_run", text=prompt, risk=risk, operation=operation)
                policy_payload = dev_agent_dispatch.build_policy_payload(
                    granted=decision.allowed,
                    role="mission_dev",
                    user_id=owner_user_id or "local",
                    operations=ops,
                )

                record: dict[str, Any] = {
                    "step_id": step_id, "agent": agent, "workspace_id": workspace_id,
                    "run_id": None, "device_id": None, "state": None,
                    "producer": None, "verification_status": None,
                }

                if not decision.allowed:
                    record.update(state="FAILED", verification_status="skipped")
                    step_records.append(record)
                    _persist_steps("failed")
                    await self._emit_dev_step(
                        send, mission_dev_id=mission_dev_id, step_id=step_id, agent=agent,
                        state="FAILED", project_name=name, workspace_id=workspace_id,
                        error_code="policy_denied", error_message=decision.reason,
                    )
                    overall_ok = False
                    break

                await self._emit_dev_step(
                    send, mission_dev_id=mission_dev_id, step_id=step_id, agent=agent,
                    state="DISPATCHED", project_name=name, workspace_id=workspace_id,
                )

                try:
                    rec = await dev_agent_dispatch.start_run(params, policy_payload, request_id=None)
                except DevAgentDispatchError as exc:
                    record.update(state="FAILED")
                    step_records.append(record)
                    _persist_steps("failed")
                    await self._emit_dev_step(
                        send, mission_dev_id=mission_dev_id, step_id=step_id, agent=agent,
                        state="FAILED", project_name=name, workspace_id=workspace_id,
                        error_code=exc.code, error_message=str(exc),
                    )
                    overall_ok = False
                    break

                run_id = rec.run_id
                self._current_run_id = run_id
                record.update(run_id=run_id, device_id=rec.device_id)
                await self._emit_dev_step(
                    send, mission_dev_id=mission_dev_id, step_id=step_id, agent=agent,
                    state="RUNNING", project_name=name, run_id=run_id,
                    device_id=rec.device_id, workspace_id=workspace_id,
                )

                final = await self._wait_dev_run_terminal(dev_agent_dispatch, run_id, timeout_s=timeout_s + 20.0)
                self._current_run_id = None
                state = str(final.get("state") or "UNKNOWN")
                result = final.get("result") if isinstance(final.get("result"), dict) else {}

                await self._emit_dev_step(
                    send, mission_dev_id=mission_dev_id, step_id=step_id, agent=agent,
                    state="VERIFYING", project_name=name, run_id=run_id,
                    device_id=rec.device_id, workspace_id=workspace_id,
                )

                producer = None
                struct = result.get("structured_output") if isinstance(result, dict) else None
                if isinstance(struct, dict):
                    producer = struct.get("producer")

                verification_status = "skipped"
                if state == "COMPLETED" and result:
                    outcome = self._verify_dev_agent_step(
                        verification,
                        mission_dev_id=mission_dev_id,
                        step_id=step_id,
                        agent=agent,
                        workspace_id=workspace_id,
                        device_id=rec.device_id,
                        owner_user_id=owner_user_id,
                        result=result,
                        read_only=read_only,
                    )
                    verification_status = str(getattr(outcome, "outcome", "") or "incomplete")

                record.update(
                    state=state, producer=producer, verification_status=verification_status,
                )
                step_records.append(record)
                _persist_steps("running")

                await self._emit_dev_step(
                    send, mission_dev_id=mission_dev_id, step_id=step_id, agent=agent,
                    state=state, project_name=name, run_id=run_id, device_id=rec.device_id,
                    workspace_id=workspace_id, producer=producer,
                    verification_status=verification_status,
                    error_code=final.get("error_code"), error_message=final.get("error_message"),
                )

                if state == "COMPLETED" and result:
                    await _restitute_step_voice(
                        speak_entity=speak_entity,
                        handoff_speaker=handoff_speaker,
                        agent=agent,
                        producer=producer,
                        result=result,
                        verification_status=verification_status,
                        read_only=read_only,
                    )

                if state != "COMPLETED":
                    overall_ok = False
                    break

            _persist_steps("ready" if overall_ok else "failed")
            await send({
                "type": "mission_dev_finished",
                "mission_dev_id": mission_dev_id,
                "project_id": project_id,
                "project_name": name,
                "ok": overall_ok,
                "steps": step_records,
                "handoff": "dev_agent",
            })
            await speak("Mission développement terminée." if overall_ok else "Mission développement en échec.")
        except InterruptedError:
            self._current_run_id = None
            _persist_steps("aborted")
            await send({
                "type": "mission_dev_finished",
                "mission_dev_id": mission_dev_id,
                "project_id": project_id,
                "project_name": name,
                "ok": False,
                "steps": step_records,
                "error": "aborted",
            })
        except Exception as exc:  # noqa: BLE001
            logger.exception("mission_dev (dev_agent) failed")
            self._current_run_id = None
            _persist_steps("failed")
            await send({
                "type": "mission_dev_error",
                "mission_dev_id": mission_dev_id,
                "project_id": project_id,
                "error": str(exc),
            })
        finally:
            self.active_id = None
            self._task = None
            self._current_run_id = None
