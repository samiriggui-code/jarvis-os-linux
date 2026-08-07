"""
Locale / bilinguisme par utilisateur.
Face + voix -> profil -> preferred_language + voice preset.
Whisper (plus tard) fournit detected_lang ; ici heuristique texte + regles profil.
"""
from __future__ import annotations

import re
from datetime import datetime
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
    """Consignes de langue et de tenue, plus le contexte que le modèle ignore.

    ⚠ Deux ajouts qui viennent d'un défaut observé (2026-08-04) : à « quelle
    heure est-il », le modèle a répondu par toute sa réflexion interne
    (« Thinking Process », « Persona », « Determine the Content ») **sans
    jamais donner l'heure**.

    Deux causes, deux remèdes ici :

      · Les modèles à raisonnement narrent leur démarche s'ils n'ont pas
        l'ordre explicite de ne pas le faire. Un filtre de sortie existe aussi
        côté provider, mais mieux vaut ne pas produire ce qu'on devra couper.

      · Un LLM n'a AUCUNE notion du temps. Sans la date dans le contexte, il
        répond honnêtement qu'il ne peut pas savoir — ce qui est exact, et
        inutilisable pour un assistant domestique.
    """
    now = datetime.now().astimezone()

    # Noms écrits en dur, jamais `strftime('%A')` : celui-ci suit la locale du
    # SYSTÈME. Sur ce poste il rendait « Tuesday 04 August » dans une invite
    # française — et le NUC, en production, n'aura pas forcément de locale
    # française installée non plus.
    _JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")
    _MOIS = (
        "janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre",
    )
    fr_date = f"{_JOURS[now.weekday()]} {now.day} {_MOIS[now.month - 1]} {now.year}"

    # Chat libre = parole seule. Aucun outil UI. Sans ça le modèle invente
    # « c'est affiché sur l'écran » alors que rien n'a été ouvert (2026-08-06).
    no_fake_actions_en = (
        "You cannot open apps, screens, surfaces, or control the house from this "
        "chat path. Never claim you displayed, opened, locked, or executed anything. "
        "If the user asks to show or open a UI, say honestly that the command was "
        "not recognized as an action and must be routed (e.g. « ouvre la maison »)."
    )
    no_fake_actions_fr = (
        "Tu ne peux ni ouvrir d'app, ni d'écran, ni de surface, ni commander la "
        "maison depuis ce chemin de chat. N'affirme jamais que tu as affiché, "
        "ouvert, verrouillé ou exécuté quoi que ce soit. Si l'utilisateur demande "
        "d'afficher une UI, dis honnêtement que la commande n'a pas été reconnue "
        "comme action (ex. « ouvre la maison »)."
    )

    if lang == "en":
        return (
            "Reply briefly in English, JARVIS tone. "
            "Answer directly: never narrate your reasoning, never describe your "
            "persona or your process. Output only the final answer. "
            f"{no_fake_actions_en} "
            f"Current date and time: {now.strftime('%A %d %B %Y, %H:%M')}."
        )
    return (
        "Réponds brièvement en français, ton JARVIS. "
        "Réponds directement : ne raconte jamais ton raisonnement, ne décris ni "
        "ta démarche ni ton personnage. Ne donne que la réponse finale. "
        f"{no_fake_actions_fr} "
        f"Date et heure actuelles : {fr_date}, {now.strftime('%Hh%M')}."
    )
