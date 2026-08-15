"""P5 — Workspace Registry types."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WorkspaceBinding:
    """Binding workspace_id → machine autoritaire (V1 : une seule)."""

    workspace_id: str
    repo_name: str
    authoritative_device_id: str
    local_path: str
    sync_mode: str = "local_only"
    project_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "workspace_id": self.workspace_id,
            "repo_name": self.repo_name,
            "authoritative_device_id": self.authoritative_device_id,
            "local_path": self.local_path,
            "sync_mode": self.sync_mode,
            "project_id": self.project_id,
        }
