"""Engine / sessions SQLAlchemy + helper migrations Alembic."""
from __future__ import annotations

import os

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .config import database_url

logger = logging.getLogger("jarvis.db")

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None
_bound_url: str | None = None


def _configure_sqlite(engine: Engine) -> None:
    @event.listens_for(engine, "connect")
    def _fk(dbapi_conn, _connection_record):  # noqa: ANN001
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_engine(*, url: str | None = None, echo: bool = False) -> Engine:
    global _engine, _SessionLocal, _bound_url
    resolved = url or database_url()
    if _engine is not None and _bound_url == resolved:
        return _engine

    connect_args = {}
    if resolved.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = create_engine(resolved, echo=echo, future=True, connect_args=connect_args)
    if resolved.startswith("sqlite"):
        _configure_sqlite(engine)

    _engine = engine
    _bound_url = resolved
    _SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    logger.info("DB engine → %s", describe_safe(resolved))
    return engine


def describe_safe(url: str) -> str:
    """Masque mot de passe dans les logs."""
    if "://" not in url:
        return url
    scheme, rest = url.split("://", 1)
    if "@" in rest and ":" in rest.split("@", 1)[0]:
        creds, host = rest.split("@", 1)
        user = creds.split(":", 1)[0]
        return f"{scheme}://{user}:***@{host}"
    return url


def get_session_factory(*, url: str | None = None) -> sessionmaker[Session]:
    get_engine(url=url)
    assert _SessionLocal is not None
    return _SessionLocal


@contextmanager
def session_scope(*, url: str | None = None) -> Iterator[Session]:
    factory = get_session_factory(url=url)
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def run_migrations(*, url: str | None = None) -> None:
    """Applique Alembic upgrade head (idempotent)."""
    import os

    from alembic import command
    from alembic.config import Config

    resolved = url or database_url()
    get_engine(url=resolved)

    # env.py lit ALEMBIC_DATABASE_URL en priorité (tests / URLs explicites)
    prev = os.environ.get("ALEMBIC_DATABASE_URL")
    os.environ["ALEMBIC_DATABASE_URL"] = resolved
    try:
        core_root = Path(__file__).resolve().parents[2]
        ini = core_root / "alembic.ini"
        cfg = Config(str(ini))
        cfg.set_main_option("sqlalchemy.url", resolved)
        cfg.set_main_option("script_location", str(core_root / "alembic"))
        # Signale à alembic/env.py de NE PAS appliquer alembic.ini : ces
        # migrations tournent dans le process du Core, et fileConfig y
        # remettrait la racine à WARN — rendant muets tous les INFO du Core.
        os.environ["JARVIS_EMBEDDED_ALEMBIC"] = "1"
        try:
            command.upgrade(cfg, "head")
        finally:
            os.environ.pop("JARVIS_EMBEDDED_ALEMBIC", None)
        logger.info("Alembic upgrade head OK (%s)", describe_safe(resolved))
    finally:
        if prev is None:
            os.environ.pop("ALEMBIC_DATABASE_URL", None)
        else:
            os.environ["ALEMBIC_DATABASE_URL"] = prev


def reset_engine() -> None:
    """Tests — force recreate engine."""
    global _engine, _SessionLocal, _bound_url
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None
    _bound_url = None
