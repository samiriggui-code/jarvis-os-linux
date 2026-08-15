"""P5 — registre in-memory des runs DEV (V1)."""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from .types import DevAgentRunResult, RunState, TERMINAL_RUN_STATES


@dataclass
class DevRunRecord:
    """Un run DEV corrélé — ``run_id`` ≠ ``request_id``."""

    run_id: str
    request_id: str
    device_id: str
    workspace_id: str
    agent: str
    state: RunState = RunState.PENDING
    mission_dev_id: str | None = None
    step_id: str | None = None
    progress: list[dict[str, Any]] = field(default_factory=list)
    result: DevAgentRunResult | None = None
    error_code: str | None = None
    error_message: str | None = None
    started_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    timeout_s: float = 600.0

    def touch(self, *, state: RunState | None = None) -> None:
        self.updated_at = time.time()
        if state is not None:
            self.state = state

    def is_terminal(self) -> bool:
        return self.state in TERMINAL_RUN_STATES

    def to_status_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "run_id": self.run_id,
            "request_id": self.request_id,
            "state": self.state.value,
            "device_id": self.device_id,
            "workspace_id": self.workspace_id,
            "agent": self.agent,
            "mission_dev_id": self.mission_dev_id,
            "step_id": self.step_id,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
            "progress_count": len(self.progress),
        }
        if self.result is not None:
            out["result"] = self.result.to_dict()
        if self.error_code:
            out["error_code"] = self.error_code
        if self.error_message:
            out["error_message"] = self.error_message
        return out


class DevRunRegistry:
    def __init__(self) -> None:
        self._runs: dict[str, DevRunRecord] = {}

    def create_pending(
        self,
        *,
        request_id: str,
        device_id: str,
        workspace_id: str,
        agent: str,
        timeout_s: float,
        mission_dev_id: str | None = None,
        step_id: str | None = None,
        run_id: str | None = None,
    ) -> DevRunRecord:
        rid = run_id or str(uuid.uuid4())
        rec = DevRunRecord(
            run_id=rid,
            request_id=request_id,
            device_id=device_id,
            workspace_id=workspace_id,
            agent=agent,
            state=RunState.PENDING,
            mission_dev_id=mission_dev_id,
            step_id=step_id,
            timeout_s=timeout_s,
        )
        self._runs[rid] = rec
        return rec

    def get(self, run_id: str) -> DevRunRecord | None:
        return self._runs.get(str(run_id or "").strip())

    def mark_unknown_for_device(self, device_id: str) -> None:
        for rec in self._runs.values():
            if rec.device_id == device_id and not rec.is_terminal():
                rec.touch(state=RunState.UNKNOWN)
                rec.error_code = "device_disconnected"
                rec.error_message = "Agent déconnecté — run non réconciliable (V1)"

    def all_runs(self) -> list[DevRunRecord]:
        return list(self._runs.values())
