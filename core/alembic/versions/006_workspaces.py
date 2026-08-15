"""workspaces — P5 Workspace Registry (authoritative device binding)

Revision ID: 006_workspaces
Revises: 005_memories
Create Date: 2026-08-14

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006_workspaces"
down_revision: Union[str, None] = "005_memories"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("repo_name", sa.String(length=128), nullable=False),
        sa.Column("authoritative_device_id", sa.String(length=64), nullable=False),
        sa.Column("local_path", sa.Text(), nullable=False),
        sa.Column("sync_mode", sa.String(length=32), nullable=False, server_default="local_only"),
        sa.Column("project_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.Column("updated_at", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_workspaces_authoritative_device",
        "workspaces",
        ["authoritative_device_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_workspaces_authoritative_device", table_name="workspaces")
    op.drop_table("workspaces")
