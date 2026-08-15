"""P5 — helpers Verification (CLAIM vs OBSERVATIONS)."""
from __future__ import annotations

from typing import Any

from .types import DevAgentRunResult


def observations_from_result(result: DevAgentRunResult | dict[str, Any]) -> dict[str, Any]:
    """Extrait les OBSERVATIONS d'un résultat dev.agent.run (pas le CLAIM)."""
    if isinstance(result, DevAgentRunResult):
        data = result.to_dict()
    else:
        data = dict(result)
    return {
        "exit_code": data.get("exit_code"),
        "files_changed": list(data.get("files_changed") or []),
        "git_diff_stat": data.get("git_diff_stat"),
        "git_diff_patch": data.get("git_diff_patch"),
        "tests": list(data.get("tests") or []),
    }


def claim_from_result(result: DevAgentRunResult | dict[str, Any]) -> str | None:
    if isinstance(result, DevAgentRunResult):
        return result.agent_result
    return result.get("agent_result") if isinstance(result, dict) else None


def sufficient_for_future_validation(observations: dict[str, Any], claim: str | None) -> bool:
    """Heuristique V1 — diff + tests OK ; claim seul insuffisant."""
    if not claim:
        return False
    has_diff = bool(observations.get("git_diff_stat") or observations.get("git_diff_patch"))
    tests = observations.get("tests") or []
    tests_ok = bool(tests) and all(int(t.get("exit_code", 1)) == 0 for t in tests if isinstance(t, dict))
    return has_diff and tests_ok
