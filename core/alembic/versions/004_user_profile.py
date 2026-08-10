"""users — profil enroll (title, birth_date)

Revision ID: 004_user_profile
Revises: 003_tool_events
Create Date: 2026-08-10

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004_user_profile"
down_revision: Union[str, None] = "003_tool_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("title", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("birth_date", sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "birth_date")
    op.drop_column("users", "title")
