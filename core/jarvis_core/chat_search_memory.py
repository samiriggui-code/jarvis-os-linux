"""Mémoire courte — dernière recherche web par utilisateur (inter-tours chat).

Persiste dans ``hud_preferences.session.lastWebSearch`` + cache orchestrator.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

# Échos TTS / feedback interim — jamais une « suite » utilisateur.
# Incident live 2026-08-16 : « je continue de travailler… » (interim Hermes)
# matchait `\bcontinue\b` → 2ᵉ web.search fantôme.
_STATUS_ECHO_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.I)
    for p in (
        r"continue\s+de\s+travailler",
        r"prend(?:s)?\s+un\s+peu\s+plus",
        r"temps\s+que\s+pr[eé]vu",
        r"je\s+termine\s+la\s+recherche",
        r"dis\s+stop\s+la\s+recherche",
        r"noyau\s+cognitif",
        r"synth[eè]se\s+vocale",
    )
)

_FOLLOWUP_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.I)
    for p in (
        r"\bapprofondi(?:r|s|ss(?:e|ons|ez)?)\b",
        r"\b(?:la\s+)?suite\b",
        # Pas de `\bcontinue\b` nu : l'interim TTS « je continue de travailler »
        # le déclenchait. Exiger une suite conversationnelle explicite.
        r"\bcontinue(?:r|z)?(?:\s+(?:la\s+)?(?:recherche|suite)|\s+(?:avec|sur|donc))\b",
        r"\bd[ée]tail(?:le|s|ler)?\b",
        r"\bplus\s+(?:de\s+)?(?:d[ée]tails?|infos?)\b",
        r"\bet\s+(?:pour|sinon|aussi)\b",
        r"\bcompare(?:r|z)?\b",
        r"\bautre(?:s)?\s+(?:option|piste|source)s?\b",
        r"\b(?:montre|affiche|ouvre)(?:\s+moi)?(?:\s+(?:la|le))?\s+(?:suite|r[ée]sultat)\b",
        r"\b(?:cette|la)\s+recherche\b",
        r"\b(?:re)?prends?\b",
        r"\b(?:m[êe]me\s+sujet|m[êe]me\s+chose)\b",
        r"\b(?:et\s+)?(?:les\s+)?billets?\b",  # suite naturelle après actualités
    )
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_cache(orch: Any) -> dict[str, dict[str, Any]]:
    cache = getattr(orch, "_web_search_memory", None)
    if not isinstance(cache, dict):
        cache = {}
        orch._web_search_memory = cache
    return cache


def remember_web_search(
    orch: Any,
    user_id: str,
    *,
    query: str,
    summary: str = "",
    url: str = "",
) -> None:
    """Enregistre la dernière recherche (mémoire session + disque léger)."""
    uid = (user_id or "local").strip() or "local"
    entry = {
        "query": (query or "").strip()[:500],
        "summary": (summary or "").strip()[:800],
        "url": (url or "").strip()[:500],
        "at": _utc_now(),
    }
    if not entry["query"]:
        return
    _ensure_cache(orch)[uid] = entry
    try:
        from ..auth.profiles import load_hud_preferences, save_hud_preferences

        prefs = load_hud_preferences(uid) or {}
        session = prefs.get("session") if isinstance(prefs.get("session"), dict) else {}
        session = {**session, "lastWebSearch": entry}
        save_hud_preferences(uid, {**prefs, "session": session})
    except Exception:
        pass


def get_last_web_search(orch: Any, user_id: str) -> dict[str, Any] | None:
    uid = (user_id or "local").strip() or "local"
    cache = _ensure_cache(orch)
    hit = cache.get(uid)
    if isinstance(hit, dict) and hit.get("query"):
        return hit
    try:
        from ..auth.profiles import load_hud_preferences

        prefs = load_hud_preferences(uid) or {}
        session = prefs.get("session") if isinstance(prefs.get("session"), dict) else {}
        stored = session.get("lastWebSearch")
        if isinstance(stored, dict) and stored.get("query"):
            cache[uid] = stored
            return stored
    except Exception:
        pass
    return None


def looks_like_search_followup(text: str) -> bool:
    """Suite conversationnelle d'une recherche — pas une nouvelle requête complète."""
    if not (text or "").strip():
        return False
    raw = text.strip()
    if any(p.search(raw) for p in _STATUS_ECHO_PATTERNS):
        return False
    if any(p.search(raw) for p in _FOLLOWUP_PATTERNS):
        return True
    lowered = f" {raw.lower()} "
    # Phrases courtes anaphoriques
    return lowered.strip() in {
        "la suite",
        "continue",
        "continue la recherche",
        "approfondis",
        "plus de détails",
        "plus de details",
        "et sinon",
        "compare",
        "montre moi",
        "ouvre",
    }


def followup_search_prompt(utterance: str, memory: dict[str, Any]) -> str:
    prev = str(memory.get("query") or "").strip()
    body = (utterance or "").strip()
    if prev and body:
        return f"Suite de la recherche « {prev} » — {body}"
    return body or prev


def search_context_note(memory: dict[str, Any] | None, *, intent: str) -> str:
    if not memory or not memory.get("query"):
        return ""
    q = str(memory["query"])[:200]
    summary = str(memory.get("summary") or "")[:350]
    if intent == "agent.skills":
        return (
            f" Recherche web récente : «{q}»."
            f"{f' Synthèse : {summary}.' if summary else ''}"
            " Si l'utilisateur enchaîne (approfondir, comparer, autre angle),"
            " réponds en tenant compte de ce contexte ou propose une recherche ciblée."
        )
    if intent in ("web.search", "web.browse"):
        return f" Contexte recherche précédente : «{q}»."
    return ""
