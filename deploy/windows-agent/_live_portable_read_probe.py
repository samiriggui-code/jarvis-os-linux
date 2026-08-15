"""Probe LIVE portable — Claude/Cursor READ sur jarvis-main (sans Core E2E).

    python _live_portable_read_probe.py
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import apply_env_file  # noqa: E402
from dev_agent_cli import RealDevAgentRunner  # noqa: E402
from agent_lib import validate_workspace_local_path  # noqa: E402

DEVICE_ID = "pc-33a88e343339"
WORKSPACE_ID = "jarvis-main"
JARVIS_ROOT = Path(r"C:\laragon\www\jarvis-os-linux")
READ_PROMPT = (
    "Inspecte ce repository en lecture seule et donne le nom du package Python "
    "principal du Core. Ne modifie aucun fichier."
)


class _CaptureWs:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    async def send(self, payload: str) -> None:
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            return
        if isinstance(data, dict):
            self.messages.append(data)


async def _run_agent(runner: RealDevAgentRunner, agent: str, *, timeout_s: float = 180.0) -> dict:
    run_id = str(uuid.uuid4())
    req_id = str(uuid.uuid4())
    ws = _CaptureWs()
    start = await runner.handle_start(
        ws,
        {
            "request_id": req_id,
            "device_id": DEVICE_ID,
            "policy": {"granted": True, "operations": ["READ"]},
            "params": {
                "run_id": run_id,
                "agent": agent,
                "workspace_id": WORKSPACE_ID,
                "local_path": str(JARVIS_ROOT),
                "prompt": READ_PROMPT,
                "timeout_s": timeout_s,
                "collect_tests": [],
            },
        },
        allowed=set(),
    )
    out: dict = {
        "agent": agent,
        "run_id": run_id,
        "device_id": DEVICE_ID,
        "workspace_id": WORKSPACE_ID,
        "local_path": str(JARVIS_ROOT.resolve()),
        "start_ok": bool(start.get("ok")),
        "start_error": start.get("error") or start.get("error_code"),
    }
    if not start.get("ok"):
        return out

    entry = runner._runs.get(run_id)
    if entry and entry.task:
        try:
            await asyncio.wait_for(entry.task, timeout=timeout_s + 45.0)
        except asyncio.TimeoutError:
            out["state"] = "PROBE_TIMEOUT"
            return out

    for msg in reversed(ws.messages):
        if msg.get("type") == "device.run.completed" and msg.get("run_id") == run_id:
            result = msg.get("result") if isinstance(msg.get("result"), dict) else {}
            out.update(
                {
                    "state": "COMPLETED",
                    "exit_code": result.get("exit_code"),
                    "files_changed": result.get("files_changed") or [],
                    "producer": (result.get("structured_output") or {}).get("producer") or agent,
                    "agent_result_preview": str(result.get("agent_result") or "")[:240],
                    "error_code": result.get("error_code"),
                    "error_message": result.get("error_message"),
                }
            )
            return out
        if msg.get("type") == "device.run.failed" and msg.get("run_id") == run_id:
            result = msg.get("result") if isinstance(msg.get("result"), dict) else {}
            out.update(
                {
                    "state": msg.get("state") or "FAILED",
                    "exit_code": result.get("exit_code"),
                    "files_changed": result.get("files_changed") or [],
                    "producer": agent,
                    "error_code": msg.get("error_code") or result.get("error_code"),
                    "error_message": msg.get("error_message") or result.get("error_message"),
                    "agent_result_preview": str(result.get("agent_result") or "")[:240],
                }
            )
            return out

    out["state"] = entry.state if entry else "UNKNOWN"
    return out


async def main() -> None:
    apply_env_file()
    roots = [Path(os.environ.get("JARVIS_WORKSPACE_ROOT", r"C:\laragon\www"))]
    print("PATH jarvis:", validate_workspace_local_path(str(JARVIS_ROOT), roots))
    print("PATH windows:", validate_workspace_local_path(r"C:\Windows\System32", roots))

    git = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=str(JARVIS_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    print("GIT ROOT:", git.stdout.strip())

    runner = RealDevAgentRunner(device_id=DEVICE_ID)
    caps = {c["capability_id"]: c for c in runner.dev_capabilities()}
    for key in ("dev.agent.run", "dev.agent.claude", "dev.agent.cursor"):
        c = caps.get(key, {})
        print(f"CAP {key}:", c.get("value"), c.get("metadata"))

    results = []
    for agent in ("claude", "cursor"):
        print(f"\n=== LIVE READ {agent} ===")
        t0 = time.monotonic()
        row = await _run_agent(runner, agent)
        row["duration_s"] = round(time.monotonic() - t0, 1)
        results.append(row)
        print(json.dumps(row, ensure_ascii=False, indent=2))

    print("\n=== SAME WORKSPACE PROOF ===")
    if len(results) == 2:
        a, b = results[0], results[1]
        print("CLAUDE cwd:", a.get("local_path"))
        print("CURSOR cwd:", b.get("local_path"))
        print("SAME CWD:", a.get("local_path") == b.get("local_path"))
        print("SAME GIT ROOT:", git.stdout.strip().replace("/", "\\").lower() == str(JARVIS_ROOT).lower())
        print("SAME DEVICE:", a.get("device_id") == b.get("device_id"))
        print("SAME WORKSPACE:", a.get("workspace_id") == b.get("workspace_id"))
        print("DIFF RUN_ID:", a.get("run_id") != b.get("run_id"))
        print("DIFF PRODUCER:", a.get("agent") != b.get("agent"))


if __name__ == "__main__":
    asyncio.run(main())
