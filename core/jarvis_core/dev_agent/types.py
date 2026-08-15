"""P5 — types contrat dev.agent.run (générique cursor/claude)."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

ALLOWED_DEV_AGENTS = frozenset({"cursor", "claude"})


class RunState(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMEOUT = "TIMEOUT"
    UNKNOWN = "UNKNOWN"


TERMINAL_RUN_STATES = frozenset(
    {
        RunState.COMPLETED,
        RunState.FAILED,
        RunState.CANCELLED,
        RunState.TIMEOUT,
        RunState.UNKNOWN,
    }
)

CAPABILITY_DEV_AGENT_RUN = "dev.agent.run"


def dev_agent_capability(agent: str) -> str:
    """Capability discovery par agent : ``dev.agent.cursor`` etc."""
    return f"dev.agent.{agent}"


@dataclass
class DevAgentRunParams:
    agent: str
    workspace_id: str
    prompt: str
    mode: str = "headless"
    read_only: bool = False
    timeout_s: float = 600.0
    collect_git_diff: bool = True
    collect_tests: list[str] = field(default_factory=list)
    mission_dev_id: str | None = None
    step_id: str | None = None
    local_path: str | None = None  # hint — agent valide contre allowlist

    def operations(self) -> frozenset[str]:
        ops = {"READ"}
        if not self.read_only:
            ops.add("WRITE")
        if self.collect_tests:
            ops.add("EXECUTE")
        return frozenset(ops)

    def to_params_dict(self) -> dict[str, Any]:
        return {
            "agent": self.agent,
            "workspace_id": self.workspace_id,
            "prompt": self.prompt,
            "mode": self.mode,
            "read_only": self.read_only,
            "timeout_s": self.timeout_s,
            "collect_git_diff": self.collect_git_diff,
            "collect_tests": list(self.collect_tests),
            "mission_dev_id": self.mission_dev_id,
            "step_id": self.step_id,
            "local_path": self.local_path,
        }


@dataclass
class DevAgentRunResult:
    """Résultat final — CLAIM vs OBSERVATIONS séparés."""

    run_id: str
    agent: str
    device_id: str
    workspace_id: str
    ok: bool
    exit_code: int | None = None
    duration_ms: int | None = None
    agent_result: str | None = None  # CLAIM
    structured_output: dict[str, Any] | None = None
    files_changed: list[str] = field(default_factory=list)
    git_diff_stat: str | None = None
    git_diff_patch: str | None = None
    tests: list[dict[str, Any]] = field(default_factory=list)
    error_code: str | None = None
    error_message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "agent": self.agent,
            "device_id": self.device_id,
            "workspace_id": self.workspace_id,
            "ok": self.ok,
            "exit_code": self.exit_code,
            "duration_ms": self.duration_ms,
            "agent_result": self.agent_result,
            "structured_output": self.structured_output,
            "files_changed": list(self.files_changed),
            "git_diff_stat": self.git_diff_stat,
            "git_diff_patch": self.git_diff_patch,
            "tests": list(self.tests),
            "error_code": self.error_code,
            "error_message": self.error_message,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DevAgentRunResult:
        return cls(
            run_id=str(data.get("run_id") or ""),
            agent=str(data.get("agent") or ""),
            device_id=str(data.get("device_id") or ""),
            workspace_id=str(data.get("workspace_id") or ""),
            ok=bool(data.get("ok")),
            exit_code=data.get("exit_code"),
            duration_ms=data.get("duration_ms"),
            agent_result=data.get("agent_result"),
            structured_output=data.get("structured_output")
            if isinstance(data.get("structured_output"), dict)
            else None,
            files_changed=list(data.get("files_changed") or []),
            git_diff_stat=data.get("git_diff_stat"),
            git_diff_patch=data.get("git_diff_patch"),
            tests=list(data.get("tests") or []),
            error_code=data.get("error_code"),
            error_message=data.get("error_message"),
        )
