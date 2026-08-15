"""Politique TTS live — sépare prod (ElevenLabs) et expérimental (Voicebox).

``JARVIS_VOICEBOX_TTS`` ne concerne que la synthèse vocale live.
STT / health / profils Voicebox restent disponibles quel que soit le flag.
"""

from __future__ import annotations

import os


def voicebox_tts_enabled() -> bool:
    """Voicebox autorisé pour la synthèse TTS live (défaut prod : non)."""
    raw = os.environ.get("JARVIS_VOICEBOX_TTS", "0").strip().lower()
    return raw in ("1", "true", "yes", "on")
