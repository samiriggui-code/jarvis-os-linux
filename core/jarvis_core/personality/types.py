"""Types Personality JARVIS — résolution QUI / À QUI / CONTEXTE / REGISTRE."""
from __future__ import annotations

from enum import Enum


class LLMCallMode(str, Enum):
    """Mode d'appel LLM — détermine si la personnalité narrative s'applique."""

    NARRATIVE = "narrative"
    ARCHITECTURE = "architecture"
    DIAGNOSTIC = "diagnostic"
    ALERT = "alert"
    HOME = "home"
    STRUCTURED = "structured"
    COMPOSER = "composer"


class HumorLevel(str, Enum):
    OFF = "off"
    SUBTLE = "subtle"
    NORMAL = "normal"


class SpeakerEntity(str, Enum):
    JARVIS = "jarvis"
    HERMES = "hermes"
    CLAUDE = "claude"
    CURSOR = "cursor"


class BackendAvailability(str, Enum):
    """ENTITY PROFILE EXISTS ≠ BACKEND CONNECTED."""

    CONNECTED = "connected"
    DEFINED = "defined"
    UNAVAILABLE = "unavailable"
    NOT_CONNECTED = "not_connected"


class TechnicalLevel(str, Enum):
    SIMPLE = "simple"
    NORMAL = "normal"
    ADVANCED = "advanced"
