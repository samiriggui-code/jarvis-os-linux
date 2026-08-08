"""Intent routing — CapabilityRouter + host gate (Phase 6)."""
from .host_gate import resolve_execution_host
from .provider import CapabilityProvider, provider_for_intent
from .router import (
    INTENT_HOST_CAPABILITY,
    CapabilityRouter,
    RouteContext,
    RouteResult,
)

__all__ = [
    "CapabilityProvider",
    "CapabilityRouter",
    "INTENT_HOST_CAPABILITY",
    "RouteContext",
    "RouteResult",
    "provider_for_intent",
    "resolve_execution_host",
]
