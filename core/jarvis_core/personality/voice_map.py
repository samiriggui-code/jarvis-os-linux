"""Mapping speaker_entity → assets voix (décision Samir 2026-08-14).

``speaker_entity`` (identité fonctionnelle) ≠ nom historique du dossier WAV.

    jarvis  → jarvis3   (JARVIS principal)
    claude  → jarvis    (asset historique « jarvis »)
    cursor  → jarvis2
    hermes  → hermes    (+ ElevenLabs HuLbOdhRlvQQN8oPP0AJ)
"""
from __future__ import annotations

import os

from .types import SpeakerEntity

JARVIS_MAIN_ASSET = "jarvis3"
CLAUDE_VOICE_ASSET = "jarvis"
CURSOR_VOICE_ASSET = "jarvis2"
HERMES_VOICE_ASSET = "hermes"

# Presets listener — ``jarvis_soft`` reste réservé à JARVIS → enfant.
CHILD_SOFT_PRESET = "jarvis_soft"
CHILD_SOFT_PROFILE = "jarvis-soft"


def _speaker_key(speaker_entity: str | None) -> str:
    return (speaker_entity or SpeakerEntity.JARVIS.value).strip().lower()


def resolve_voice_asset(speaker_entity: str | None, *, preset: str = "jarvis_fr") -> str:
    """Dossier cache / identifiant logique de voix pour une entité."""
    speaker = _speaker_key(speaker_entity)
    if speaker == SpeakerEntity.JARVIS.value:
        if preset == CHILD_SOFT_PRESET:
            return CHILD_SOFT_PROFILE
        return os.environ.get("JARVIS_VOICEBOX_PROFILE_JARVIS", JARVIS_MAIN_ASSET).strip() or JARVIS_MAIN_ASSET
    mapping = {
        SpeakerEntity.CLAUDE.value: CLAUDE_VOICE_ASSET,
        SpeakerEntity.CURSOR.value: CURSOR_VOICE_ASSET,
        SpeakerEntity.HERMES.value: HERMES_VOICE_ASSET,
    }
    if speaker in mapping:
        from .entities import get_entity

        ent = get_entity(speaker)
        if ent.voicebox_profile_env:
            env = os.environ.get(ent.voicebox_profile_env, "").strip()
            if env:
                return env
        return ent.voicebox_profile_default or ent.voice_cache_folder or mapping[speaker]
    return JARVIS_MAIN_ASSET


def resolve_voicebox_profile(
    speaker_entity: str | None,
    *,
    preset: str = "jarvis_fr",
) -> str:
    """Profil voicebox — même règles que ``resolve_voice_asset``."""
    return resolve_voice_asset(speaker_entity, preset=preset)


def child_soft_applies(speaker_entity: str | None, preset: str) -> bool:
    """``jarvis_soft`` uniquement pour JARVIS parlant à un enfant."""
    return (
        _speaker_key(speaker_entity) == SpeakerEntity.JARVIS.value
        and preset == CHILD_SOFT_PRESET
    )
