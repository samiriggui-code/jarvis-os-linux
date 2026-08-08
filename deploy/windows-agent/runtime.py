"""État runtime partagé — agent WS + panneau config local."""

from __future__ import annotations

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
    else:
        _state["last_disconnect"] = now
        if error:
            _state["last_error"] = error


def snapshot() -> dict[str, Any]:
    return dict(_state)
