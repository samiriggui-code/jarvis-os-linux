"""Annulation vocale — stop / annule la recherche."""

from __future__ import annotations

import re

from .chat_research_route import normalize_chat_research_text

_CANCEL_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.I)
    for p in (
        r"^\s*(?:stop|arrête|arrete|annule|cancel)\s*$",
        r"\bannule(?:r| la)?(?: la)? recherche\b",
        r"\bstop(?:pe)?(?: la)? recherche\b",
        r"\barrete(?: la)? recherche\b",
        r"\binterromp(?:s|re)?(?: la)? recherche\b",
        r"\bstop\b.*\brecherche\b",
    )
)


def looks_like_cancel_request(text: str) -> bool:
    raw = (text or "").strip()
    if not raw:
        return False
    if any(p.search(raw) for p in _CANCEL_PATTERNS):
        return True
    lowered = normalize_chat_research_text(raw)
    return lowered.strip() in {
        "stop",
        "annule",
        "cancel",
        "arrête",
        "arrete",
    }


def looks_like_explicit_cancel_request(text: str) -> bool:
    """Annulation volontaire pendant une recherche Hermes — pas un « stop » STT parasite."""
    raw = (text or "").strip()
    if not raw:
        return False
    explicit_patterns = (
        r"\bannule(?:r| la)?(?: la)? recherche\b",
        r"\bstop(?:pe)?(?: la)? recherche\b",
        r"\barrete(?: la)? recherche\b",
        r"\binterromp(?:s|re)?(?: la)? recherche\b",
        r"\bstop\b.*\brecherche\b",
        r"\b(?:jarvis\s+)?(?:stop|arrête|arrete|annule)\s+(?:la\s+)?(?:recherche|ça)\b",
    )
    if any(re.search(p, raw, re.I) for p in explicit_patterns):
        return True
    lowered = normalize_chat_research_text(raw)
    words = [w for w in lowered.split() if w]
    return len(words) >= 2 and words[0] in {"stop", "annule", "cancel", "arrête", "arrete", "interromps", "interrompe"}
