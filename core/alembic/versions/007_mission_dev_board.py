"""dev_issues + dev_issue_comments — Mission DEV Board (kanban local)

Revision ID: 007_mission_dev_board
Revises: 006_workspaces
Create Date: 2026-08-15

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "007_mission_dev_board"
down_revision: Union[str, None] = "006_workspaces"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dev_issues",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("column", sa.String(length=32), nullable=False, server_default="backlog"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("assignee_agent", sa.String(length=32), nullable=True),
        sa.Column("assignee_user_id", sa.String(length=36), nullable=True),
        sa.Column("device_id", sa.String(length=64), nullable=True),
        sa.Column("workspace_id", sa.String(length=64), nullable=True),
        sa.Column("run_id", sa.String(length=36), nullable=True),
        sa.Column("mission_dev_id", sa.String(length=36), nullable=True),
        sa.Column("blocked_reason", sa.Text(), nullable=True),
        sa.Column("meta_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.Column("updated_at", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dev_issues_project", "dev_issues", ["project_id"], unique=False)
    op.create_index("ix_dev_issues_column", "dev_issues", ["column"], unique=False)
    op.create_index("ix_dev_issues_status", "dev_issues", ["status"], unique=False)
    op.create_index("ix_dev_issues_run", "dev_issues", ["run_id"], unique=False)

    op.create_table(
        "dev_issue_comments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("issue_id", sa.String(length=36), nullable=False),
        sa.Column("author", sa.String(length=64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("meta_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(["issue_id"], ["dev_issues.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dev_issue_comments_issue", "dev_issue_comments", ["issue_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_dev_issue_comments_issue", table_name="dev_issue_comments")
    op.drop_table("dev_issue_comments")
    op.drop_index("ix_dev_issues_run", table_name="dev_issues")
    op.drop_index("ix_dev_issues_status", table_name="dev_issues")
    op.drop_index("ix_dev_issues_column", table_name="dev_issues")
    op.drop_index("ix_dev_issues_project", table_name="dev_issues")
    op.drop_table("dev_issues")
