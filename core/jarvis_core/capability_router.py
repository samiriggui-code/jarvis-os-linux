"""Compat shim — préférer ``jarvis_core.routing`` (Phase 6)."""
from __future__ import annotations

from .routing import (
    INTENT_HOST_CAPABILITY,
    CapabilityRouter,
    RouteContext,
    RouteResult,
)

__all__ = [
    "INTENT_HOST_CAPABILITY",
    "CapabilityRouter",
    "RouteContext",
    "RouteResult",
]
