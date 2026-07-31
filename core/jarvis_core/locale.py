"""
Locale / bilinguisme par utilisateur.
Face + voix -> profil -> preferred_language + voice preset.
Whisper (plus tard) fournit detected_lang ; ici heuristique texte + regles profil.
"""
from __future__ import annotations

import re
from typing import Any, Literal

Lang = Literal["fr", "en"]
LocaleMode = Literal["mirror", "preferred", "sticky"]

FR_MARKERS = re.compile(
    r"\b(le|la|les|un|une|des|je|tu|nous|vous|est|suis|quoi|meteo|ouvre|lance|"
    r"bonjour|merci|s'il|sil|passe|francais|fran[cç]ais)\b",
    re.I,
)
EN_MARKERS = re.compile(
    r"\b(the|a|an|is|are|what|what's|open|launch|please|thanks|hello|"
    r"weather|calendar|switch|english|french)\b",
    re.I,
)

SWITCH_FR = re.compile(
    r"\b(passe\s+en\s+fran[cç]ais|parle\s+fran[cç]ais|switch\s+to\s+french)\b",
    re.I,
)
SWITCH_EN = re.compile(
    r"\b(passe\s+en\s+anglais|parle\s+anglais|switch\s+to\s+english|speak\s+english)\b",
    re.I,
)

DEFAULT_LOCALE: dict[str, Any] = {
    "preferredLanguage": "fr",
    "secondaryLanguages": ["en"],
    "mode": "mirror",
    "stickyLanguage": None,
    "voicePreset": "jarvis_fr",
    "faceId": None,
}

# Presets foyer (exemples produit — surchargeables par prefs)
ROLE_VOICE_DEFAULTS: dict[str, str] = {
    "ADMIN": "jarvis_fr",
    "USER": "jarvis_en",
    "CHILD": "jarvis_soft",
    "GUEST": "jarvis_fr",
}


def detect_utterance_language(text: str) -> Lang | None:
    """Heuristique légère (Whisper lang_id remplacera)."""
    t = (text or "").strip()
    if not t:
        return None
    fr = len(FR_MARKERS.findall(t))
    en = len(EN_MARKERS.findall(t))
    if fr == 0 and en == 0:
        return None
    if fr >= en:
        return "fr"
    return "en"


def parse_language_switch(text: str) -> Lang | None:
    if SWITCH_EN.search(text or ""):
        return "en"
    if SWITCH_FR.search(text or ""):
        return "fr"
    return None


def normalize_locale(raw: dict[str, Any] | None) -> dict[str, Any]:
    base = {**DEFAULT_LOCALE}
    if not isinstance(raw, dict):
        return base
    pref = str(raw.get("preferredLanguage") or raw.get("preferred_language") or "fr").lower()
    if pref not in ("fr", "en"):
        pref = "fr"
    sec = raw.get("secondaryLanguages") or raw.get("secondary_languages") or ["en"]
    if not isinstance(sec, list):
        sec = ["en"]
    sec_n = [s for s in sec if s in ("fr", "en") and s != pref]
    mode = str(raw.get("mode") or "mirror").lower()
    if mode not in ("mirror", "preferred", "sticky"):
        mode = "mirror"
    sticky = raw.get("stickyLanguage") or raw.get("sticky_language")
    if sticky not in ("fr", "en", None):
        sticky = None
    voice = str(raw.get("voicePreset") or raw.get("voice") or "jarvis_fr")
    if voice not in ("jarvis_fr", "jarvis_en", "jarvis_soft"):
        voice = "jarvis_fr"
    face = raw.get("faceId") or raw.get("face_id")
    return {
        "preferredLanguage": pref,
        "secondaryLanguages": sec_n,
        "mode": mode,
        "stickyLanguage": sticky,
        "voicePreset": voice,
        "faceId": str(face) if face else None,
    }


def resolve_reply_language(
    *,
    locale: dict[str, Any],
    utterance: str,
    whisper_lang: str | None = None,
) -> dict[str, Any]:
    """
    Décide la langue de réponse + éventuel sticky update.
    Retourne { language, voicePreset, stickyUpdate?, switchAck? }
    """
    loc = normalize_locale(locale)
    switch = parse_language_switch(utterance)
    if switch:
        allowed = {loc["preferredLanguage"], *loc["secondaryLanguages"]}
        if switch not in allowed and switch != loc["preferredLanguage"]:
            # Accepter switch si secondary vide mais demande explicite
            allowed.add(switch)
        return {
            "language": switch,
            "voicePreset": "jarvis_en" if switch == "en" else (
                "jarvis_soft" if loc["voicePreset"] == "jarvis_soft" else "jarvis_fr"
            ),
            "stickyUpdate": switch,
            "modeHint": "sticky",
            "switchAck": True,
        }

    detected: Lang | None = None
    if whisper_lang:
        w = whisper_lang.lower()[:2]
        if w in ("fr", "en"):
            detected = w  # type: ignore[assignment]
    if detected is None:
        detected = detect_utterance_language(utterance)

    mode: LocaleMode = loc["mode"]  # type: ignore[assignment]
    sticky = loc.get("stickyLanguage")

    if mode == "preferred":
        lang: Lang = loc["preferredLanguage"]  # type: ignore[assignment]
    elif mode == "sticky" and sticky in ("fr", "en"):
        lang = sticky  # type: ignore[assignment]
    elif sticky in ("fr", "en") and mode == "mirror":
        # sticky prioritaire tant que pas clear
        lang = sticky  # type: ignore[assignment]
    elif detected and detected in (loc["preferredLanguage"], *loc["secondaryLanguages"]):
        lang = detected
    elif detected and not loc["secondaryLanguages"]:
        lang = loc["preferredLanguage"]  # type: ignore[assignment]
    elif detected:
        lang = detected  # mirror même hors secondary si explicite
    else:
        lang = loc["preferredLanguage"]  # type: ignore[assignment]

    voice = loc["voicePreset"]
    if voice == "jarvis_soft":
        pass
    elif lang == "en":
        voice = "jarvis_en"
    else:
        voice = "jarvis_fr"

    return {
        "language": lang,
        "voicePreset": voice,
        "stickyUpdate": None,
        "modeHint": mode,
        "switchAck": False,
        "detected": detected,
    }


def system_prompt_language(lang: Lang) -> str:
    if lang == "en":
        return "Reply briefly in English, JARVIS tone."
    return "Réponds brièvement en français, ton JARVIS."
