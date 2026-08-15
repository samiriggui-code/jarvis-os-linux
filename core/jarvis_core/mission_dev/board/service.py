"""Mission DEV Board — service (API métier)."""
from __future__ import annotations

from typing import Any

from ...dev_agent.types import ALLOWED_DEV_AGENTS
from .store import BoardStore, BoardStoreError
from .types import BOARD_COLUMNS, BoardColumn, IssueSnapshot, IssueStatus


class MissionDevBoardService:
    """Kanban Mission DEV — préparation intégration Multica (patterns UX)."""

    def __init__(self, *, store: BoardStore | None = None) -> None:
        self.store = store or BoardStore()

    def list_board(self, *, project_id: str | None = None) -> dict[str, Any]:
        issues = self.store.list_issues(project_id=project_id)
        columns: dict[str, list[dict[str, Any]]] = {c.value: [] for c in BOARD_COLUMNS}
        for issue in issues:
            columns[issue.column.value].append(issue.to_dict())
        return {
            "columns": [c.value for c in BOARD_COLUMNS],
            "issues_by_column": columns,
            "issues": [i.to_dict() for i in issues],
            "project_id": project_id,
        }

    def create_issue(
        self,
        *,
        title: str,
        body: str = "",
        project_id: str | None = None,
        column: str = BoardColumn.BACKLOG.value,
    ) -> dict[str, Any]:
        col = self._parse_column(column)
        issue = self.store.create_issue(
            title=title,
            body=body,
            project_id=project_id,
            column=col,
        )
        return {"issue": issue.to_dict()}

    def move_issue(self, *, issue_id: str, column: str) -> dict[str, Any]:
        issue = self._require_issue(issue_id)
        col = self._parse_column(column)
        updated = self.store.update_issue(
            IssueSnapshot(
                id=issue.id,
                project_id=issue.project_id,
                title=issue.title,
                body=issue.body,
                column=col,
                status=issue.status,
                assignee_agent=issue.assignee_agent,
                assignee_user_id=issue.assignee_user_id,
                device_id=issue.device_id,
                workspace_id=issue.workspace_id,
                run_id=issue.run_id,
                mission_dev_id=issue.mission_dev_id,
                blocked_reason=issue.blocked_reason,
                meta=dict(issue.meta),
                created_at=issue.created_at,
                updated_at=issue.updated_at,
            )
        )
        return {"issue": updated.to_dict()}

    def assign_issue(
        self,
        *,
        issue_id: str,
        agent: str,
        workspace_id: str | None = None,
        device_id: str | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        issue = self._require_issue(issue_id)
        agent_name = str(agent or "").strip().lower()
        if agent_name not in ALLOWED_DEV_AGENTS:
            raise BoardStoreError(
                f"agent non supporté : {agent_name}",
                code="board_agent_invalid",
            )
        updated = self.store.update_issue(
            IssueSnapshot(
                id=issue.id,
                project_id=issue.project_id,
                title=issue.title,
                body=issue.body,
                column=BoardColumn.DOING,
                status=IssueStatus.OPEN,
                assignee_agent=agent_name,
                assignee_user_id=user_id,
                device_id=device_id,
                workspace_id=workspace_id,
                run_id=issue.run_id,
                mission_dev_id=issue.mission_dev_id,
                blocked_reason=None,
                meta=dict(issue.meta),
                created_at=issue.created_at,
                updated_at=issue.updated_at,
            )
        )
        return {"issue": updated.to_dict()}

    def block_issue(self, *, issue_id: str, reason: str) -> dict[str, Any]:
        issue = self._require_issue(issue_id)
        updated = self.store.update_issue(
            IssueSnapshot(
                id=issue.id,
                project_id=issue.project_id,
                title=issue.title,
                body=issue.body,
                column=issue.column,
                status=IssueStatus.BLOCKED,
                assignee_agent=issue.assignee_agent,
                assignee_user_id=issue.assignee_user_id,
                device_id=issue.device_id,
                workspace_id=issue.workspace_id,
                run_id=issue.run_id,
                mission_dev_id=issue.mission_dev_id,
                blocked_reason=str(reason or "bloqué").strip() or "bloqué",
                meta=dict(issue.meta),
                created_at=issue.created_at,
                updated_at=issue.updated_at,
            )
        )
        return {"issue": updated.to_dict()}

    def unblock_issue(self, *, issue_id: str) -> dict[str, Any]:
        issue = self._require_issue(issue_id)
        updated = self.store.update_issue(
            IssueSnapshot(
                id=issue.id,
                project_id=issue.project_id,
                title=issue.title,
                body=issue.body,
                column=issue.column,
                status=IssueStatus.OPEN,
                assignee_agent=issue.assignee_agent,
                assignee_user_id=issue.assignee_user_id,
                device_id=issue.device_id,
                workspace_id=issue.workspace_id,
                run_id=issue.run_id,
                mission_dev_id=issue.mission_dev_id,
                blocked_reason=None,
                meta=dict(issue.meta),
                created_at=issue.created_at,
                updated_at=issue.updated_at,
            )
        )
        return {"issue": updated.to_dict()}

    def add_comment(self, *, issue_id: str, author: str, body: str) -> dict[str, Any]:
        comment = self.store.add_comment(issue_id=issue_id, author=author, body=body)
        return {
            "comment": comment.to_dict(),
            "comments": [c.to_dict() for c in self.store.list_comments(issue_id)],
        }

    def inbox(self) -> dict[str, Any]:
        issues = self.store.list_issues()
        blocked = [i.to_dict() for i in issues if i.status == IssueStatus.BLOCKED]
        review = [i.to_dict() for i in issues if i.column == BoardColumn.REVIEW]
        return {"blocked": blocked, "review": review}

    def link_run(self, *, issue_id: str, run_id: str) -> dict[str, Any]:
        issue = self._require_issue(issue_id)
        updated = self.store.update_issue(
            IssueSnapshot(
                id=issue.id,
                project_id=issue.project_id,
                title=issue.title,
                body=issue.body,
                column=issue.column,
                status=issue.status,
                assignee_agent=issue.assignee_agent,
                assignee_user_id=issue.assignee_user_id,
                device_id=issue.device_id,
                workspace_id=issue.workspace_id,
                run_id=str(run_id or "").strip() or None,
                mission_dev_id=issue.mission_dev_id,
                blocked_reason=issue.blocked_reason,
                meta=dict(issue.meta),
                created_at=issue.created_at,
                updated_at=issue.updated_at,
            )
        )
        return {"issue": updated.to_dict()}

    def get_run_replay(self, *, run_id: str, dev_runs: Any = None) -> dict[str, Any]:
        rid = str(run_id or "").strip()
        if not rid:
            raise BoardStoreError("run_id requis", code="board_run_required")
        run_status: dict[str, Any] | None = None
        if dev_runs is not None and hasattr(dev_runs, "get"):
            rec = dev_runs.get(rid)
            if rec is not None:
                run_status = rec.to_status_dict() if hasattr(rec, "to_status_dict") else None
                if run_status and hasattr(rec, "progress"):
                    run_status["progress"] = list(rec.progress)
        tool_events = self._tool_events_for_run(rid)
        return {"run_id": rid, "run": run_status, "tool_events": tool_events}

    def get_issue_detail(self, *, issue_id: str) -> dict[str, Any]:
        issue = self._require_issue(issue_id)
        comments = [c.to_dict() for c in self.store.list_comments(issue_id)]
        return {"issue": issue.to_dict(), "comments": comments}

    def handle(self, action: str, data: dict[str, Any], *, dev_runs: Any = None) -> dict[str, Any]:
        act = str(action or "list").strip().lower()
        if act == "list":
            return self.list_board(project_id=data.get("project_id"))
        if act == "create":
            return self.create_issue(
                title=str(data.get("title") or ""),
                body=str(data.get("body") or ""),
                project_id=data.get("project_id"),
                column=str(data.get("column") or BoardColumn.BACKLOG.value),
            )
        if act == "move":
            return self.move_issue(
                issue_id=str(data.get("issue_id") or ""),
                column=str(data.get("column") or ""),
            )
        if act == "assign":
            return self.assign_issue(
                issue_id=str(data.get("issue_id") or ""),
                agent=str(data.get("agent") or ""),
                workspace_id=data.get("workspace_id"),
                device_id=data.get("device_id"),
                user_id=data.get("user_id"),
            )
        if act == "comment":
            return self.add_comment(
                issue_id=str(data.get("issue_id") or ""),
                author=str(data.get("author") or "dashboard"),
                body=str(data.get("body") or ""),
            )
        if act == "inbox":
            return self.inbox()
        if act == "get_run":
            return self.get_run_replay(run_id=str(data.get("run_id") or ""), dev_runs=dev_runs)
        if act == "get_issue":
            return self.get_issue_detail(issue_id=str(data.get("issue_id") or ""))
        if act == "link_run":
            return self.link_run(
                issue_id=str(data.get("issue_id") or ""),
                run_id=str(data.get("run_id") or ""),
            )
        if act == "block":
            return self.block_issue(
                issue_id=str(data.get("issue_id") or ""),
                reason=str(data.get("reason") or ""),
            )
        if act == "unblock":
            return self.unblock_issue(issue_id=str(data.get("issue_id") or ""))
        raise BoardStoreError(f"action inconnue : {act}", code="board_action_unknown")

    def _require_issue(self, issue_id: str) -> IssueSnapshot:
        issue = self.store.get_issue(str(issue_id or "").strip())
        if issue is None:
            raise BoardStoreError("issue introuvable", code="board_issue_not_found")
        return issue

    @staticmethod
    def _parse_column(raw: str) -> BoardColumn:
        val = str(raw or BoardColumn.BACKLOG.value).strip().lower()
        try:
            return BoardColumn(val)
        except ValueError as exc:
            raise BoardStoreError(f"colonne invalide : {val}", code="board_column_invalid") from exc

    @staticmethod
    def _tool_events_for_run(run_id: str, *, limit: int = 30) -> list[dict[str, Any]]:
        try:
            from ...tool_events import fetch_recent_timeline

            events = fetch_recent_timeline(limit=limit * 3)
            out: list[dict[str, Any]] = []
            for ev in events:
                meta = ev.get("meta") if isinstance(ev.get("meta"), dict) else {}
                if meta.get("run_id") == run_id or meta.get("dev_run_id") == run_id:
                    out.append(ev)
                if len(out) >= limit:
                    break
            return out
        except Exception:  # noqa: BLE001
            return []
