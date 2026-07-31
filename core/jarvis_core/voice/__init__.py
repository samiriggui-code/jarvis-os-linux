"""Voice Manager — TTS / STT via voicebox (service HTTP séparé).

Voir `README.md` pour le contrat WebSocket et le déploiement.
"""

from __future__ import annotations

from .cache import VoiceCache
from .manager import VoiceManager
from .profiles import VoiceSelection, load_voice_profile, resolve_voice, save_voice_profile
from .wake import WakeWordDetector, WakeWordUnavailable
from .voicebox import (
    DEFAULT_ENGINE,
    ENGINES,
    VoiceboxClient,
    VoiceboxError,
    VoiceboxModelDownloading,
    VoiceboxUnavailable,
)

__all__ = [
    "VoiceCache",
    "WakeWordDetector",
    "WakeWordUnavailable",
    "DEFAULT_ENGINE",
    "ENGINES",
    "VoiceManager",
    "VoiceSelection",
    "VoiceboxClient",
    "VoiceboxError",
    "VoiceboxModelDownloading",
    "VoiceboxUnavailable",
    "load_voice_profile",
    "resolve_voice",
    "save_voice_profile",
]
