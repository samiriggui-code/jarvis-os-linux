"""Résolution URL DB — PostgreSQL prod, SQLite local si absent."""
from __future__ import annotations

import os
from pathlib import Path


def default_data_dir() -> Path:
    """core/data/ — voisin du package, hors git."""
    return Path(__file__).resolve().parents[2] / "data"


def database_url(*, sqlite_path: Path | None = None) -> str:
    """
    Priorité :
      1. JARVIS_DATABASE_URL (postgresql+psycopg://… ou sqlite://…)
      2. sqlite_path explicite (tests)
      3. SQLite fallback core/data/jarvis.db
    """
    env = (os.environ.get("JARVIS_DATABASE_URL") or "").strip()
    if env and sqlite_path is None:
        # Compat URL sans driver : postgresql:// → postgresql+psycopg://
        if env.startswith("postgresql://"):
            return "postgresql+psycopg://" + env[len("postgresql://") :]
        return env

    path = sqlite_path or default_data_dir() / "jarvis.db"
    path.parent.mkdir(parents=True, exist_ok=True)
    # Absolute path for SQLAlchemy sqlite URL
    return f"sqlite:///{path.resolve().as_posix()}"


def describe_backend(url: str | None = None) -> dict[str, str]:
    u = url or database_url()
    if u.startswith("postgresql"):
        backend = "postgresql"
    elif u.startswith("sqlite"):
        backend = "sqlite"
    else:
        backend = "other"
    return {"backend": backend, "url_scheme": u.split(":", 1)[0]}
