"""Bibliothèque partagée — protocole WS agent JARVIS (P4)."""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import platform
import socket
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable

try:
    import websockets
except ImportError:
    websockets = None  # type: ignore[assignment]

DEFAULT_WS = os.environ.get("JARVIS_WS_URL", "ws://127.0.0.1:8765")


@dataclass(frozen=True)
class SoftwareCapability:
    app_id: str
    display_name: str
    metadata: dict[str, Any] = field(default_factory=dict)


def machine_fingerprint() -> str:
    raw = "|".join(
        [
            platform.system(),
            platform.release(),
            socket.gethostname().lower(),
            os.environ.get("USERNAME") or os.environ.get("USER") or "",
        ]
    )
    return f"sha256:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def load_or_create_device_id(path: Path, *, prefix: str = "win-agent") -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file():
        stored = path.read_text(encoding="utf-8").strip()
        if stored:
            return stored
    device_id = f"{prefix}-{uuid.uuid4().hex[:12]}"
    path.write_text(device_id, encoding="utf-8")
    return device_id


def build_register(
    device_id: str,
    *,
    runtime_kind: str,
    label: str,
    agent_version: str,
    device_mode: str = "personal",
    bound_user_id: str = "",
) -> dict[str, Any]:
    bound = str(
        bound_user_id or os.environ.get("JARVIS_AGENT_BOUND_USER_ID") or ""
    ).strip()
    return {
        "type": "device",
        "action": "register",
        "device_id": device_id,
        "device_type": "pc_client",
        "runtime_kind": runtime_kind,
        "label": label,
        "device_mode": device_mode,
        "bound_user_id": bound,
        "metadata": {
            "platform": platform.system().lower(),
            "platform_version": platform.version(),
            "hostname": socket.gethostname(),
            "agent_version": agent_version,
            "machine_fingerprint": machine_fingerprint(),
            "session_user": os.environ.get("USERNAME") or os.environ.get("USER") or "",
        },
    }


def build_capabilities(device_id: str, apps: Iterable[SoftwareCapability]) -> dict[str, Any]:
    app_list = list(apps)
    allowed = [a.app_id for a in app_list]
    caps: list[dict[str, Any]] = [
        {
            "capability_id": "app.launch",
            "value": True,
            "metadata": {"allowed_apps": allowed},
        },
    ]
    for app in app_list:
        meta = {"display_name": app.display_name, **dict(app.metadata)}
        caps.append(
            {
                "capability_id": f"app.software.{app.app_id}",
                "value": True,
                "metadata": meta,
            }
        )
    return {
        "type": "device",
        "action": "capabilities",
        "device_id": device_id,
        "capabilities": caps,
    }


def execute_result(
    *,
    request_id: str,
    device_id: str,
    ok: bool,
    started: float,
    capability_id: str = "app.launch",
    summary: str = "",
    error_code: str = "",
    error: str = "",
    result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": "device.execute_result",
        "request_id": request_id,
        "device_id": device_id,
        "ok": ok,
        "capability_id": capability_id,
        "status": "success" if ok else "failed",
        "duration_ms": int((time.monotonic() - started) * 1000),
    }
    if summary:
        payload["summary"] = summary
    if error_code:
        payload["error_code"] = error_code
    if error:
        payload["error"] = error
    if result:
        payload["result"] = result
    return payload


ExecuteHandler = Callable[
    [Any, dict[str, Any], set[str]],
    Awaitable[dict[str, Any]],
]

CapabilitiesFactory = Callable[[], list[dict[str, Any]] | tuple[list[dict[str, Any]], bool]]


async def run_agent_session(
    uri: str,
    *,
    device_id: str,
    runtime_kind: str,
    label: str,
    agent_version: str,
    handle_execute: ExecuteHandler,
    apps: Iterable[SoftwareCapability] | None = None,
    capabilities_factory: CapabilitiesFactory | None = None,
    heartbeat_s: float = 30.0,
    inventory_poll_s: float = 0.0,
    inventory_refresh_s: float = 0.0,
    stop: Any | None = None,
) -> None:
    if websockets is None:
        raise RuntimeError("pip install websockets")

    import asyncio

    stop = stop or asyncio.Event()
    app_list = list(apps or [])

    def _allowed_from_caps(caps: list[dict[str, Any]]) -> set[str]:
        for raw in caps:
            if str(raw.get("capability_id") or "") != "app.launch":
                continue
            meta = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
            allowed_raw = meta.get("allowed_apps")
            if isinstance(allowed_raw, list):
                return {str(x).strip().lower() for x in allowed_raw if str(x).strip()}
        return {a.app_id for a in app_list}

    def _call_factory() -> tuple[list[dict[str, Any]], bool]:
        if capabilities_factory is None:
            caps = build_capabilities(device_id, app_list)
            return caps.get("capabilities", []) if isinstance(caps, dict) else [], True
        raw = capabilities_factory()
        if isinstance(raw, tuple):
            caps, changed = raw
            return list(caps), bool(changed)
        return list(raw), True

    def _capabilities_message(caps: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "type": "device",
            "action": "capabilities",
            "device_id": device_id,
            "capabilities": caps,
        }

    async def _send_capabilities(ws_conn: Any, caps: list[dict[str, Any]]) -> set[str]:
        await ws_conn.send(json.dumps(_capabilities_message(caps)))
        return _allowed_from_caps(caps)

    async with websockets.connect(uri, open_timeout=10, max_size=1024 * 1024) as ws:
        from runtime import set_connected

        await ws.send(json.dumps(build_register(
            device_id,
            runtime_kind=runtime_kind,
            label=label,
            agent_version=agent_version,
        )))

        registered = False
        deadline = time.monotonic() + 5.0
        while not registered and time.monotonic() < deadline and not stop.is_set():
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict) and data.get("type") == "device_registered" and data.get("ok"):
                registered = True

        caps, _ = _call_factory()
        allowed = await _send_capabilities(ws, caps)
        set_connected(connected=True, ws_url=uri, device_id=device_id, label=label)

        poll_s = inventory_poll_s or inventory_refresh_s

        async def _heartbeat() -> None:
            while not stop.is_set():
                await asyncio.sleep(heartbeat_s)
                if stop.is_set():
                    break
                try:
                    await ws.send(
                        json.dumps(
                            {
                                "type": "device",
                                "action": "heartbeat",
                                "device_id": device_id,
                                "timestamp": time.time(),
                            }
                        )
                    )
                except Exception:
                    break

        async def _inventory_poll_loop() -> None:
            nonlocal allowed
            if poll_s <= 0 or capabilities_factory is None:
                return
            while not stop.is_set():
                await asyncio.sleep(poll_s)
                if stop.is_set():
                    break
                try:
                    caps, changed = _call_factory()
                    if changed:
                        allowed = await _send_capabilities(ws, caps)
                except Exception:
                    break

        hb_task = asyncio.create_task(_heartbeat())
        inv_task = asyncio.create_task(_inventory_poll_loop())
        try:
            async for raw in ws:
                if stop.is_set():
                    break
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(data, dict):
                    continue
                if data.get("type") != "device.execute":
                    continue
                reply = await handle_execute(ws, data, allowed)
                await ws.send(json.dumps(reply))
        finally:
            from runtime import set_connected

            set_connected(connected=False, ws_url=uri, device_id=device_id, label=label)
            stop.set()
            hb_task.cancel()
            inv_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await hb_task
                await inv_task
