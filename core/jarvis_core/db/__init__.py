"""
JARVIS Core — couche DB (PostgreSQL prod / SQLite fallback).

SQLAlchemy 2 + Alembic. HUD/Dashboard n’accèdent jamais à la DB directement.
"""
from __future__ import annotations

from .config import database_url, default_data_dir, describe_backend
from .session import get_engine, get_session_factory, session_scope, run_migrations

__all__ = [
    "database_url",
    "default_data_dir",
    "describe_backend",
    "get_engine",
    "get_session_factory",
    "session_scope",
    "run_migrations",
]
