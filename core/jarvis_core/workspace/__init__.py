"""P5 — Workspace Registry."""
from __future__ import annotations

from .conventions import (
    DEVICE_RESOLVED_LOCAL_PATH,
    WORKSPACE_JARVIS_MAIN,
    classify_workspace_id,
    detect_jarvis_repo_root,
    detect_jarvis_repo_root_optional,
    ensure_jarvis_main,
    is_device_resolved_local_path,
    is_path_under,
    laragon_www_root,
    validate_local_path,
)
from .registry import WorkspaceRegistry, WorkspaceRegistryError
from .types import WorkspaceBinding

__all__ = [
    "DEVICE_RESOLVED_LOCAL_PATH",
    "WORKSPACE_JARVIS_MAIN",
    "WorkspaceBinding",
    "WorkspaceRegistry",
    "WorkspaceRegistryError",
    "classify_workspace_id",
    "detect_jarvis_repo_root",
    "detect_jarvis_repo_root_optional",
    "ensure_jarvis_main",
    "is_device_resolved_local_path",
    "is_path_under",
    "laragon_www_root",
    "validate_local_path",
]
