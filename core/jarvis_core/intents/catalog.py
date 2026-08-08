"""Catalogue intents — alias documentaire (Phase 6).

Le registre vivant reste ``capabilities.py`` (IntentCapability + triggers).
Ce module expose le même catalogue pour la segmentation routing/executors.
"""
from __future__ import annotations

from ..capabilities import (
    CAPABILITIES,
    Capability,
    Display,
    IntentCapability,
    Owner,
    allows,
    for_app,
    for_intent,
    match_intent,
    toolsets_for,
)

__all__ = [
    "CAPABILITIES",
    "Capability",
    "Display",
    "IntentCapability",
    "Owner",
    "allows",
    "for_app",
    "for_intent",
    "match_intent",
    "toolsets_for",
]
