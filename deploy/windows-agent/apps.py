"""Lancement apps — délègue à l'inventaire Windows (P4+)."""

from __future__ import annotations

from typing import Any

from agent_lib import SoftwareCapability
from inventory import AppLaunchError

__all__ = ["AppLaunchError", "discover_installed", "launch"]


def discover_installed() -> list[SoftwareCapability]:
    from inventory import cached_apps, refresh_cache

    refresh_cache()
    return [app.to_software_capability() for app in cached_apps()]


def launch(app_id: str) -> dict[str, Any]:
    from inventory import launch as inv_launch

    return inv_launch(app_id)
