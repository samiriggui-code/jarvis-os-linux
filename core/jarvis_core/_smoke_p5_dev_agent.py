"""Smoke P5 — dev.agent.run + Workspace Registry (fake_agent).

    python -m jarvis_core._smoke_p5_dev_agent

Gate :
    WorkspaceRegistry → Router → DevAgentDispatch → WS → fake_agent
    lifecycle async · cancel · timeout · policy · multi-device
"""

from __future__ import annotations

import asyncio
import contextlib
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
FAKE_AGENT = ROOT.parent / "deploy" / "windows-agent" / "fake_agent.py"
DEV_PORTABLE = "fake-portable-p5"
DEV_DESKTOP = "fake-desktop-p5"


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


async def _wait_run_terminal(orch: Any, run_id: str, *, timeout: float = 5.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        st = orch.dev_agent_dispatch.status(run_id)
        state = str(st.get("state") or "")
        if state in ("COMPLETED", "FAILED", "CANCELLED", "TIMEOUT", "UNKNOWN"):
            return st
        await asyncio.sleep(0.05)
    return orch.dev_agent_dispatch.status(run_id)


async def _run_all() -> None:
    if not FAKE_AGENT.is_file():
        check("fake_agent.py present", False, str(FAKE_AGENT))
        return

    import importlib.util

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
    from jarvis_core.capabilities import CAPABILITIES, Owner, match_intent
    from jarvis_core.dev_agent import DevAgentDispatchError, DevAgentRunParams, RunState
    from jarvis_core.dev_agent.types import dev_agent_capability
    from jarvis_core.policy import Decision
    from jarvis_core.routing.provider import CapabilityProvider, provider_for_intent
    from jarvis_core.routing.router import RouteContext
    from jarvis_core.workspace import WORKSPACE_JARVIS_MAIN, WorkspaceBinding, detect_jarvis_repo_root

    jarvis_root = detect_jarvis_repo_root()
    port = 18766
    uri = f"ws://127.0.0.1:{port}"

    orch = Orchestrator()
    orch.policy.evaluate = lambda **kwargs: Decision(allowed=True, needs_confirmation=False)  # type: ignore[method-assign]
    orch.speak = AsyncMock(return_value={"type": "tts_skipped"})  # type: ignore[method-assign]
    orch.say = AsyncMock(return_value=None)  # type: ignore[method-assign]

    bus_events: list[dict[str, Any]] = []
    orig_emit = orch.emit

    def _capture_emit(kind: str, payload: dict[str, Any], source: str = "core") -> None:
        bus_events.append({"kind": kind, **payload})
        orig_emit(kind, payload, source=source)

    orch.emit = _capture_emit  # type: ignore[method-assign]
    orch.dev_agent_dispatch._emit = _capture_emit  # type: ignore[method-assign]

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
    portable_task = asyncio.create_task(
        fake_mod.run_agent(
            uri,
            device_id=DEV_PORTABLE,
            stop=stop,
            heartbeat_s=60.0,
            workspace_ids=frozenset({WORKSPACE_JARVIS_MAIN}),
            agents=frozenset({"cursor", "claude"}),
        )
    )
    desktop_task = asyncio.create_task(
        fake_mod.run_agent(
            uri,
            device_id=DEV_DESKTOP,
            stop=stop,
            heartbeat_s=60.0,
            workspace_ids=frozenset(),
            agents=frozenset({"cursor"}),
        )
    )

    async with serve(lambda ws: handler(orch, ws), "127.0.0.1", port):
        for _ in range(80):
            await asyncio.sleep(0.1)
            p = orch.devices.get_device(DEV_PORTABLE)
            d = orch.devices.get_device(DEV_DESKTOP)
            if (
                p is not None
                and d is not None
                and dev_agent_capability("cursor") in {c.capability_id for c in p.capabilities.values()}
                and dev_agent_capability("cursor") in {c.capability_id for c in d.capabilities.values()}
            ):
                break
        else:
            check("both fake agents registered", False)

        # ── Workspace registry ───────────────────────────────────────────────
        binding = orch.workspaces.get(WORKSPACE_JARVIS_MAIN)
        check("workspace get", binding is not None and binding.authoritative_device_id == DEV_PORTABLE)
        check(
            "workspace local_path",
            binding is not None and binding.local_path == str(jarvis_root),
        )

        policy_ok = orch.dev_agent_dispatch.build_policy_payload(
            granted=True,
            role="admin",
            user_id="local",
            operations=frozenset({"READ", "WRITE", "EXECUTE"}),
        )

        # ── SCENARIO 1 SUCCESS ───────────────────────────────────────────────
        params_ok = DevAgentRunParams(
            agent="cursor",
            workspace_id=WORKSPACE_JARVIS_MAIN,
            prompt="fix readme",
            timeout_s=30.0,
            mission_dev_id="M1",
            step_id="step-1",
        )
        rec = await orch.dev_agent_dispatch.start_run(params_ok, policy_ok)
        check("run_id distinct request_id", rec.run_id != rec.request_id)
        check("start ACCEPTED/RUNNING", rec.state in (RunState.ACCEPTED, RunState.RUNNING))
        final = await _wait_run_terminal(orch, rec.run_id)
        check("scenario1 COMPLETED", final.get("state") == "COMPLETED", str(final))
        result = (final.get("result") or {}) if isinstance(final.get("result"), dict) else {}
        check("agent_result claim", bool(result.get("agent_result")))
        check("git_diff observation", bool(result.get("git_diff_stat")))
        progress_ev = [e for e in bus_events if e.get("kind") == "device.run.progress"]
        check("progress events", len(progress_ev) >= 1)

        # ── SCENARIO 2 FAILURE ───────────────────────────────────────────────
        params_fail = DevAgentRunParams(
            agent="claude",
            workspace_id=WORKSPACE_JARVIS_MAIN,
            prompt="please fail now",
            timeout_s=30.0,
            mission_dev_id="M1",
            step_id="step-2",
        )
        rec_fail = await orch.dev_agent_dispatch.start_run(params_fail, policy_ok)
        final_fail = await _wait_run_terminal(orch, rec_fail.run_id)
        check("scenario2 FAILED", final_fail.get("state") == "FAILED", str(final_fail))

        # ── SCENARIO 3 CANCEL ────────────────────────────────────────────────
        rec_a = await orch.dev_agent_dispatch.start_run(
            DevAgentRunParams(agent="cursor", workspace_id=WORKSPACE_JARVIS_MAIN, prompt="long task A", timeout_s=60.0),
            policy_ok,
        )
        rec_b = await orch.dev_agent_dispatch.start_run(
            DevAgentRunParams(agent="cursor", workspace_id=WORKSPACE_JARVIS_MAIN, prompt="long task B", timeout_s=60.0),
            policy_ok,
        )
        cancel_reply = await orch.dev_agent_dispatch.cancel_run(rec_a.run_id)
        check("cancel A ok", cancel_reply.get("ok") is True, str(cancel_reply))
        final_a = await _wait_run_terminal(orch, rec_a.run_id)
        check("run A CANCELLED", final_a.get("state") == "CANCELLED", str(final_a))
        final_b = await _wait_run_terminal(orch, rec_b.run_id)
        check("run B COMPLETED", final_b.get("state") == "COMPLETED", str(final_b))

        # ── SCENARIO 4 TIMEOUT ───────────────────────────────────────────────
        rec_to = await orch.dev_agent_dispatch.start_run(
            DevAgentRunParams(
                agent="cursor",
                workspace_id=WORKSPACE_JARVIS_MAIN,
                prompt="timeout_run please wait",
                timeout_s=0.4,
            ),
            policy_ok,
        )
        final_to = await _wait_run_terminal(orch, rec_to.run_id, timeout=3.0)
        check("scenario4 TIMEOUT", final_to.get("state") == "TIMEOUT", str(final_to))

        # ── SCENARIO 5 WORKSPACE ABSENT ──────────────────────────────────────
        try:
            await orch.dev_agent_dispatch.start_run(
                DevAgentRunParams(agent="cursor", workspace_id="missing-ws", prompt="x"),
                policy_ok,
            )
            check("workspace missing raises", False)
        except DevAgentDispatchError as exc:
            check("workspace missing", exc.code == "workspace_not_found")

        # ── SCENARIO 6 DEVICE OFFLINE ────────────────────────────────────────
        portable_dev = orch.devices.get_device(DEV_PORTABLE)
        assert portable_dev is not None
        portable_dev.online = False
        try:
            await orch.dev_agent_dispatch.start_run(
                DevAgentRunParams(agent="cursor", workspace_id=WORKSPACE_JARVIS_MAIN, prompt="x"),
                policy_ok,
            )
            check("device offline raises", False)
        except DevAgentDispatchError as exc:
            check("device offline", exc.code == "workspace_device_offline")
        portable_dev.online = True

        # ── SCENARIO 7 CAPABILITY ABSENT (claude on desktop) ────────────────
        route_claude_desktop = orch.router.resolve_dev_agent_device(
            RouteContext(),
            agent="claude",
            workspace=WorkspaceBinding(
                workspace_id=WORKSPACE_JARVIS_MAIN,
                repo_name=jarvis_root.name,
                authoritative_device_id=DEV_DESKTOP,
                local_path=str(jarvis_root),
            ),
        )
        check(
            "claude missing on desktop",
            route_claude_desktop.rejected
            and route_claude_desktop.reason == "dev_agent_capability_missing",
            route_claude_desktop.reason,
        )

        # ── SCENARIO 8 POLICY REFUSED ────────────────────────────────────────
        policy_denied = orch.dev_agent_dispatch.build_policy_payload(
            granted=False,
            role="admin",
            user_id="local",
            operations=frozenset({"READ"}),
        )
        try:
            await orch.dev_agent_dispatch.start_run(
                DevAgentRunParams(agent="cursor", workspace_id=WORKSPACE_JARVIS_MAIN, prompt="x"),
                policy_denied,
            )
            check("policy refused raises", False)
        except DevAgentDispatchError as exc:
            check("policy refused", exc.code == "policy_denied")

        # ── SCENARIO multi-device authoritative ──────────────────────────────
        route_ok = orch.router.resolve_dev_agent_device(
            RouteContext(),
            agent="cursor",
            workspace=binding,
        )
        check("route portable", route_ok.device_id == DEV_PORTABLE, route_ok.reason)

        portable_dev.online = False
        route_off = orch.router.resolve_dev_agent_device(
            RouteContext(),
            agent="cursor",
            workspace=binding,
        )
        check(
            "no fallback desktop",
            route_off.rejected and route_off.reason == "workspace_device_offline",
            route_off.reason,
        )
        portable_dev.online = True

        # ── SCENARIO multi-agent contract ────────────────────────────────────
        r1 = await orch.dev_agent_dispatch.start_run(
            DevAgentRunParams(
                agent="claude",
                workspace_id=WORKSPACE_JARVIS_MAIN,
                prompt="step claude",
                mission_dev_id="M2",
                step_id="s1",
            ),
            policy_ok,
        )
        r2 = await orch.dev_agent_dispatch.start_run(
            DevAgentRunParams(
                agent="cursor",
                workspace_id=WORKSPACE_JARVIS_MAIN,
                prompt="step cursor",
                mission_dev_id="M2",
                step_id="s2",
            ),
            policy_ok,
        )
        check("multi-agent run_ids distinct", r1.run_id != r2.run_id)
        check("multi-agent agents", r1.agent == "claude" and r2.agent == "cursor")
        await _wait_run_terminal(orch, r1.run_id)
        await _wait_run_terminal(orch, r2.run_id)

        # ── cancel unknown run ───────────────────────────────────────────────
        unknown_cancel = await orch.dev_agent_dispatch.cancel_run("00000000-0000-0000-0000-000000000000")
        check("cancel unknown", unknown_cancel.get("ok") is False)

        # ── P4 app.launch regression ─────────────────────────────────────────
        cap = CAPABILITIES["cursor"]
        check("core.cursor Owner.DEVICE", cap.owner is Owner.DEVICE)
        check("provider SATELLITE", provider_for_intent("core.cursor") is CapabilityProvider.SATELLITE)

        class _WsCapture:
            messages: list[dict[str, Any]] = []

            async def send(self, raw: str) -> None:
                self.messages.append(json.loads(raw))

        ws_cap = _WsCapture()
        broadcast_events: list[dict[str, Any]] = []

        async def _capture_broadcast(ev: dict[str, Any]) -> None:
            broadcast_events.append(ev)

        orch.broadcast = _capture_broadcast  # type: ignore[method-assign]
        matched = match_intent("ouvre cursor")
        check("match ouvre cursor", matched is not None)
        assert matched is not None
        await orch._open_intent(ws_cap, matched, "ouvre cursor")
        sr = [m for m in ws_cap.messages if m.get("type") == "surface_result"]
        check("P4 surface_result ok", sr and sr[-1].get("ok") is True and sr[-1].get("executed") is True)
        te = [m for m in broadcast_events if m.get("type") == "tool_event"]
        check("P4 tool_event", len(te) >= 2)

    stop.set()
    portable_task.cancel()
    desktop_task.cancel()
    with contextlib.suppress(asyncio.CancelledError, ConnectionError):
        await portable_task
        await desktop_task


def main() -> int:
    print("P5 — dev.agent.run + Workspace Registry (fake_agent)")
    asyncio.run(_run_all())
    print("\nALL PASS — P5 dev agent gate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
