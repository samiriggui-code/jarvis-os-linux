"""
Persistance profils fichiers (embeddings, prefs) — hors tables SQL.

DB relationnelle : jarvis_core.db (PostgreSQL / SQLite via SQLAlchemy).
"""
from __future__ import annotations

from pathlib import Path

from jarvis_core.db.config import default_data_dir


def ensure_user_profile_dir(user_id: str, data_dir: Path | None = None) -> Path:
    """Crée l'arbre fichiers profil (placeholders) — embeddings Holomat / voix."""
    root = (data_dir or default_data_dir()) / "users" / user_id
    root.mkdir(parents=True, exist_ok=True)
    for name in (
        "face_profile",
        "voice_profile",
        "gesture_profile",
        "hud_preferences",
        "permissions",
    ):
        p = root / name
        if not p.exists():
            p.write_text("", encoding="utf-8")
    return root


# Compat imports historiques
def default_db_path() -> Path:
    """Ancien chemin SQLite users — conservé pour messages / reset docs."""
    return default_data_dir() / "jarvis.db"
