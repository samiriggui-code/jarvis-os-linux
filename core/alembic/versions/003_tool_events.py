"""tool_events — journal des tool calls (Tool Bus Phase 1)

Revision ID: 003_tool_events
Revises: 002_projects
Create Date: 2026-08-07

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003_tool_events"
down_revision: Union[str, None] = "002_projects"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tool_events",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("intent", sa.String(length=64), nullable=False),
        sa.Column("stage", sa.String(length=16), nullable=False),
        sa.Column("owner", sa.String(length=16), nullable=False),
        sa.Column("toolset", sa.String(length=64), nullable=True),
        sa.Column("risk", sa.Integer(), nullable=False),
        sa.Column("operation", sa.String(length=16), nullable=True),
        sa.Column("role", sa.String(length=16), nullable=True),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("device_id", sa.String(length=32), nullable=True),
        sa.Column("meta_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tool_events_created", "tool_events", ["created_at"], unique=False)
    op.create_index("ix_tool_events_intent", "tool_events", ["intent"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tool_events_intent", table_name="tool_events")
    op.drop_index("ix_tool_events_created", table_name="tool_events")
    op.drop_table("tool_events")
