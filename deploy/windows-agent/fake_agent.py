#!/usr/bin/env python3
"""Agent factice JARVIS — gate CI / contrat P4 sans lancer de processus.

Simule ``app.launch`` pour ``cursor`` (ou apps passées en argument).
"""

from __future__ import annotations

import argparse
import asyncio
import socket
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agent_lib import (
    DEFAULT_WS,
    SoftwareCapability,
    execute_result,
    load_or_create_device_id,
    run_agent_session,
)

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


async def _handle_execute(
    ws: websockets.WebSocketClientProtocol,
    data: dict,
    allowed: set[str],
) -> dict:
    started = time.monotonic()
    request_id = str(data.get("request_id") or "")
    device_id = str(data.get("device_id") or "")
    app_id = str((data.get("params") or {}).get("app_id") or "").strip().lower()
    policy = data.get("policy") if isinstance(data.get("policy"), dict) else {}

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
) -> None:
    device_id = device_id or load_or_create_device_id(DEVICE_ID_FILE, prefix="fake-agent")
    apps = [
        SoftwareCapability(app_id=aid, display_name=f"{aid} (fake)")
        for aid in fake_apps
    ]
    await run_agent_session(
        uri,
        device_id=device_id,
        runtime_kind=RUNTIME_KIND,
        label=f"{socket.gethostname()} (fake agent)",
        agent_version=AGENT_VERSION,
        apps=apps,
        handle_execute=_handle_execute,
        heartbeat_s=heartbeat_s,
        stop=stop,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="JARVIS fake device agent (P4)")
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
