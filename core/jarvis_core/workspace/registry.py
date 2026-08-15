"""P5 — Workspace Registry (DB + fallback mémoire pour smokes)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from .types import WorkspaceBinding

logger = logging.getLogger("jarvis.workspace")


class WorkspaceRegistryError(Exception):
    def __init__(self, message: str, *, code: str = "workspace_error") -> None:
        super().__init__(message)
        self.code = code


class WorkspaceRegistry:
    """Registre workspace — une machine autoritaire par workspace_id (V1)."""

    def __init__(self) -> None:
        self._memory: dict[str, WorkspaceBinding] = {}

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def register(self, binding: WorkspaceBinding, *, persist: bool = True) -> WorkspaceBinding:
        from .conventions import is_device_resolved_local_path, validate_local_path

        if not is_device_resolved_local_path(binding.local_path):
            validate_local_path(binding.local_path, binding.workspace_id)
        elif not str(binding.authoritative_device_id or "").strip():
            raise WorkspaceRegistryError(
                "binding device-resolved requiert authoritative_device_id",
                code="workspace_device_required",
            )
        self._memory[binding.workspace_id] = binding
        if persist:
            try:
                self._persist(binding)
            except Exception as exc:  # noqa: BLE001
                logger.warning("workspace persist skip : %s", exc)
        return binding

    def get(self, workspace_id: str) -> WorkspaceBinding | None:
        wid = str(workspace_id or "").strip()
        if not wid:
            return None
        if wid in self._memory:
            return self._memory[wid]
        row = self._load(wid)
        if row is not None:
            self._memory[wid] = row
        return row

    def resolve_local_path(
        self,
        workspace_id: str,
        *,
        device_id: str | None = None,
    ) -> str:
        binding = self.get(workspace_id)
        if binding is None:
            raise WorkspaceRegistryError(
                f"workspace inconnu : {workspace_id}",
                code="workspace_not_found",
            )
        if device_id and device_id != binding.authoritative_device_id:
            raise WorkspaceRegistryError(
                f"workspace {workspace_id} autoritaire sur {binding.authoritative_device_id}, "
                f"pas {device_id}",
                code="workspace_not_authoritative_on_device",
            )
        from .conventions import is_device_resolved_local_path

        if is_device_resolved_local_path(binding.local_path):
            raise WorkspaceRegistryError(
                f"workspace {workspace_id} : local_path résolu sur le device "
                f"{binding.authoritative_device_id}",
                code="workspace_path_device_resolved",
            )
        return binding.local_path

    def _persist(self, binding: WorkspaceBinding) -> None:
        from ..db import session_scope
        from ..db.models import WorkspaceRow

        with session_scope() as s:
            row = s.get(WorkspaceRow, binding.workspace_id)
            if row is None:
                row = WorkspaceRow(
                    id=binding.workspace_id,
                    repo_name=binding.repo_name,
                    authoritative_device_id=binding.authoritative_device_id,
                    local_path=binding.local_path,
                    sync_mode=binding.sync_mode,
                    project_id=binding.project_id,
                    created_at=self._now(),
                    updated_at=self._now(),
                )
                s.add(row)
            else:
                row.repo_name = binding.repo_name
                row.authoritative_device_id = binding.authoritative_device_id
                row.local_path = binding.local_path
                row.sync_mode = binding.sync_mode
                row.project_id = binding.project_id
                row.updated_at = self._now()

    def _load(self, workspace_id: str) -> WorkspaceBinding | None:
        try:
            from ..db import session_scope
            from ..db.models import WorkspaceRow

            with session_scope() as s:
                row = s.get(WorkspaceRow, workspace_id)
                if row is None:
                    return None
                return WorkspaceBinding(
                    workspace_id=row.id,
                    repo_name=row.repo_name,
                    authoritative_device_id=row.authoritative_device_id,
                    local_path=row.local_path,
                    sync_mode=row.sync_mode or "local_only",
                    project_id=row.project_id,
                )
        except Exception:  # noqa: BLE001
            return None

    def list_bindings(self) -> list[dict[str, Any]]:
        return [b.to_dict() for b in self._memory.values()]
