"""Smoke — Mission DEV WRITE + collect_tests → Verification VALIDATED/DISPUTED.

    python -m jarvis_core._smoke_mission_dev_write_validation
"""
from __future__ import annotations

import asyncio
import contextlib
import importlib.util
import json
import sys
import time
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.workspace import WORKSPACE_JARVIS_MAIN  # noqa: E402

FAKE_AGENT = ROOT.parent / "deploy" / "windows-agent" / "fake_agent.py"
DEV_PORTABLE = "fake-portable-md"

PASS_TEST = 'python -c "import sys; sys.exit(0)"'
FAIL_TEST = 'python -c "import sys; sys.exit(1)"'


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def _verify_step(orch: Any, result: dict[str, Any], *, read_only: bool = False) -> str:
    from jarvis_core.mission_dev import MissionDevRunner

    outcome = MissionDevRunner._verify_dev_agent_step(
        orch.verification,
        mission_dev_id="smoke-md",
        step_id="step-1",
        agent=str(result.get("agent") or "cursor"),
        workspace_id=WORKSPACE_JARVIS_MAIN,
        device_id=str(result.get("device_id") or DEV_PORTABLE),
        owner_user_id="local",
        result=result,
        read_only=read_only,
    )
    return str(getattr(outcome, "outcome", "") or "")


def test_verify_synthetic() -> None:
    from jarvis_core import Orchestrator

    orch = Orchestrator()

    validated = _verify_step(
        orch,
        {
            "ok": True,
            "exit_code": 0,
            "agent": "cursor",
            "agent_result": "Fixed imports.",
            "files_changed": ["a.py"],
            "git_diff_stat": "1 file changed",
            "tests": [{"name": PASS_TEST, "exit_code": 0}],
        },
    )
    check("synthetic WRITE + tests -> validated", validated == "validated", validated)

    disputed_no_tests = _verify_step(
        orch,
        {
            "ok": True,
            "exit_code": 0,
            "agent": "cursor",
            "agent_result": "Fixed imports.",
            "files_changed": ["a.py"],
            "git_diff_stat": "1 file changed",
            "tests": [],
        },
    )
    check("synthetic WRITE sans tests -> disputed", disputed_no_tests == "disputed", disputed_no_tests)

    disputed_fail = _verify_step(
        orch,
        {
            "ok": True,
            "exit_code": 0,
            "agent": "cursor",
            "agent_result": "Fixed imports.",
            "files_changed": ["a.py"],
            "git_diff_stat": "1 file changed",
            "tests": [{"name": FAIL_TEST, "exit_code": 1}],
        },
    )
    check("synthetic WRITE + test FAIL -> disputed", disputed_fail == "disputed", disputed_fail)


async def _wait_mission_done(events: list[dict[str, Any]], *, timeout: float = 8.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for ev in reversed(events):
            if ev.get("type") == "mission_dev_finished":
                return ev
        await asyncio.sleep(0.05)
    return {}


async def _run_mission_step(
    orch: Any,
    *,
    prompt: str,
    collect_tests: list[str] | None,
    agent: str = "cursor",
) -> dict[str, Any]:
    events: list[dict[str, Any]] = []

    async def _send(payload: dict[str, Any]) -> None:
        events.append(payload)

    step: dict[str, Any] = {
        "step_id": "write-smoke",
        "agent": agent,
        "workspace_id": WORKSPACE_JARVIS_MAIN,
        "prompt": prompt,
        "read_only": False,
        "timeout_s": 30.0,
    }
    if collect_tests is not None:
        step["collect_tests"] = collect_tests

    await orch.mission_dev.start_dev_agent_mission(
        send=_send,
        speak=AsyncMock(),
        steps=[step],
        dev_agent_dispatch=orch.dev_agent_dispatch,
        policy_engine=orch.policy,
        verification=orch.verification,
        project_name="SmokeWriteValidation",
    )
    while orch.mission_dev.running:
        await asyncio.sleep(0.05)
    return await _wait_mission_done(events)


async def _run_fake_agent_integration() -> None:
    if not FAKE_AGENT.is_file():
        check("fake_agent present", False, str(FAKE_AGENT))
        return

    spec = importlib.util.spec_from_file_location("jarvis_fake_agent", FAKE_AGENT)
    assert spec and spec.loader
    fake_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fake_mod)

    try:
        from websockets.asyncio.server import serve
    except ImportError:
        check("websockets installed", False)
        return

    from jarvis_core import Orchestrator, handler
    from jarvis_core.dev_agent.types import dev_agent_capability
    from jarvis_core.policy import Decision
    from jarvis_core.workspace import WORKSPACE_JARVIS_MAIN, WorkspaceBinding, detect_jarvis_repo_root

    jarvis_root = detect_jarvis_repo_root()
    port = 18767
    uri = f"ws://127.0.0.1:{port}"

    orch = Orchestrator()
    orch.policy.evaluate = lambda **kwargs: Decision(allowed=True, needs_confirmation=False)  # type: ignore[method-assign]

    orch.workspaces.register(
        WorkspaceBinding(
            workspace_id=WORKSPACE_JARVIS_MAIN,
            repo_name=jarvis_root.name,
            authoritative_device_id=DEV_PORTABLE,
            local_path=str(jarvis_root),
            sync_mode="local_only",
        ),
        persist=False,
    )

    stop = asyncio.Event()
    agent_task = asyncio.create_task(
        fake_mod.run_agent(
            uri,
            device_id=DEV_PORTABLE,
            stop=stop,
            heartbeat_s=60.0,
            workspace_ids=frozenset({WORKSPACE_JARVIS_MAIN}),
            agents=frozenset({"cursor", "claude"}),
        )
    )

    async with serve(lambda ws: handler(orch, ws), "127.0.0.1", port):
        for _ in range(80):
            await asyncio.sleep(0.1)
            p = orch.devices.get_device(DEV_PORTABLE)
            if p is not None and dev_agent_capability("cursor") in {
                c.capability_id for c in p.capabilities.values()
            }:
                break
        else:
            check("fake agent registered", False)

        finished_pass = await _run_mission_step(
            orch, prompt="fix readme smoke pass", collect_tests=[PASS_TEST]
        )
        steps_pass = finished_pass.get("steps") or []
        check("mission finished pass", finished_pass.get("ok") is True, json.dumps(finished_pass)[:200])
        check(
            "WRITE + collect_tests PASS -> validated",
            bool(steps_pass and steps_pass[0].get("verification_status") == "validated"),
            str(steps_pass),
        )

        finished_fail = await _run_mission_step(
            orch, prompt="fix readme smoke exit1", collect_tests=[FAIL_TEST]
        )
        steps_fail = finished_fail.get("steps") or []
        check(
            "WRITE + collect_tests FAIL -> disputed",
            bool(steps_fail and steps_fail[0].get("verification_status") == "disputed"),
            str(steps_fail),
        )

        finished_no_tests = await _run_mission_step(
            orch, prompt="fix readme no tests", collect_tests=[]
        )
        steps_nt = finished_no_tests.get("steps") or []
        check(
            "WRITE sans collect_tests -> disputed",
            bool(steps_nt and steps_nt[0].get("verification_status") == "disputed"),
            str(steps_nt),
        )

        finished_claude = await _run_mission_step(
            orch,
            prompt="claude write smoke",
            collect_tests=[PASS_TEST],
            agent="claude",
        )
        steps_cl = finished_claude.get("steps") or []
        check(
            "claude WRITE + collect_tests -> validated",
            bool(steps_cl and steps_cl[0].get("verification_status") == "validated"),
            str(steps_cl),
        )
        check("claude producer", bool(steps_cl and steps_cl[0].get("producer") == "claude"))

    stop.set()
    agent_task.cancel()
    with contextlib.suppress(asyncio.CancelledError, ConnectionError):
        await agent_task


