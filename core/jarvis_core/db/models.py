"""Modèles SQLAlchemy — users, auth_audit, usage_events, projects."""
from __future__ import annotations

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    pin_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Profil foyer (formulaire enroll) — title = monsieur|madame|mademoiselle
    title: Mapped[str | None] = mapped_column(String(32), nullable=True)
    birth_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD
    face_enrolled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    voice_enrolled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    gesture_enrolled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class AuthAuditRow(Base):
    __tablename__ = "auth_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    method: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)


class UsageEventRow(Base):
    __tablename__ = "usage_events"
    __table_args__ = (
        Index("ix_usage_created", "created_at"),
        Index("ix_usage_provider", "provider"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tokens_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)


class ToolEventRow(Base):
    """Journal des tool calls — Core (déterministe) et délégués (Hermes).

    Distinct de `UsageEventRow` : celui-là mesure des complétions LLM (tokens,
    coût) ; celui-ci mesure des actions (quelle intention, par qui, avec quel
    résultat). Voir `tool_events.py`.
    """
    __tablename__ = "tool_events"
    __table_args__ = (
        Index("ix_tool_events_created", "created_at"),
        Index("ix_tool_events_intent", "intent"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    intent: Mapped[str] = mapped_column(String(64), nullable=False)
    stage: Mapped[str] = mapped_column(String(16), nullable=False)
    owner: Mapped[str] = mapped_column(String(16), nullable=False)
    toolset: Mapped[str | None] = mapped_column(String(64), nullable=True)
    risk: Mapped[int] = mapped_column(Integer, nullable=False)
    operation: Mapped[str | None] = mapped_column(String(16), nullable=True)
    role: Mapped[str | None] = mapped_column(String(16), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)


class ProjectRow(Base):
    """Mémoire projet Mission Control DEV (§15.4 Phase A)."""
    __tablename__ = "projects"
    __table_args__ = (
        Index("ix_projects_name", "name"),
        Index("ix_projects_status", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="init")
    scenario: Mapped[str] = mapped_column(String(32), nullable=False, default="cursor")
    owner_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    workspace_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class WorkspaceRow(Base):
    """P5 — binding workspace_id → machine autoritaire + chemin local."""

    __tablename__ = "workspaces"
    __table_args__ = (Index("ix_workspaces_authoritative_device", "authoritative_device_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    repo_name: Mapped[str] = mapped_column(String(128), nullable=False)
    authoritative_device_id: Mapped[str] = mapped_column(String(64), nullable=False)
    local_path: Mapped[str] = mapped_column(Text, nullable=False)
    sync_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="local_only")
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class DevIssueRow(Base):
    """Mission DEV Board — ticket kanban (V1 local)."""

    __tablename__ = "dev_issues"
    __table_args__ = (
        Index("ix_dev_issues_project", "project_id"),
        Index("ix_dev_issues_column", "column"),
        Index("ix_dev_issues_status", "status"),
        Index("ix_dev_issues_run", "run_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    column: Mapped[str] = mapped_column(String(32), nullable=False, default="backlog")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    assignee_agent: Mapped[str | None] = mapped_column(String(32), nullable=True)
    assignee_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    workspace_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    mission_dev_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    blocked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class DevIssueCommentRow(Base):
    """Commentaires / activité sur un ticket Mission DEV."""

    __tablename__ = "dev_issue_comments"
    __table_args__ = (Index("ix_dev_issue_comments_issue", "issue_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    issue_id: Mapped[str] = mapped_column(String(36), ForeignKey("dev_issues.id"), nullable=False)
    author: Mapped[str] = mapped_column(String(64), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)


class MemoryRow(Base):
    """Souvenirs Memory V2 — backend PostgreSQL (SQLite fallback tests).

    Pas de FK vers users.id : les smokes et le profil `local` n'ont pas
    forcément de ligne users. Isolation = filtre user_id dans PgAdapter.
    """

    __tablename__ = "memories"
    __table_args__ = (
        Index("ix_memories_user_id", "user_id"),
        Index("ix_memories_user_kind", "user_id", "kind"),
        Index("ix_memories_user_wing", "user_id", "wing"),
        Index("ix_memories_user_room", "user_id", "room"),
        Index("ix_memories_created", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    wing: Mapped[str | None] = mapped_column(String(128), nullable=True)
    room: Mapped[str | None] = mapped_column(String(128), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mission_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    source_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    evidence_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)
    importance: Mapped[str] = mapped_column(String(16), nullable=False, default="normal")
    ttl_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tombstone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    synced: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
