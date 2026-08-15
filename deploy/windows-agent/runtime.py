"""État runtime partagé — agent WS + mini-dashboard tray."""

from __future__ import annotations

import json
import time
from typing import Any

_state: dict[str, Any] = {
    "connected": False,
    "ws_url": "",
    "device_id": "",
    "label": "",
    "since": 0.0,
    "last_error": "",
    "last_disconnect": 0.0,
    "reconnects": 0,
    "messages_sent": 0,
    "bytes_sent": 0,
    "messages_recv": 0,
    "bytes_recv": 0,
    "caps_last_count": 0,
    "caps_last_at": 0.0,
    "heartbeat_at": 0.0,
    "last_action": "",
    "last_action_at": 0.0,
    "metrics": {},
    # Ventilation messages (efficacité sync)
    "sent_by_action": {},
    "recv_by_type": {},
    "recv_noise": 0,  # broadcasts HUD non utiles à l'agent
    "recv_commands": 0,  # device.execute
    "recv_acks": 0,
}


def set_connected(
    *,
    connected: bool,
    ws_url: str = "",
    device_id: str = "",
    label: str = "",
    error: str = "",
) -> None:
    now = time.time()
    was = bool(_state.get("connected"))
    _state["connected"] = connected
    if ws_url:
        _state["ws_url"] = ws_url
    if device_id:
        _state["device_id"] = device_id
    if label:
        _state["label"] = label
    if connected:
        _state["since"] = now
        _state["last_error"] = ""
        if not was and _state.get("last_disconnect"):
            _state["reconnects"] = int(_state.get("reconnects") or 0) + 1
    else:
        _state["last_disconnect"] = now
        if error:
            _state["last_error"] = error


def record_send(payload: str | bytes, *, action: str = "") -> None:
    raw = payload.encode("utf-8") if isinstance(payload, str) else payload
    _state["messages_sent"] = int(_state.get("messages_sent") or 0) + 1
    _state["bytes_sent"] = int(_state.get("bytes_sent") or 0) + len(raw)
    act = action or "unknown"
    bag = _state.setdefault("sent_by_action", {})
    if isinstance(bag, dict):
        bag[act] = int(bag.get(act) or 0) + 1
    if action:
        _state["last_action"] = action
        _state["last_action_at"] = time.time()
        if action == "heartbeat":
            _state["heartbeat_at"] = time.time()
        if action == "capabilities":
            _state["caps_last_at"] = time.time()


def record_recv(payload: str | bytes) -> None:
    raw = payload.encode("utf-8") if isinstance(payload, str) else payload
    _state["messages_recv"] = int(_state.get("messages_recv") or 0) + 1
    _state["bytes_recv"] = int(_state.get("bytes_recv") or 0) + len(raw)
    kind = "other"
    try:
        text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        data = json.loads(text)
        if isinstance(data, dict):
            kind = str(data.get("type") or data.get("action") or "other")
            if data.get("type") == "device.execute":
                _state["recv_commands"] = int(_state.get("recv_commands") or 0) + 1
            elif str(data.get("type") or "").endswith("_ack") or data.get("type") in (
                "device_registered",
                "device_execute_result_ack",
            ):
                _state["recv_acks"] = int(_state.get("recv_acks") or 0) + 1
            elif data.get("type") not in ("device.execute", "device_registered", "pong"):
                # Chat / surface / TTS / etc. — bruit pour un agent machine
                _state["recv_noise"] = int(_state.get("recv_noise") or 0) + 1
    except Exception:
        kind = "binary_or_invalid"
    bag = _state.setdefault("recv_by_type", {})
    if isinstance(bag, dict):
        bag[kind] = int(bag.get(kind) or 0) + 1


def record_caps(count: int) -> None:
    _state["caps_last_count"] = int(count)
    _state["caps_last_at"] = time.time()


def record_metrics(sample: dict[str, Any]) -> None:
    _state["metrics"] = dict(sample or {})


def reset_telemetry() -> None:
    for key in (
        "messages_sent",
        "bytes_sent",
        "messages_recv",
        "bytes_recv",
        "recv_noise",
        "recv_commands",
        "recv_acks",
        "reconnects",
    ):
        _state[key] = 0
    _state["sent_by_action"] = {}
    _state["recv_by_type"] = {}
    _state["last_action"] = ""
    _state["caps_last_count"] = 0


def snapshot() -> dict[str, Any]:
    out = dict(_state)
    since = float(out.get("since") or 0)
    if out.get("connected") and since:
        out["uptime_s"] = max(0, int(time.time() - since))
    else:
        out["uptime_s"] = 0
    # Copies défensives
    out["sent_by_action"] = dict(_state.get("sent_by_action") or {})
    out["recv_by_type"] = dict(_state.get("recv_by_type") or {})
    return out
