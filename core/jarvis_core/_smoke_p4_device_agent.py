"""Smoke P4 — circuit Device Manager + fake agent (E2E WS).

    python -m jarvis_core._smoke_p4_device_agent

Gate :
    Intent → Policy → Router → DeviceDispatch → WS → Fake Agent
      → device.execute_result → tool_event
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import sys
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
FAKE_AGENT = ROOT.parent / "deploy" / "windows-agent" / "fake_agent.py"


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


class _WsCapture:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def send(self, raw: str) -> None:
        self.messages.append(json.loads(raw))


async def _run_e2e() -> None:
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
    from jarvis_core.policy import Decision
    from jarvis_core.routing.provider import CapabilityProvider, provider_for_intent
    from jarvis_core.routing.router import RouteContext

    port = 18765
    uri = f"ws://127.0.0.1:{port}"
    device_id = "fake-agent-smoke-p4"

    orch = Orchestrator()
    orch.policy.evaluate = lambda **kwargs: Decision(allowed=True, needs_confirmation=False)  # type: ignore[method-assign]
    orch.speak = AsyncMock(return_value={"type": "tts_skipped"})  # type: ignore[method-assign]
    orch.say = AsyncMock(return_value=None)  # type: ignore[method-assign]

    broadcast_events: list[dict[str, Any]] = []

    async def _capture_broadcast(ev: dict[str, Any]) -> None:
        broadcast_events.append(ev)

    orch.broadcast = _capture_broadcast  # type: ignore[method-assign]

    stop = asyncio.Event()
    agent_task = asyncio.create_task(
        fake_mod.run_agent(uri, device_id=device_id, stop=stop, heartbeat_s=60.0)
    )

    async with serve(lambda ws: handler(orch, ws), "127.0.0.1", port):
        for _ in range(50):
            await asyncio.sleep(0.1)
            dev = orch.devices.get_device(device_id)
            if dev is not None and "app.launch" in {c.capability_id for c in dev.capabilities.values()}:
                break
        else:
            if agent_task.done():
                exc = agent_task.exception()
                check("agent task alive", False, str(exc))
            check("fake agent registered", False, device_id)

        # ── Registre + router offline ────────────────────────────────────────
        cap = CAPABILITIES["cursor"]
        check("core.cursor Owner.DEVICE", cap.owner is Owner.DEVICE)
        check("core.cursor available", cap.available)
        check("provider SATELLITE", provider_for_intent("core.cursor") is CapabilityProvider.SATELLITE)

        dev = orch.devices.get_device(device_id)
        check("fake agent registered", dev is not None and dev.online is True, device_id)
        assert dev is not None
        check("runtime_kind fake_agent", dev.runtime_kind == "fake_agent")
        caps = {c.capability_id: c for c in dev.capabilities.values()}
        check("app.launch", "app.launch" in caps)
        check("app.software.cursor", "app.software.cursor" in caps)

        reg = orch.router
        route = reg.resolve_launch_device(RouteContext(), "cursor")
        check("resolve_launch_device", route.device_id == device_id, route.reason)

        check("ws_for_device", orch.connections.ws_for_device(device_id) is not None)

        # ── Circuit intent complet ───────────────────────────────────────────
        matched = match_intent("ouvre cursor")
        check("match ouvre cursor", matched is not None and matched.intent == "core.cursor")
        assert matched is not None

        ws = _WsCapture()
        broadcast_events.clear()
        await orch._open_intent(ws, matched, "ouvre cursor")

        sr = [m for m in ws.messages if m.get("type") == "surface_result"]
        check("surface_result ok", sr and sr[-1].get("ok") is True and sr[-1].get("executed") is True)
        if sr:
            route_meta = sr[-1].get("route") or {}
            check(
                "route host_device_id",
                route_meta.get("host_device_id") == device_id,
                str(route_meta),
            )

        te = [m for m in broadcast_events if m.get("type") == "tool_event"]
        check("tool_event started+completed", len(te) >= 2)
        stages = [m.get("stage") for m in te]
        check("tool_event completed", "completed" in stages)
        completed = [m for m in te if m.get("stage") == "completed"]
        if completed:
            ev = completed[-1]
            check("tool owner device", ev.get("owner") == "device")
            check("tool device_id", ev.get("device_id") == device_id)

        result = sr[-1].get("result") if sr else {}
        if isinstance(result, dict):
            check("result app_id cursor", result.get("app_id") == "cursor")
            check("result ok", result.get("ok") is True)

    stop.set()
    agent_task.cancel()
    with contextlib.suppress(asyncio.CancelledError, ConnectionError):
        await agent_task


def main() -> int:
    print("P4 — Device Manager + fake agent (E2E)")
    asyncio.run(_run_e2e())
    print("\nALL PASS — P4 device agent gate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
