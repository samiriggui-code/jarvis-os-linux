#!/usr/bin/env python3
"""Agent factice JARVIS — gate CI / contrat P4 + P5 sans processus réel.

Simule ``app.launch`` (P4) et ``dev.agent.run`` (P5).
"""

from __future__ import annotations

import argparse
import asyncio
import socket
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agent_lib import (
    DEFAULT_WS,
    SoftwareCapability,
    build_capabilities,
    execute_result,
    load_or_create_device_id,
    run_agent_session,
)
from dev_agent_fake import CAPABILITY_DEV_AGENT_RUN, DevAgentRunSimulator

try:
    import websockets
except ImportError:
    print("pip install websockets", file=sys.stderr)
    raise SystemExit(1)

DATA_DIR = ROOT / "data"
DEVICE_ID_FILE = DATA_DIR / "device_id_fake"
AGENT_VERSION = "0.1.0-fake"
RUNTIME_KIND = "fake_agent"
DEFAULT_FAKE_APPS = ("cursor",)


def _merge_capabilities(
    device_id: str,
    apps: tuple[str, ...],
    dev_sim: DevAgentRunSimulator | None,
) -> dict[str, Any]:
    base = build_capabilities(device_id, [
        SoftwareCapability(app_id=aid, display_name=f"{aid} (fake)")
        for aid in apps
    ])
    if dev_sim is None:
        return base
    caps = list(base.get("capabilities") or [])
    caps.extend(dev_sim.dev_capabilities())
    return {**base, "capabilities": caps}


async def _handle_execute(
    ws: websockets.WebSocketClientProtocol,
    data: dict,
    allowed: set[str],
    *,
    dev_sim: DevAgentRunSimulator | None = None,
) -> dict:
    started = time.monotonic()
    request_id = str(data.get("request_id") or "")
    device_id = str(data.get("device_id") or "")
    cap_id = str(data.get("capability_id") or "app.launch")
    app_id = str((data.get("params") or {}).get("app_id") or "").strip().lower()
    policy = data.get("policy") if isinstance(data.get("policy"), dict) else {}

    if cap_id == CAPABILITY_DEV_AGENT_RUN:
        if dev_sim is None:
            return execute_result(
                request_id=request_id,
                device_id=device_id,
                ok=False,
                started=started,
                capability_id=cap_id,
                error_code="dev_agent_unavailable",
                error="dev.agent.run non configuré sur ce fake agent",
            )
        return await dev_sim.handle_start(ws, data, allowed)

    if not policy.get("granted", False):
        return execute_result(
            request_id=request_id,
            device_id=device_id,
            ok=False,
            started=started,
            error_code="policy_denied",
            error="policy.granted=false",
        )

    if app_id not in allowed:
        return execute_result(
            request_id=request_id,
            device_id=device_id,
            ok=False,
            started=started,
            error_code="app_not_allowed",
            error=f"app_id hors allowlist : {app_id}",
        )

    return execute_result(
        request_id=request_id,
        device_id=device_id,
        ok=True,
        started=started,
        summary=f"{app_id} lancé (fake)",
        result={"app_id": app_id, "pid": 0, "simulated": True},
    )


async def run_agent(
    uri: str,
    *,
    device_id: str | None = None,
    fake_apps: tuple[str, ...] = DEFAULT_FAKE_APPS,
    heartbeat_s: float = 30.0,
    stop: asyncio.Event | None = None,
    dev_sim: DevAgentRunSimulator | None = None,
    workspace_ids: frozenset[str] | None = None,
    agents: frozenset[str] | None = None,
) -> None:
    device_id = device_id or load_or_create_device_id(DEVICE_ID_FILE, prefix="fake-agent")
    if dev_sim is None and (workspace_ids or agents):
        dev_sim = DevAgentRunSimulator(
            device_id=device_id,
            workspace_ids=workspace_ids or frozenset(),
            agents=agents or frozenset({"cursor", "claude"}),
        )

    def _caps_factory() -> tuple[list[dict[str, Any]], bool]:
        payload = _merge_capabilities(device_id, fake_apps, dev_sim)
        return list(payload.get("capabilities") or []), False

    extra_handlers: dict[str, Any] = {}
    if dev_sim is not None:
        extra_handlers["device.run.cancel"] = dev_sim.handle_cancel
        extra_handlers["device.run.status"] = dev_sim.handle_status

    async def _execute(ws: Any, data: dict, allowed: set[str]) -> dict:
        return await _handle_execute(ws, data, allowed, dev_sim=dev_sim)

    await run_agent_session(
        uri,
        device_id=device_id,
        runtime_kind=RUNTIME_KIND,
        label=f"{socket.gethostname()} (fake agent)",
        agent_version=AGENT_VERSION,
        apps=[SoftwareCapability(app_id=aid, display_name=f"{aid} (fake)") for aid in fake_apps],
        handle_execute=_execute,
        capabilities_factory=_caps_factory,
        extra_handlers=extra_handlers or None,
        heartbeat_s=heartbeat_s,
        stop=stop,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="JARVIS fake device agent (P4/P5)")
    parser.add_argument("--url", default=DEFAULT_WS, help="Core WebSocket URL")
    parser.add_argument("--device-id", default="", help="Override stable device_id")
    args = parser.parse_args()
    device_id = args.device_id.strip() or None

    async def _main() -> None:
        stop = asyncio.Event()
        try:
            await run_agent(args.url, device_id=device_id, stop=stop)
        except KeyboardInterrupt:
            stop.set()

    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
