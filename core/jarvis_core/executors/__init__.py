"""Core intent executors — mixins segmentés (Phase 6)."""
from __future__ import annotations

from .device import DeviceExecutorsMixin
from .home import HomeExecutorsMixin
from .media import MediaExecutorsMixin
from .surfaces import SurfaceExecutorsMixin
from .system import SystemExecutorsMixin


class IntentExecutorsMixin(
    DeviceExecutorsMixin,
    HomeExecutorsMixin,
    MediaExecutorsMixin,
    SurfaceExecutorsMixin,
    SystemExecutorsMixin,
):
    """Exécutants Core — device / home / media / surfaces / system."""

__all__ = ["IntentExecutorsMixin"]