def test_voice_provenance_helpers() -> None:
    from jarvis_core.mission_dev import _authentic_producer, _vocalize_agent_text

    fake = {
        "agent_result": "**Done** with `fix`",
        "structured_output": {"simulated": True, "producer": "cursor"},
    }
    real = {
        "agent_result": "Imports corriges.",
        "structured_output": {"producer": "cursor", "result": "ok"},
    }
    check("fake producer blocked", not _authentic_producer(fake, "cursor"))
    check("real producer allowed", _authentic_producer(real, "cursor"))
    check("vocalize strips markdown", "`fix`" not in _vocalize_agent_text(fake["agent_result"]))


async def test_voice_restitution_mock() -> None:
    from jarvis_core.mission_dev import _restitute_step_voice

    calls: list[dict[str, Any]] = []

    async def _speak_entity(text: str, **kwargs: Any) -> dict[str, Any]:
        calls.append({"text": text, **kwargs})
        return {"type": "tts_audio", **kwargs}

    async def _handoff(frm: str, to: str) -> None:
        calls.append({"handoff": frm, "to": to})

    await _restitute_step_voice(
        speak_entity=_speak_entity,
        handoff_speaker=_handoff,
        agent="cursor",
        producer="cursor",
        result={
            "agent_result": "Smoke passe.",
            "structured_output": {"producer": "cursor"},
        },
        verification_status="validated",
        read_only=False,
    )
    check("cursor spoke", any(c.get("speaker_entity") == "cursor" for c in calls))
    check("jarvis validation spoke", any(c.get("speaker_entity") == "jarvis" for c in calls))
    check("handoff recorded", any(c.get("handoff") == "cursor" for c in calls))

    calls.clear()
    await _restitute_step_voice(
        speak_entity=_speak_entity,
        handoff_speaker=_handoff,
        agent="cursor",
        producer="cursor",
        result={
            "agent_result": "Simulated",
            "structured_output": {"simulated": True, "producer": "cursor"},
        },
        verification_status="validated",
        read_only=False,
    )
    check("fake producer no TTS", len(calls) == 0)


def test_elevenlabs_entity_ids() -> None:
    from jarvis_core.personality import (
        CLAUDE_ELEVENLABS_VOICE_ID,
        CURSOR_ELEVENLABS_VOICE_ID,
        JARVIS_ELEVENLABS_VOICE_ID,
        resolve_elevenlabs_voice_id,
    )

    check("jarvis jarvis3 EL", resolve_elevenlabs_voice_id("jarvis") == JARVIS_ELEVENLABS_VOICE_ID)
    check("claude not jarvis3", resolve_elevenlabs_voice_id("claude") != JARVIS_ELEVENLABS_VOICE_ID)
    check("cursor jarvis2 EL", resolve_elevenlabs_voice_id("cursor") == CURSOR_ELEVENLABS_VOICE_ID)
    check("claude EL configured", CLAUDE_ELEVENLABS_VOICE_ID == "F42eFqrXBZYrTDYwcHo0")


def main() -> None:
    print("-- Mission DEV WRITE validation --")
    test_verify_synthetic()
    test_voice_provenance_helpers()
    asyncio.run(test_voice_restitution_mock())
    test_elevenlabs_entity_ids()
    asyncio.run(_run_fake_agent_integration())
    print("\nTous les tests Mission DEV WRITE OK.")


if __name__ == "__main__":
    main()
