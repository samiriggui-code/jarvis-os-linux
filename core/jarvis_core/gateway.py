"""Gateway produit : Core déterministe + chat via Provider Manager."""

from __future__ import annotations

import os

HASS_DEFAULT_URL = "http://127.0.0.1:8123"

# Intentions physiques / déterministes — toujours exécutées par le Core.
CORE_ONLY_INTENTS: frozenset[str] = frozenset({
    "home.control",
    "media.streaming",
    "media.pause",
    "media.video",
    "home.camera_list",
    "home.camera_view",
    "home.camera_snapshot",
})


def chat_provider_mode() -> str:
    """Le chat libre passe exclusivement par ``AIProviderManager``."""
    return "llm"


def chat_uses_llm_fallback() -> bool:
    """Compatibilité : le Provider Manager est désormais le chemin nominal."""
    return True


def semantic_routing_enabled() -> bool:
    """Routage sémantique LLM avant chat libre — ON sauf opt-out."""
    return (os.environ.get("JARVIS_SEMANTIC_ROUTING") or "1").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def hass_default_url() -> str:
    """URL HA cible — NUC local."""
    return (os.environ.get("JARVIS_HASS_URL") or HASS_DEFAULT_URL).strip().rstrip("/")


def assert_prod_hermes_boundary() -> list[str]:
    """Compatibilité du gate historique : vérifie les propriétaires Core."""
    from .capabilities import CAPABILITIES, Owner

    violations: list[str] = []
    for cap in CAPABILITIES.values():
        if cap.intent in CORE_ONLY_INTENTS:
            if cap.owner is not Owner.CORE:
                violations.append(f"{cap.intent} owner={cap.owner} (must be CORE)")
            if cap.toolset:
                violations.append(f"{cap.intent} must not have toolset")
    return violations
