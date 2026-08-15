"""Foundation multi-entity — identité, voix, disponibilité backend.

Règle anti-faux-agent :
  ENTITY DEFINED ≠ BACKEND CONNECTED ≠ RESPONSE RECEIVED.

Mapping voix (décision Samir, assets existants — ne pas réattribuer) :
  speaker jarvis  → jarvis3   (JARVIS principal)
  speaker claude  → jarvis    (nom historique asset)
  speaker cursor  → jarvis2
  speaker hermes  → hermes + ElevenLabs HuLbOdhRlvQQN8oPP0AJ
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from .types import BackendAvailability, SpeakerEntity
from .voice_map import (
    CLAUDE_VOICE_ASSET,
    CURSOR_VOICE_ASSET,
    HERMES_VOICE_ASSET,
    JARVIS_MAIN_ASSET,
)

# ElevenLabs — IDs source manifestes cache NUC (generate_voice_cache.py).
JARVIS_ELEVENLABS_VOICE_ID = "HhLkLX9WkAwlzDXzuHzd"
CLAUDE_ELEVENLABS_VOICE_ID = "F42eFqrXBZYrTDYwcHo0"  # cache/jarvis/manifest.json
CURSOR_ELEVENLABS_VOICE_ID = "Z5gdl1qPL2yS8NNiW921"  # cache/jarvis2/manifest.json
HERMES_ELEVENLABS_VOICE_ID = "HuLbOdhRlvQQN8oPP0AJ"


@dataclass(frozen=True)
class EntityProfile:
    entity_id: SpeakerEntity
    display_name: str
    role: str
    voice_cache_folder: str | None
    voicebox_profile_env: str | None = None
    voicebox_profile_default: str | None = None
    elevenlabs_voice_id: str | None = None
    elevenlabs_voice_id_env: str | None = None
    backend: BackendAvailability = BackendAvailability.NOT_CONNECTED
    can_speak: bool = False
    notes: str = ""


# Registre minimal — étendre sans casser resolve_voice() utilisateur.
ENTITIES: dict[SpeakerEntity, EntityProfile] = {
    SpeakerEntity.JARVIS: EntityProfile(
        entity_id=SpeakerEntity.JARVIS,
        display_name="JARVIS",
        role="majordome / orchestrateur",
        voice_cache_folder=JARVIS_MAIN_ASSET,
        voicebox_profile_env="JARVIS_VOICEBOX_PROFILE_JARVIS",
        voicebox_profile_default=JARVIS_MAIN_ASSET,
        elevenlabs_voice_id=JARVIS_ELEVENLABS_VOICE_ID,
        elevenlabs_voice_id_env="JARVIS_ELEVENLABS_VOICE_JARVIS",
        backend=BackendAvailability.CONNECTED,
        can_speak=True,
    ),
    SpeakerEntity.HERMES: EntityProfile(
        entity_id=SpeakerEntity.HERMES,
        display_name="Hermes",
        role="analyse / investigation / outils",
        voice_cache_folder=HERMES_VOICE_ASSET,
        voicebox_profile_env="JARVIS_VOICEBOX_PROFILE_HERMES",
        voicebox_profile_default=HERMES_VOICE_ASSET,
        elevenlabs_voice_id=HERMES_ELEVENLABS_VOICE_ID,
        elevenlabs_voice_id_env="JARVIS_ELEVENLABS_VOICE_HERMES",
        backend=BackendAvailability.CONNECTED,
        can_speak=True,
        notes="Runtime HermesBridge + SOUL.md ; voix ElevenLabs branchée.",
    ),
    SpeakerEntity.CLAUDE: EntityProfile(
        entity_id=SpeakerEntity.CLAUDE,
        display_name="Claude",
        role="analyse / architecture / review",
        voice_cache_folder=CLAUDE_VOICE_ASSET,
        voicebox_profile_env="JARVIS_VOICEBOX_PROFILE_CLAUDE",
        voicebox_profile_default=CLAUDE_VOICE_ASSET,
        elevenlabs_voice_id=CLAUDE_ELEVENLABS_VOICE_ID,
        elevenlabs_voice_id_env="JARVIS_ELEVENLABS_VOICE_CLAUDE",
        backend=BackendAvailability.NOT_CONNECTED,
        can_speak=False,
        notes="Mission DEV — backend à brancher (Claude Code / API).",
    ),
    SpeakerEntity.CURSOR: EntityProfile(
        entity_id=SpeakerEntity.CURSOR,
        display_name="Cursor",
        role="code / repo / implémentation",
        voice_cache_folder=CURSOR_VOICE_ASSET,
        voicebox_profile_env="JARVIS_VOICEBOX_PROFILE_CURSOR",
        voicebox_profile_default=CURSOR_VOICE_ASSET,
        elevenlabs_voice_id=CURSOR_ELEVENLABS_VOICE_ID,
        elevenlabs_voice_id_env="JARVIS_ELEVENLABS_VOICE_CURSOR",
        backend=BackendAvailability.NOT_CONNECTED,
        can_speak=False,
        notes="Mission DEV — backend à brancher (Cursor CLI agent).",
    ),
}


def get_entity(entity_id: SpeakerEntity | str) -> EntityProfile:
    if isinstance(entity_id, SpeakerEntity):
        key = entity_id
    else:
        key = SpeakerEntity(str(entity_id).lower())
    return ENTITIES[key]


def resolve_elevenlabs_voice_id(entity_id: SpeakerEntity | str | None) -> str | None:
    """Voice_id ElevenLabs pour une entité parlante — jamais de cross-voice.

    Entité inconnue ou sans ID dédié → ``None`` (caller : ``tts_unavailable_for_entity``).
    """
    if entity_id is None:
        return None
    if isinstance(entity_id, SpeakerEntity):
        key = entity_id
    else:
        raw = str(entity_id).strip().lower()
        if not raw:
            return None
        try:
            key = SpeakerEntity(raw)
        except ValueError:
            return None
    ent = get_entity(key)
    if ent.elevenlabs_voice_id_env:
        env = os.environ.get(ent.elevenlabs_voice_id_env, "").strip()
        if env:
            return env
    return ent.elevenlabs_voice_id


def entity_status_payload() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for e in ENTITIES.values():
        out.append(
            {
                "entity_id": e.entity_id.value,
                "display_name": e.display_name,
                "role": e.role,
                "voice_cache_folder": e.voice_cache_folder,
                "elevenlabs_voice_id": e.elevenlabs_voice_id,
                "backend": e.backend.value,
                "can_speak": e.can_speak,
                "identity_defined": True,
                "personality_defined": e.entity_id
                in (
                    SpeakerEntity.JARVIS,
                    SpeakerEntity.HERMES,
                    SpeakerEntity.CLAUDE,
                    SpeakerEntity.CURSOR,
                ),
                "voice_mapped": (
                    e.entity_id == SpeakerEntity.JARVIS
                    or e.voice_cache_folder is not None
                    or e.elevenlabs_voice_id is not None
                ),
                "notes": e.notes,
            }
        )
    return out
