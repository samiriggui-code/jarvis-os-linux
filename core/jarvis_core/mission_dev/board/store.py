"""Mission DEV Board — persistance DB + cache mémoire."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from ...db import session_scope
from ...db.models import DevIssueCommentRow, DevIssueRow
from .types import BoardColumn, CommentSnapshot, IssueSnapshot, IssueStatus

logger = logging.getLogger("jarvis.mission_dev.board")


class BoardStoreError(Exception):
    def __init__(self, message: str, *, code: str = "board_error") -> None:
        super().__init__(message)
        self.code = code


class BoardStore:
    """Store kanban — SQLite/PG via SQLAlchemy, fallback mémoire si DB indisponible."""

    def __init__(self) -> None:
        self._issues: dict[str, IssueSnapshot] = {}
        self._comments: dict[str, list[CommentSnapshot]] = {}

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _parse_meta(raw: str | None) -> dict[str, Any]:
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}

    def _row_to_issue(self, row: DevIssueRow) -> IssueSnapshot:
        return IssueSnapshot(
            id=row.id,
            project_id=row.project_id,
            title=row.title,
            body=row.body or "",
            column=BoardColumn(row.column),
            status=IssueStatus(row.status),
            assignee_agent=row.assignee_agent,
            assignee_user_id=row.assignee_user_id,
            device_id=row.device_id,
            workspace_id=row.workspace_id,
            run_id=row.run_id,
            mission_dev_id=row.mission_dev_id,
            blocked_reason=row.blocked_reason,
            meta=self._parse_meta(row.meta_json),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _row_to_comment(self, row: DevIssueCommentRow) -> CommentSnapshot:
        return CommentSnapshot(
            id=row.id,
            issue_id=row.issue_id,
            author=row.author,
            body=row.body,
            meta=self._parse_meta(row.meta_json),
            created_at=row.created_at,
        )

    def list_issues(self, *, project_id: str | None = None) -> list[IssueSnapshot]:
        pid = str(project_id or "").strip() or None
        if not self._issues:
            self._hydrate_from_db()
        items = list(self._issues.values())
        if pid:
            items = [i for i in items if i.project_id == pid]
        return sorted(items, key=lambda i: i.updated_at, reverse=True)

    def get_issue(self, issue_id: str) -> IssueSnapshot | None:
        iid = str(issue_id or "").strip()
        if not iid:
            return None
        if iid in self._issues:
            return self._issues[iid]
        self._hydrate_issue(iid)
        return self._issues.get(iid)

    def list_comments(self, issue_id: str) -> list[CommentSnapshot]:
        iid = str(issue_id or "").strip()
        if not iid:
            return []
        if iid not in self._comments:
            self._hydrate_comments(iid)
        return list(self._comments.get(iid, []))

    def create_issue(
        self,
        *,
        title: str,
        body: str = "",
        project_id: str | None = None,
        column: BoardColumn = BoardColumn.BACKLOG,
    ) -> IssueSnapshot:
        title = str(title or "").strip()
        if not title:
            raise BoardStoreError("title requis", code="board_title_required")
        now = self._now()
        iid = str(uuid.uuid4())
        snap = IssueSnapshot(
            id=iid,
            project_id=project_id,
            title=title,
            body=str(body or ""),
            column=column,
            status=IssueStatus.OPEN,
            assignee_agent=None,
            assignee_user_id=None,
            device_id=None,
            workspace_id=None,
            run_id=None,
            mission_dev_id=None,
            blocked_reason=None,
            meta={},
            created_at=now,
            updated_at=now,
        )
        self._issues[iid] = snap
        self._persist_issue(snap)
        return snap

    def update_issue(self, snap: IssueSnapshot) -> IssueSnapshot:
        updated = IssueSnapshot(
            id=snap.id,
            project_id=snap.project_id,
            title=snap.title,
            body=snap.body,
            column=snap.column,
            status=snap.status,
            assignee_agent=snap.assignee_agent,
            assignee_user_id=snap.assignee_user_id,
            device_id=snap.device_id,
            workspace_id=snap.workspace_id,
            run_id=snap.run_id,
            mission_dev_id=snap.mission_dev_id,
            blocked_reason=snap.blocked_reason,
            meta=dict(snap.meta),
            created_at=snap.created_at,
            updated_at=self._now(),
        )
        self._issues[updated.id] = updated
        self._persist_issue(updated)
        return updated

    def add_comment(self, *, issue_id: str, author: str, body: str) -> CommentSnapshot:
        issue = self.get_issue(issue_id)
        if issue is None:
            raise BoardStoreError("issue introuvable", code="board_issue_not_found")
        text = str(body or "").strip()
        if not text:
            raise BoardStoreError("commentaire vide", code="board_comment_empty")
        now = self._now()
        cid = str(uuid.uuid4())
        snap = CommentSnapshot(
            id=cid,
            issue_id=issue.id,
            author=str(author or "system").strip() or "system",
            body=text,
            meta={},
            created_at=now,
        )
        self._comments.setdefault(issue.id, []).append(snap)
        self._persist_comment(snap)
        return snap

    def _hydrate_from_db(self) -> None:
        try:
            with session_scope() as s:
                for row in s.query(DevIssueRow).all():
                    self._issues[row.id] = self._row_to_issue(row)
        except Exception as exc:  # noqa: BLE001
            logger.debug("board hydrate skip : %s", exc)

    def _hydrate_issue(self, issue_id: str) -> None:
        try:
            with session_scope() as s:
                row = s.get(DevIssueRow, issue_id)
                if row is not None:
                    self._issues[issue_id] = self._row_to_issue(row)
        except Exception as exc:  # noqa: BLE001
            logger.debug("board hydrate issue skip : %s", exc)

    def _hydrate_comments(self, issue_id: str) -> None:
        try:
            with session_scope() as s:
                rows = (
                    s.query(DevIssueCommentRow)
                    .filter(DevIssueCommentRow.issue_id == issue_id)
                    .order_by(DevIssueCommentRow.created_at.asc())
                    .all()
                )
                self._comments[issue_id] = [self._row_to_comment(r) for r in rows]
        except Exception as exc:  # noqa: BLE001
            logger.debug("board hydrate comments skip : %s", exc)

    def _persist_issue(self, snap: IssueSnapshot) -> None:
        try:
            with session_scope() as s:
                row = s.get(DevIssueRow, snap.id)
                if row is None:
                    row = DevIssueRow(
                        id=snap.id,
                        project_id=snap.project_id,
                        title=snap.title,
                        body=snap.body,
                        column=snap.column.value,
                        status=snap.status.value,
                        assignee_agent=snap.assignee_agent,
                        assignee_user_id=snap.assignee_user_id,
                        device_id=snap.device_id,
                        workspace_id=snap.workspace_id,
                        run_id=snap.run_id,
                        mission_dev_id=snap.mission_dev_id,
                        blocked_reason=snap.blocked_reason,
                        meta_json=json.dumps(snap.meta, ensure_ascii=False),
                        created_at=snap.created_at,
                        updated_at=snap.updated_at,
                    )
                    s.add(row)
                else:
                    row.project_id = snap.project_id
                    row.title = snap.title
                    row.body = snap.body
                    row.column = snap.column.value
                    row.status = snap.status.value
                    row.assignee_agent = snap.assignee_agent
                    row.assignee_user_id = snap.assignee_user_id
                    row.device_id = snap.device_id
                    row.workspace_id = snap.workspace_id
                    row.run_id = snap.run_id
                    row.mission_dev_id = snap.mission_dev_id
                    row.blocked_reason = snap.blocked_reason
                    row.meta_json = json.dumps(snap.meta, ensure_ascii=False)
                    row.updated_at = snap.updated_at
        except Exception as exc:  # noqa: BLE001
            logger.warning("board persist issue skip : %s", exc)

    def _persist_comment(self, snap: CommentSnapshot) -> None:
        try:
            with session_scope() as s:
                row = DevIssueCommentRow(
                    id=snap.id,
                    issue_id=snap.issue_id,
                    author=snap.author,
                    body=snap.body,
                    meta_json=json.dumps(snap.meta, ensure_ascii=False),
                    created_at=snap.created_at,
                )
                s.add(row)
        except Exception as exc:  # noqa: BLE001
            logger.warning("board persist comment skip : %s", exc)
