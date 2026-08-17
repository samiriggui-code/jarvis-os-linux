"""Smoke — Cursor Cloud Agents client + dispatch branch (mock, pas de réseau)."""
from __future__ import annotations

import asyncio
import os
import sys
from typing import Any
from unittest.mock import patch

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool, detail: str = "") -> None:
    suffix = f" — {detail}" if detail else ""
    print(f"  [{'OK' if cond else 'FAIL'}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def test_payload_mapping() -> None:
    from jarvis_core.cursor_agents import build_create_payload, resolve_repo_url

    os.environ.pop("JARVIS_CURSOR_REPO_URL", None)
    p = build_create_payload(
        prompt="Ajoute le niveau L3",
        repo_url="https://github.com/org/jarvis-os-linux",
        read_only=False,
    )
    check("mode agent when writable", p.get("mode") == "agent")
    check("autoCreatePR always false", p.get("autoCreatePR") is False)
    check("workOnCurrentBranch false", p.get("workOnCurrentBranch") is False)
    check("prompt text", p["prompt"]["text"] == "Ajoute le niveau L3")
    check("repo url", p["repos"][0]["url"].endswith("jarvis-os-linux"))

    p_ro = build_create_payload(
        prompt="lis seulement",
        repo_url="https://github.com/org/repo",
        read_only=True,
    )
    check("mode plan when read_only", p_ro.get("mode") == "plan")

    os.environ["JARVIS_CURSOR_REPO_URL"] = "https://github.com/samir/jarvis"
    try:
        url = resolve_repo_url(workspace_id="jarvis-main", repo_name="x", local_path=None)
        check("env repo url wins", url == "https://github.com/samir/jarvis")
    finally:
        os.environ.pop("JARVIS_CURSOR_REPO_URL", None)

    url2 = resolve_repo_url(workspace_id="jarvis-main", repo_name="acme/jarvis", local_path=None)
    check("org/repo shorthand", url2 == "https://github.com/acme/jarvis")
    url3 = resolve_repo_url(workspace_id="jarvis-main", repo_name="jarvis-main", local_path="C:/x")
    check("no invent from local_path", url3 == "")


def test_claim_vs_observations() -> None:
    from jarvis_core.cursor_agents import result_from_cloud_run
    from jarvis_core.dev_agent.verification import claim_from_result, observations_from_result, sufficient_for_future_validation

    raw = result_from_cloud_run(
        local_run_id="local-1",
        workspace_id="jarvis-main",
        agent_id="bc-1",
        collect_git_diff=True,
        cloud={
            "id": "run-1",
            "status": "FINISHED",
            "result": "J'ai ajouté L3.",
            "durationMs": 12000,
            "git": {
                "branches": [
                    {
                        "repoUrl": "github.com/org/repo",
                        "branch": "cursor/l3",
                        "prUrl": "",
                    }
                ]
            },
        },
    )
    claim = claim_from_result(raw)
    obs = observations_from_result(raw)
    check("claim is agent text", claim == "J'ai ajouté L3.")
    check("no invented patch", obs.get("git_diff_patch") is None)
    check("branch listed as observation", bool(obs.get("files_changed")))
    # Claim + branch hint alone ≠ sufficient proof (needs real diff + tests)
    check(
        "claim alone not sufficient proof",
        not sufficient_for_future_validation(obs, claim),
    )


def test_dispatch_prefers_cloud_when_keyed() -> None:
    from jarvis_core.dev_agent import DevAgentDispatch, DevAgentRunParams, DevRunRegistry, RunState
    from jarvis_core.devices import DeviceRegistry
    from jarvis_core.workspace.registry import WorkspaceRegistry
    from jarvis_core.workspace.types import WorkspaceBinding
    from jarvis_core.routing.router import CapabilityRouter

    class _Conn:
        def ws_for_device(self, _device_id: str) -> Any:
            raise AssertionError("device path must not be used when CURSOR_API_KEY set")

    ws_reg = WorkspaceRegistry()
    ws_reg.register(
        WorkspaceBinding(
            workspace_id="jarvis-main",
            repo_name="acme/jarvis",
            authoritative_device_id="pc-dev",
            local_path="",
        )
    )
    dispatch = DevAgentDispatch(
        _Conn(),
        DevRunRegistry(),
        ws_reg,
        CapabilityRouter(DeviceRegistry()),
    )

    created = {
        "agent": {"id": "bc-test", "url": "https://cursor.com/agents/bc-test"},
        "run": {"id": "run-test", "status": "CREATING"},
    }

    async def _run() -> None:
        os.environ["CURSOR_API_KEY"] = "crsr_test_fake"
        os.environ["JARVIS_CURSOR_REPO_URL"] = "https://github.com/acme/jarvis"
        try:
            with patch("jarvis_core.cursor_agents.create_agent", return_value=created), patch(
                "jarvis_core.cursor_agents.get_run",
                return_value={
                    "id": "run-test",
                    "status": "FINISHED",
                    "result": "done",
                    "durationMs": 100,
                    "git": {"branches": []},
                },
            ), patch("jarvis_core.cursor_agents.record_run_usage"):
                rec = await dispatch.start_run(
                    DevAgentRunParams(
                        agent="cursor",
                        workspace_id="jarvis-main",
                        prompt="task",
                        timeout_s=5.0,
                    ),
                    {"granted": True, "role": "admin", "user_id": "samir", "operations": ["WRITE"]},
                )
                check("cloud device_id", rec.device_id == "cursor-cloud")
                check("cloud agent id stored", rec.cloud_agent_id == "bc-test")
                check("cloud run id stored", rec.cloud_run_id == "run-test")
                check("accepted/running", rec.state in (RunState.ACCEPTED, RunState.RUNNING, RunState.COMPLETED))
                await asyncio.sleep(3.5)
                final = dispatch.status(rec.run_id)
                check("status ok dict", final.get("ok") is True)
        finally:
            os.environ.pop("CURSOR_API_KEY", None)
            os.environ.pop("JARVIS_CURSOR_REPO_URL", None)
            for task in list(dispatch._watchers.values()):  # noqa: SLF001
                task.cancel()

    asyncio.run(_run())


def main() -> int:
    print("=== smoke Cursor Cloud Agents (Phase 2) ===")
    test_payload_mapping()
    test_claim_vs_observations()
    test_dispatch_prefers_cloud_when_keyed()
    print("=== ALL PASS ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
