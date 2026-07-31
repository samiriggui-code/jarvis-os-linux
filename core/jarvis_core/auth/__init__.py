"""jarvis_core.auth — User Manager + SQLAlchemy (§10.1)."""

from .models import AuthSession, Role, User, ROLE_PERMISSIONS
from .user_manager import UserManager
from .service import AuthService
from .db import default_db_path, default_data_dir

__all__ = [
    "AuthService",
    "AuthSession",
    "Role",
    "User",
    "UserManager",
    "ROLE_PERMISSIONS",
    "default_db_path",
    "default_data_dir",
]
