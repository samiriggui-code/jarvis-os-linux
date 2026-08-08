"""Helpers Core — inventaire logiciel des devices (P4+)."""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from .devices import Device, DeviceRegistry, HostCapability


def _fold(text: str) -> str:
    normalized = unicodedata.normalize("NFD", str(text or "").lower().strip())
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


def list_software_caps(device: Device | None) -> list[dict[str, Any]]:
    if device is None:
        return []
    out: list[dict[str, Any]] = []
    for cap in device.capabilities.values():
        if not cap.capability_id.startswith("app.software."):
            continue
        app_id = cap.capability_id[len("app.software.") :]
        meta = cap.metadata if isinstance(cap.metadata, dict) else {}
        out.append(
            {
                "app_id": app_id,
                "capability_id": cap.capability_id,
                "launchable": cap.value is not False,
                "display_name": str(meta.get("display_name") or app_id),
                "publisher": str(meta.get("publisher") or ""),
                "exe": str(meta.get("exe") or ""),
            }
        )
    out.sort(key=lambda r: (not r["launchable"], r["display_name"].lower()))
    return out


def inventory_stats(device: Device | None) -> dict[str, Any]:
    if device is None:
        return {}
    inv = device.capabilities.get("system.inventory")
    if inv and isinstance(inv.metadata, dict):
        return dict(inv.metadata)
    software = list_software_caps(device)
    launchable = sum(1 for s in software if s.get("launchable"))
    return {"total_apps": len(software), "launchable_apps": launchable}


def match_software_app(
    registry: DeviceRegistry,
    phrase: str,
    *,
    device_id: str | None = None,
    runtime_kinds: tuple[str, ...] = ("windows_agent", "fake_agent"),
) -> tuple[str | None, str | None]:
    """Retourne (device_id, app_id) si une app inventoriée matche la phrase."""
    text = _fold(phrase)
    if not text:
        return None, None

    devices: list[Device] = []
    if device_id:
        dev = registry.get_device(device_id)
        if dev and dev.online:
            devices = [dev]
    else:
        devices = [
            d
            for d in registry.iter_online()
            if d.runtime_kind in runtime_kinds or not d.runtime_kind
        ]

    best: tuple[int, str, str] | None = None
    for dev in devices:
        if dev.runtime_kind and dev.runtime_kind not in runtime_kinds:
            if dev.runtime_kind in ("browser", "web_hud", "web"):
                continue
        for row in list_software_caps(dev):
            if not row.get("launchable"):
                continue
            app_id = str(row["app_id"])
            display = _fold(str(row.get("display_name") or app_id))
            score = 0
            if display and display in text:
                score = 100 + len(display)
            elif app_id.replace("-", " ") in text.replace("-", " "):
                score = 80 + len(app_id)
            else:
                for token in display.split():
                    if len(token) >= 4 and token in text:
                        score = max(score, 40 + len(token))
            if score > 0 and (best is None or score > best[0]):
                best = (score, dev.device_id, app_id)
    if best is None:
        return None, None
    return best[1], best[2]


def planned_host_caps(device: Device | None) -> list[dict[str, Any]]:
    """Caps hôte déclarées mais pas encore actives (shell, fs…)."""
    if device is None:
        return []
    planned_ids = ("shell.execute", "filesystem.browse")
    rows: list[dict[str, Any]] = []
    for cap_id in planned_ids:
        cap = device.capabilities.get(cap_id)
        if cap is None:
            continue
        meta = cap.metadata if isinstance(cap.metadata, dict) else {}
        rows.append(
            {
                "capability_id": cap_id,
                "value": cap.value,
                "status": meta.get("status", "planned"),
                "owner_target": meta.get("owner_target", "device"),
            }
        )
    return rows
