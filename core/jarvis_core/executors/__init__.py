"""Core intent executors — mixins segmentés (Phase 6)."""
from __future__ import annotations

from .architecture import ArchitectureExecutorsMixin
from .camera import CameraExecutorsMixin
from .device import DeviceExecutorsMixin
from .home import HomeExecutorsMixin
from .media import MediaExecutorsMixin
from .memory import MemoryExecutorsMixin
from .mission_board import MissionBoardExecutorsMixin
from .surfaces import SurfaceExecutorsMixin
from .system import SystemExecutorsMixin
from .vision import VisionExecutorsMixin
from .web import WebExecutorsMixin


class IntentExecutorsMixin(
    ArchitectureExecutorsMixin,
    CameraExecutorsMixin,
    DeviceExecutorsMixin,
    HomeExecutorsMixin,
    MediaExecutorsMixin,
    MemoryExecutorsMixin,
    MissionBoardExecutorsMixin,
    SurfaceExecutorsMixin,
    SystemExecutorsMixin,
    VisionExecutorsMixin,
    WebExecutorsMixin,
):
    """Exécutants Core — architecture / camera / device / home / media / memory / surfaces / system / web."""

__all__ = ["IntentExecutorsMixin"]
