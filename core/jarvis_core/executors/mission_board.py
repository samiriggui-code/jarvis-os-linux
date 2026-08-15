"""Exécutants Mission DEV Board — surface agentique + voix + P5."""
from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger("jarvis.core.mission_board")


class MissionBoardExecutorsMixin:

    async def _publish_mission_dev_board(
        self,
        *,
        voice_hint: str | None = None,
    ) -> bool:
        from ..mission_dev.board.document import build_live_board_document, SURFACE_ID
        from ..mission_dev.board.document import mission_dev_board_document

        doc = build_live_board_document(self.mission_board)
        if voice_hint:
            doc = mission_dev_board_document(
                board=self.mission_board.list_board(),
                inbox=self.mission_board.inbox(),
                voice_hint=voice_hint,
            )
        return await self._publish_validated_surface(SURFACE_ID, doc)

    @staticmethod
    def _extract_ticket_title(text: str) -> str | None:
        raw = str(text or "").strip()
        if not raw:
            return None
        patterns = (
            r"(?:nouveau|nouvelle|crée|créer|cree|creer|create)\s+(?:un\s+)?ticket\s+(.+)",
            r"(?:nouveau|nouvelle|crée|créer|cree|creer|create)\s+(?:une\s+)?tache\s+(.+)",
            r"(?:nouveau|nouvelle|crée|créer|cree|creer|create)\s+(?:une\s+)?tâche\s+(.+)",
        )
        lower = raw.lower()
        for pat in patterns:
            m = re.search(pat, lower, re.I)
            if m:
                title = raw[m.start(1) : m.end(1)].strip(" .!?")
                if title:
                    return title[:256]
        return None

    @staticmethod
    def _extract_assign_agent(text: str) -> str | None:
        lower = str(text or "").lower()
        if "cursor" in lower:
            return "cursor"
        if "claude" in lower:
            return "claude"
        return None

    async def _execute_dev_board_create(self, payload: dict[str, Any]) -> dict[str, Any]:
        title = str(payload.get("title") or "").strip()
        if not title:
            title = self._extract_ticket_title(
                str(payload.get("text") or payload.get("prompt") or "")
            ) or ""
        if not title:
            spoken = "Quel titre pour le ticket ? Dites « nouveau ticket corriger le routing »."
            await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
            return {"ok": False, "intent": "dev.board.create", "error": "title_required", "text": spoken}

        created = self.mission_board.create_issue(title=title, body=str(payload.get("body") or ""))
        issue = created.get("issue") or {}
        await self.broadcast({"type": "hud_command", "action": "open_space", "app": "mission-control-dev"})
        await self._publish_mission_dev_board()
        spoken = f"Ticket créé : {issue.get('title', title)}."
        await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
        return {"ok": True, "intent": "dev.board.create", "issue": issue, "text": spoken}

    async def _execute_dev_board_assign(self, payload: dict[str, Any]) -> dict[str, Any]:
        text = str(payload.get("text") or payload.get("prompt") or "")
        agent = str(payload.get("agent") or "").strip().lower() or self._extract_assign_agent(text)
        if not agent:
            spoken = "Quel agent ? Dites « assigne à cursor » ou « assigne à claude »."
            await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
            return {"ok": False, "intent": "dev.board.assign", "error": "agent_required", "text": spoken}

        issue_id = str(payload.get("issue_id") or "").strip()
        if not issue_id:
            board = self.mission_board.list_board()
            issues = board.get("issues") or []
            todo = [i for i in issues if i.get("column") in ("todo", "backlog", "doing")]
            if len(todo) == 1:
                issue_id = str(todo[0].get("id") or "")
            elif todo:
                issue_id = str(todo[0].get("id") or "")

        if not issue_id:
            spoken = "Aucun ticket cible. Créez un ticket d'abord."
            await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
            return {"ok": False, "intent": "dev.board.assign", "error": "issue_required", "text": spoken}

        from ..workspace import WORKSPACE_JARVIS_MAIN

        ws_id = str(payload.get("workspace_id") or WORKSPACE_JARVIS_MAIN)
        device_id = payload.get("device_id") or getattr(self, "_intent_ws", None)
        dev_id = self.connections.device_for(device_id) if device_id else None

        result = self.mission_board.assign_issue(
            issue_id=issue_id,
            agent=agent,
            workspace_id=ws_id,
            device_id=dev_id,
        )
        await self.broadcast({"type": "hud_command", "action": "open_space", "app": "mission-control-dev"})
        await self._publish_mission_dev_board()
        issue = result.get("issue") or {}
        spoken = f"Ticket assigné à {agent}."
        await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
        return {"ok": True, "intent": "dev.board.assign", "issue": issue, "text": spoken}

    async def _execute_dev_board_start_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..dev_agent import DevAgentDispatchError, DevAgentRunParams
        from ..policy import Operation, RiskLevel
        from ..workspace import WORKSPACE_JARVIS_MAIN

        board = self.mission_board.list_board()
        issues = board.get("issues") or []
        target = None
        issue_id = str(payload.get("issue_id") or "").strip()
        if issue_id:
            target = next((i for i in issues if i.get("id") == issue_id), None)
        if target is None:
            doing = [i for i in issues if i.get("column") == "doing" and i.get("assignee_agent")]
            if doing:
                target = doing[0]

        if target is None:
            spoken = "Aucun ticket en cours assigné. Dites « assigne à cursor » puis « lance le run »."
            await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
            return {"ok": False, "intent": "dev.board.start_run", "error": "issue_required", "text": spoken}

        agent = str(target.get("assignee_agent") or "cursor").lower()
        workspace_id = str(target.get("workspace_id") or WORKSPACE_JARVIS_MAIN)
        prompt = str(payload.get("prompt") or target.get("title") or "Exécuter la tâche Mission DEV")
        iid = str(target.get("id") or "")

        params = DevAgentRunParams(
            agent=agent,
            workspace_id=workspace_id,
            prompt=prompt,
            timeout_s=float(payload.get("timeout_s") or 600.0),
        )
        ops = params.operations()
        risk = RiskLevel.MEDIA if ops == frozenset({"READ"}) else RiskLevel.HOME
        operation = Operation.EXECUTE if "EXECUTE" in ops else (
            Operation.WRITE if "WRITE" in ops else Operation.READ
        )
        decision = self.policy.evaluate(action="dev_agent_run", text=prompt, risk=risk, operation=operation)
        if not decision.allowed:
            spoken = decision.reason or "Run refusé par la Policy."
            await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
            return {"ok": False, "intent": "dev.board.start_run", "error": "policy_denied", "text": spoken}

        policy_payload = self.dev_agent_dispatch.build_policy_payload(
            granted=True,
            role=self._session_role(getattr(self, "_intent_ws", None)),
            user_id=self._session_user_id() or "local",
            operations=ops,
        )

        try:
            rec = await self.dev_agent_dispatch.start_run(params, policy_payload)
        except DevAgentDispatchError as exc:
            spoken = str(exc)
            await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
            return {"ok": False, "intent": "dev.board.start_run", "error": exc.code, "text": spoken}

        self.mission_board.link_run(issue_id=iid, run_id=rec.run_id)
        await self.broadcast({"type": "hud_command", "action": "open_space", "app": "mission-control-dev"})
        await self._publish_mission_dev_board()
        spoken = f"Run {agent} démarré."
        await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
        return {
            "ok": True,
            "intent": "dev.board.start_run",
            "run_id": rec.run_id,
            "issue_id": iid,
            "text": spoken,
        }
