"""Source de vérité pour la disponibilité d'une capacité (Phase 6)."""
from __future__ import annotations

from enum import Enum


class CapabilityProvider(str, Enum):
    """Qui fournit la capacité matérielle / d'exécution."""

    CORE = "core"
    """In-process sur le NUC — adaptateur local (HA, Plex, vision navigateur)."""

    SATELLITE = "satellite"
    """Un appareil du DeviceRegistry doit annoncer la HostCapability."""

    EXTERNAL = "external"
    """Agent distant (Hermes) — pas de host gate satellite."""


# Intent → provider explicite. Absent = pas de contrainte host.
INTENT_CAPABILITY_PROVIDER: dict[str, CapabilityProvider] = {
    "home.control": CapabilityProvider.CORE,
    "core.holomat": CapabilityProvider.CORE,
    "media.video": CapabilityProvider.CORE,
    "media.pause": CapabilityProvider.CORE,
    "media.streaming": CapabilityProvider.CORE,
    "core.cursor": CapabilityProvider.SATELLITE,
    "device.app_launch": CapabilityProvider.SATELLITE,
}


def provider_for_intent(intent: str) -> CapabilityProvider | None:
    return INTENT_CAPABILITY_PROVIDER.get(intent)
