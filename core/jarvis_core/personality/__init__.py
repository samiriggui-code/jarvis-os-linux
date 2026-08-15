"""Personality JARVIS V1 — résolution centrale identité / registre / humour."""
from __future__ import annotations

from .entities import (
    ENTITIES,
    CLAUDE_ELEVENLABS_VOICE_ID,
    CURSOR_ELEVENLABS_VOICE_ID,
    HERMES_ELEVENLABS_VOICE_ID,
    JARVIS_ELEVENLABS_VOICE_ID,
    EntityProfile,
    entity_status_payload,
    get_entity,
    resolve_elevenlabs_voice_id,
)
from .voice_map import resolve_voice_asset, resolve_voicebox_profile
from .resolver import (
    PersonalityRequest,
    PersonalityResolution,
    build_system_message,
    resolve_personality,
)
from .types import (
    BackendAvailability,
    HumorLevel,
    LLMCallMode,
    SpeakerEntity,
    TechnicalLevel,
)

__all__ = [
    "BackendAvailability",
    "CLAUDE_ELEVENLABS_VOICE_ID",
    "CURSOR_ELEVENLABS_VOICE_ID",
    "ENTITIES",
    "HERMES_ELEVENLABS_VOICE_ID",
    "JARVIS_ELEVENLABS_VOICE_ID",
    "EntityProfile",
    "HumorLevel",
    "LLMCallMode",
    "PersonalityRequest",
    "PersonalityResolution",
    "SpeakerEntity",
    "TechnicalLevel",
    "build_system_message",
    "entity_status_payload",
    "get_entity",
    "resolve_elevenlabs_voice_id",
    "resolve_personality",
    "resolve_voice_asset",
    "resolve_voicebox_profile",
]
