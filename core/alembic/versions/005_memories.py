"""memories — Memory V2 PostgreSQL backend (FTS PG, table aussi SQLite)

Revision ID: 005_memories
Revises: 004_user_profile
Create Date: 2026-08-13

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005_memories"
down_revision: Union[str, None] = "004_user_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FTS_SQL = """
ALTER TABLE memories
  ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(content, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(tags_json, '') || ' ' ||
      coalesce(wing, '') || ' ' ||
      coalesce(room, '')
    )
  ) STORED
"""


def upgrade() -> None:
    op.create_table(
        "memories",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=True),
        sa.Column("summary", sa.String(length=500), nullable=True),
        sa.Column("wing", sa.String(length=128), nullable=True),
        sa.Column("room", sa.String(length=128), nullable=True),
        sa.Column("device_id", sa.String(length=64), nullable=True),
        sa.Column("mission_id", sa.String(length=128), nullable=True),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("tags_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("source_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("evidence_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.Column("updated_at", sa.String(length=40), nullable=False),
        sa.Column("importance", sa.String(length=16), nullable=False, server_default="normal"),
        sa.Column("ttl_days", sa.Integer(), nullable=True),
        sa.Column("tombstone", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("synced", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.PrimaryKeyConstraint("id", "user_id"),
    )
    op.create_index("ix_memories_user_id", "memories", ["user_id"], unique=False)
    op.create_index("ix_memories_user_kind", "memories", ["user_id", "kind"], unique=False)
    op.create_index("ix_memories_user_wing", "memories", ["user_id", "wing"], unique=False)
    op.create_index("ix_memories_user_room", "memories", ["user_id", "room"], unique=False)
    op.create_index("ix_memories_created", "memories", ["created_at"], unique=False)

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text(_FTS_SQL))
        op.execute(sa.text("CREATE INDEX ix_memories_fts ON memories USING GIN (search_tsv)"))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("DROP INDEX IF EXISTS ix_memories_fts"))
        op.execute(sa.text("ALTER TABLE memories DROP COLUMN IF EXISTS search_tsv"))
    op.drop_index("ix_memories_created", table_name="memories")
    op.drop_index("ix_memories_user_room", table_name="memories")
    op.drop_index("ix_memories_user_wing", table_name="memories")
    op.drop_index("ix_memories_user_kind", table_name="memories")
    op.drop_index("ix_memories_user_id", table_name="memories")
    op.drop_table("memories")
