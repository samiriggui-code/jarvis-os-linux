"""Voix par utilisateur — `core/data/users/<id>/voice_profile`.

Le HUD ne choisit pas un moteur, il choisit un preset d'expérience
(`locale.voicePreset` : `jarvis_fr` / `jarvis_en` / `jarvis_soft`, cf.
`hud/src/app/bridge/hudContracts.ts` — « Provider derrière jarvis-voice, le HUD
ne choisit pas »). Ce module traduit ce preset en profil voicebox concret.

Le mapping par défaut vient de l'env pour rester déployable sans toucher au
code :

    JARVIS_VOICEBOX_PROFILE_FR    (défaut « jarvis-fr »)
    JARVIS_VOICEBOX_PROFILE_EN    (défaut « jarvis-en »)
    JARVIS_VOICEBOX_PROFILE_SOFT  (défaut « jarvis-soft »)

Un `voice_profile` posé sur l'utilisateur prime sur le preset : c'est le
crochet pour donner à chaque membre du foyer sa propre voix clonée une fois
son visage reconnu.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..auth.db import ensure_user_profile_dir
from ..auth.profiles import load_hud_preferences
from .voicebox import DEFAULT_ENGINE, ENGINES

logger = logging.getLogger("jarvis.voice.profiles")

# preset HUD → (variable d'env, profil voicebox par défaut, langue)
PRESETS: dict[str, tuple[str, str, str]] = {
    "jarvis_fr": ("JARVIS_VOICEBOX_PROFILE_FR", "jarvis-fr", "fr"),
    "jarvis_en": ("JARVIS_VOICEBOX_PROFILE_EN", "jarvis-en", "en"),
    "jarvis_soft": ("JARVIS_VOICEBOX_PROFILE_SOFT", "jarvis-soft", "fr"),
}

DEFAULT_PRESET = "jarvis_fr"

# Langues acceptées par GenerationRequest.language upstream.
LANGUAGES = frozenset(
    "zh en ja ko de fr ru pt es it he ar da el fi hi ms nl no pl sv sw tr".split()
)


@dataclass(frozen=True)
class VoiceSelection:
    """Ce que le Voice Manager doit demander à voicebox pour cet utilisateur."""

    profile: str
    engine: str
    language: str
    preset: str
    enabled: bool
    personality: bool = False
    instruct: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile": self.profile,
            "engine": self.engine,
            "language": self.language,
            "preset": self.preset,
            "enabled": self.enabled,
            "personality": self.personality,
        }


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("JSON invalide : %s", path)
        return None
    return data if isinstance(data, dict) else None


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _path(user_id: str) -> Path:
    return ensure_user_profile_dir(user_id) / "voice_profile"


def load_voice_profile(user_id: str) -> dict[str, Any] | None:
    return _read_json(_path(user_id))


def save_voice_profile(user_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    current = load_voice_profile(user_id) or {}
    payload = {**current, **patch, "userId": user_id, "updatedAt": _utc_now()}
    target = _path(user_id)
    _write_json(target, payload)
    logger.info("voice_profile sauvé · user=%s · profil=%s", user_id, payload.get("profile"))
    return {"ok": True, "path": str(target), "user_id": user_id, "voice": payload}


def _preset_default(preset: str) -> tuple[str, str]:
    """→ (profil voicebox, langue) pour un preset, env prioritaire."""
    env_key, fallback, language = PRESETS.get(preset, PRESETS[DEFAULT_PRESET])
    return os.environ.get(env_key, "").strip() or fallback, language


def resolve_voice(
    user_id: str,
    *,
    language: str | None = None,
    preset: str | None = None,
) -> VoiceSelection:
    """Croise préférences HUD et override utilisateur → sélection voicebox.

    `language` et `preset` viennent normalement de `locale.resolve_reply_language()`
    pour cet énoncé : le bilinguisme est arbitré là, pas ici. Sans eux on retombe
    sur les préférences enregistrées.

    Ne lève jamais : une préférence corrompue doit dégrader vers le preset FR,
    pas empêcher JARVIS de parler.
    """
    prefs = load_hud_preferences(user_id) or {}
    locale = prefs.get("locale") if isinstance(prefs.get("locale"), dict) else {}
    voice_prefs = prefs.get("voice") if isinstance(prefs.get("voice"), dict) else {}

    resolved_preset = str(preset or locale.get("voicePreset") or DEFAULT_PRESET)
    if resolved_preset not in PRESETS:
        logger.warning(
            "preset voix « %s » inconnu · user=%s — repli FR", resolved_preset, user_id
        )
        resolved_preset = DEFAULT_PRESET
    preset = resolved_preset

    profile, preset_language = _preset_default(preset)

    # La langue déjà arbitrée par locale.py gagne ; sinon sticky, sinon preset.
    resolved_language = (
        str(language or "").strip()
        or str(locale.get("stickyLanguage") or "").strip()
        or preset_language
    )
    if resolved_language not in LANGUAGES:
        resolved_language = preset_language

    engine = DEFAULT_ENGINE
    personality = False
    instruct = None

    override = load_voice_profile(user_id) or {}
    if override.get("profile"):
        profile = str(override["profile"])
    if override.get("engine") in ENGINES:
        engine = str(override["engine"])
    if override.get("language") in LANGUAGES:
        resolved_language = str(override["language"])
    personality = bool(override.get("personality", False))
    instruct = str(override["instruct"]) if override.get("instruct") else None

    # Coupure explicite : Settings HUD, puis override utilisateur.
    enabled = bool(voice_prefs.get("ttsEnabled", True)) and bool(
        override.get("enabled", True)
    )
    if prefs and not voice_prefs.get("enabled", True):
        enabled = False

    return VoiceSelection(
        profile=profile,
        engine=engine,
        language=resolved_language,
        preset=preset,
        enabled=enabled,
        personality=personality,
        instruct=instruct,
    )
