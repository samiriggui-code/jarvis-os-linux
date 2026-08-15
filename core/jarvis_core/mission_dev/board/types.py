"""Mission DEV Board — types (inspirés Multica, runtime JARVIS).

Kanban local Core + lien ``dev.agent.run`` (P5). Pas de dépendance au repo Multica.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class BoardColumn(str, Enum):
    BACKLOG = "backlog"
    TODO = "todo"
    DOING = "doing"
    REVIEW = "review"
    DONE = "done"


class IssueStatus(str, Enum):
    OPEN = "open"
    BLOCKED = "blocked"
    CLOSED = "closed"


BOARD_COLUMNS: tuple[BoardColumn, ...] = (
    BoardColumn.BACKLOG,
    BoardColumn.TODO,
    BoardColumn.DOING,
    BoardColumn.REVIEW,
    BoardColumn.DONE,
)


@dataclass(frozen=True)
class IssueSnapshot:
    id: str
    project_id: str | None
    title: str
    body: str
    column: BoardColumn
    status: IssueStatus
    assignee_agent: str | None
    assignee_user_id: str | None
    device_id: str | None
    workspace_id: str | None
    run_id: str | None
    mission_dev_id: str | None
    blocked_reason: str | None
    meta: dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "title": self.title,
            "body": self.body,
            "column": self.column.value,
            "status": self.status.value,
            "assignee_agent": self.assignee_agent,
            "assignee_user_id": self.assignee_user_id,
            "device_id": self.device_id,
            "workspace_id": self.workspace_id,
            "run_id": self.run_id,
            "mission_dev_id": self.mission_dev_id,
            "blocked_reason": self.blocked_reason,
            "meta": dict(self.meta),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass(frozen=True)
class CommentSnapshot:
    id: str
    issue_id: str
    author: str
    body: str
    meta: dict[str, Any] = field(default_factory=dict)
    created_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "issue_id": self.issue_id,
            "author": self.author,
            "body": self.body,
            "meta": dict(self.meta),
            "created_at": self.created_at,
        }
