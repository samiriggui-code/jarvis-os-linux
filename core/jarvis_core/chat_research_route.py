"""Filet déterministe chat → web.search (tuile reach).

Intercepte les formulations de recherche avant le chat Hermes libre.
Spec : ordre Gateway dans ``ws/handlers/chat.py`` — triggers → **ici** → sémantique.
"""

from __future__ import annotations

import re

# Sous-chaînes entourées d'espaces (texte normalisé : minuscules, espaces simples).
_RESEARCH_WORDS: tuple[str, ...] = (
    " cherche ",
    " trouve ",
    " propose ",
    " recherche ",
    " cherche moi ",
    " va chercher ",
    " regarde sur ",
    " recherche sur ",
    " cherche sur ",
    " nouvelles ",
    " actualité ",
    " actualites ",
    " actualités ",
    " sur internet ",
    " sur le web ",
    " sur google ",
    " on google ",
    " météo ",
    " meteo ",
    " weather ",
    " prévisions ",
    " previsions ",
    " search for ",
    " look up ",
    " lookup ",
    " news briefing ",
    " brief actual ",
)

# Regex complémentaires (google explicite sans « cherche » collé au mot-clé liste).
_RESEARCH_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.I)
    for p in (
        r"\b(?:cherche|recherche|trouve)(?:r|z|-t(?:u|il|elle|on))?\s+(?:moi\s+)?(?:sur\s+)?google\b",
        r"\b(?:sur|on|via)\s+google\b",
        r"\bgoogle\s+(?:search|recherche)\b",
        r"\brecherche(?:r|z)?\s+(?:sur\s+)?google\b",
        r"\b(?:give me|get me)\s+(?:the\s+)?(?:latest\s+)?news\b",
    )
)


def normalize_chat_research_text(text: str) -> str:
    """Minuscules, apostrophes → espaces, espaces simples, bords padés."""
    return " " + " ".join(text.lower().replace("'", " ").split()) + " "


def looks_like_web_search(text: str) -> bool:
    """True si la phrase doit forcer ``web.search`` (tuile reach), pas chat libre."""
    if not (text or "").strip():
        return False
    lowered = normalize_chat_research_text(text)
    if any(w in lowered for w in _RESEARCH_WORDS):
        return True
    raw = text.strip()
    return any(p.search(raw) for p in _RESEARCH_PATTERNS)
