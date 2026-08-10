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
