"""P5 — simulation dev.agent.run pour fake_agent (sans CLI réel)."""
from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from typing import Any

from agent_lib import execute_result, run_collect_tests, validate_workspace_local_path

CAPABILITY_DEV_AGENT_RUN = "dev.agent.run"
ALLOWED_AGENTS = frozenset({"cursor", "claude"})


class DevAgentRunSimulator:
    def __init__(
        self,
        *,
        device_id: str,
        allowed_roots: list[str] | None = None,
        workspace_ids: frozenset[str] | None = None,
        agents: frozenset[str] | None = None,
        fail_run_ids: frozenset[str] | None = None,
        timeout_run_ids: frozenset[str] | None = None,
    ) -> None:
        self.device_id = device_id
        self.allowed_roots = [
            Path(p).resolve()
            for p in (allowed_roots or [os.environ.get("JARVIS_WORKSPACE_ROOT", "C:\\laragon\\www")])
        ]
        self.workspace_ids = workspace_ids or frozenset()
        self.agents = agents or ALLOWED_AGENTS
        self.fail_run_ids = fail_run_ids or frozenset()
        self.timeout_run_ids = timeout_run_ids or frozenset()
        self._runs: dict[str, asyncio.Task[None]] = {}
        self._states: dict[str, dict[str, Any]] = {}
        self._cancelled: set[str] = set()

    def dev_capabilities(self, workspace_ids: list[str] | None = None) -> list[dict[str, Any]]:
        ws = list(workspace_ids or self.workspace_ids)
        caps: list[dict[str, Any]] = [
            {
                "capability_id": CAPABILITY_DEV_AGENT_RUN,
                "value": True,
                "metadata": {"agents": sorted(self.agents)},
            },
        ]
        for agent in sorted(self.agents):
            caps.append(
                {
                    "capability_id": f"dev.agent.{agent}",
                    "value": True,
                    "metadata": {
                        "available": True,
                        "headless": True,
                        "workspace_ids": ws,
                    },
                }
            )
        return caps

    def _validate_path(self, local_path: str) -> bool:
        return validate_workspace_local_path(local_path, self.allowed_roots)

    async def handle_start(
        self,
        ws: Any,
        data: dict[str, Any],
        allowed: set[str],
    ) -> dict[str, Any]:
        started = time.monotonic()
        request_id = str(data.get("request_id") or "")
        device_id = str(data.get("device_id") or self.device_id)
        params = data.get("params") if isinstance(data.get("params"), dict) else {}
        policy = data.get("policy") if isinstance(data.get("policy"), dict) else {}

        if not policy.get("granted", False):
            return execute_result(
                request_id=request_id,
                device_id=device_id,
                ok=False,
                started=started,
                capability_id=CAPABILITY_DEV_AGENT_RUN,
                error_code="policy_denied",
                error="policy.granted=false",
            )

        agent = str(params.get("agent") or "").strip().lower()
        if agent not in ALLOWED_AGENTS:
            return execute_result(
                request_id=request_id,
                device_id=device_id,
                ok=False,
                started=started,
                capability_id=CAPABILITY_DEV_AGENT_RUN,
                error_code="agent_not_allowed",
                error=f"agent hors allowlist : {agent}",
            )

        if agent not in self.agents:
            return execute_result(
                request_id=request_id,
                device_id=device_id,
                ok=False,
                started=started,
                capability_id=CAPABILITY_DEV_AGENT_RUN,
                error_code="dev_agent_capability_missing",
                error=f"agent indisponible sur ce device : {agent}",
            )

        workspace_id = str(params.get("workspace_id") or "").strip()
        if self.workspace_ids and workspace_id not in self.workspace_ids:
            return execute_result(
                request_id=request_id,
                device_id=device_id,
                ok=False,
                started=started,
                capability_id=CAPABILITY_DEV_AGENT_RUN,
                error_code="workspace_not_on_device",
                error=f"workspace absent sur device : {workspace_id}",
            )

        local_path = str(params.get("local_path") or "").strip()
        if not local_path:
            ws = str(params.get("workspace_id") or "").strip()
            if not ws:
                return execute_result(
                    request_id=request_id,
                    device_id=device_id,
                    ok=False,
                    started=started,
                    capability_id=CAPABILITY_DEV_AGENT_RUN,
                    error_code="workspace_id_required",
                    error="workspace_id requis si local_path absent",
                )
            try:
                from workspace_local import resolve_workspace_path

                local_path = resolve_workspace_path(ws)
            except Exception as exc:  # noqa: BLE001
                return execute_result(
                    request_id=request_id,
                    device_id=device_id,
                    ok=False,
                    started=started,
                    capability_id=CAPABILITY_DEV_AGENT_RUN,
                    error_code="workspace_path_unresolved",
                    error=str(exc),
                )

        if not self._validate_path(local_path):
            return execute_result(
                request_id=request_id,
                device_id=device_id,
                ok=False,
                started=started,
                capability_id=CAPABILITY_DEV_AGENT_RUN,
                error_code="workspace_path_denied",
                error="local_path hors racines autorisées",
            )

        run_id = str(params.get("run_id") or "")
        if not run_id:
            return execute_result(
                request_id=request_id,
                device_id=device_id,
                ok=False,
                started=started,
                capability_id=CAPABILITY_DEV_AGENT_RUN,
                error_code="run_id_required",
                error="run_id requis",
            )

        if run_id in self._runs and not self._runs[run_id].done():
            return execute_result(
                request_id=request_id,
                device_id=device_id,
                ok=False,
                started=started,
                capability_id=CAPABILITY_DEV_AGENT_RUN,
                error_code="run_already_active",
                error=f"run déjà actif : {run_id}",
            )

        timeout_s = float(params.get("timeout_s") or 600.0)
        collect_tests = list(params.get("collect_tests") or [])
        read_only = bool(params.get("read_only", False))
        self._states[run_id] = {
            "run_id": run_id,
            "state": "ACCEPTED",
            "agent": agent,
            "workspace_id": workspace_id,
            "device_id": device_id,
            "started_at": time.time(),
            "updated_at": time.time(),
        }

        task = asyncio.create_task(
            self._simulate_run(
                ws,
                run_id=run_id,
                agent=agent,
                workspace_id=workspace_id,
                device_id=device_id,
                prompt=str(params.get("prompt") or ""),
                timeout_s=timeout_s,
                local_path=local_path,
                collect_tests=collect_tests,
                read_only=read_only,
            )
        )
        self._runs[run_id] = task

        return execute_result(
            request_id=request_id,
            device_id=device_id,
            ok=True,
            started=started,
            capability_id=CAPABILITY_DEV_AGENT_RUN,
            summary=f"dev.agent.run accepté ({agent})",
            result={"run_id": run_id, "state": "ACCEPTED", "agent": agent},
        )

    async def handle_cancel(self, ws: Any, data: dict[str, Any], allowed: set[str] | None = None) -> dict[str, Any]:
        run_id = str(data.get("run_id") or "")
        request_id = str(data.get("request_id") or "")
        if not run_id or run_id not in self._states:
            return {
                "type": "device.run.cancel_result",
                "ok": False,
                "request_id": request_id,
                "run_id": run_id,
                "error_code": "run_not_found",
            }
        self._cancelled.add(run_id)
        task = self._runs.get(run_id)
        if task and not task.done():
            task.cancel()
        self._states[run_id]["state"] = "CANCELLED"
        self._states[run_id]["updated_at"] = time.time()
        return {
            "type": "device.run.cancel_result",
            "ok": True,
            "request_id": request_id,
            "run_id": run_id,
            "state": "CANCELLED",
        }

    async def handle_status(self, ws: Any, data: dict[str, Any], allowed: set[str] | None = None) -> dict[str, Any]:
        run_id = str(data.get("run_id") or "")
        request_id = str(data.get("request_id") or "")
        state = self._states.get(run_id)
        if state is None:
            return {
                "type": "device.run.status_result",
                "ok": False,
                "request_id": request_id,
                "run_id": run_id,
                "error_code": "run_not_found",
            }
        return {
            "type": "device.run.status_result",
            "ok": True,
            "request_id": request_id,
            **state,
        }

    async def _send_json(self, ws: Any, payload: dict[str, Any]) -> None:
        import json

        try:
            await ws.send(json.dumps(payload))
        except Exception:
            return

    async def _simulate_run(
        self,
        ws: Any,
        *,
        run_id: str,
        agent: str,
        workspace_id: str,
        device_id: str,
        prompt: str,
        timeout_s: float,
        local_path: str = "",
        collect_tests: list[str] | None = None,
        read_only: bool = False,
    ) -> None:
        seq = 0
        try:
            if run_id in self.timeout_run_ids:
                await asyncio.sleep(min(timeout_s + 1.0, 3.0))
                if run_id in self._cancelled:
                    return
                await self._send_json(
                    ws,
                    {
                        "type": "device.run.failed",
                        "run_id": run_id,
                        "device_id": device_id,
                        "state": "TIMEOUT",
                        "error_code": "timeout",
                        "error_message": "simulated timeout",
                    },
                )
                self._states[run_id]["state"] = "TIMEOUT"
                return

            self._states[run_id]["state"] = "RUNNING"
            if "timeout_run" in prompt.lower():
                await asyncio.sleep(timeout_s + 1.5)
                return

            delay = 0.05
            if "long task" in prompt.lower():
                delay = 0.35

            phases = [
                ("init", "Initialisation agent"),
                ("analyze", f"Analyse prompt ({len(prompt)} chars)"),
                ("apply", "Application changements simulés"),
            ]
            for phase, message in phases:
                if run_id in self._cancelled:
                    await self._send_json(
                        ws,
                        {
                            "type": "device.run.failed",
                            "run_id": run_id,
                            "device_id": device_id,
                            "state": "CANCELLED",
                            "error_code": "cancelled",
                            "error_message": "Run annulé",
                        },
                    )
                    return
                seq += 1
                await self._send_json(
                    ws,
                    {
                        "type": "device.run.progress",
                        "run_id": run_id,
                        "device_id": device_id,
                        "phase": phase,
                        "message": message,
                        "sequence": seq,
                    },
                )
                await asyncio.sleep(delay)

            if run_id in self.fail_run_ids or "fail" in prompt.lower():
                await self._send_json(
                    ws,
                    {
                        "type": "device.run.failed",
                        "run_id": run_id,
                        "device_id": device_id,
                        "state": "FAILED",
                        "error_code": "simulated_failure",
                        "error_message": "Échec simulé fake_agent",
                    },
                )
                self._states[run_id]["state"] = "FAILED"
                return

            duration_ms = int((time.time() - self._states[run_id]["started_at"]) * 1000)
            tests: list[dict[str, Any]] = []
            if collect_tests:
                cwd = Path(local_path) if local_path else Path(".")
                tests = await run_collect_tests(cwd, collect_tests)

            files_changed = [] if read_only else ["README.md"]
            git_diff_stat = "" if read_only else "1 file changed, 1 insertion(+)"
            result = {
                "run_id": run_id,
                "agent": agent,
                "device_id": device_id,
                "workspace_id": workspace_id,
                "ok": True,
                "exit_code": 0,
                "duration_ms": duration_ms,
                "agent_result": f"Simulated fix by {agent}",
                "structured_output": {"simulated": True, "producer": agent},
                "files_changed": files_changed,
                "git_diff_stat": git_diff_stat,
                "git_diff_patch": None if read_only else "--- a/README.md\n+++ b/README.md\n@@\n+simulated",
                "tests": tests,
            }
            await self._send_json(
                ws,
                {
                    "type": "device.run.completed",
                    "run_id": run_id,
                    "device_id": device_id,
                    "result": result,
                },
            )
            self._states[run_id]["state"] = "COMPLETED"
            self._states[run_id]["updated_at"] = time.time()
        except asyncio.CancelledError:
            if run_id not in self._cancelled:
                self._cancelled.add(run_id)
            await self._send_json(
                ws,
                {
                    "type": "device.run.failed",
                    "run_id": run_id,
                    "device_id": device_id,
                    "state": "CANCELLED",
                    "error_code": "cancelled",
                    "error_message": "Run annulé",
                },
            )
            self._states[run_id]["state"] = "CANCELLED"
            raise
