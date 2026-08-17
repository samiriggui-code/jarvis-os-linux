"""Smoke — `AIProviderManager.web_search` FAST V1 (feu vert Samir 2026-08-17).

Vérifie la politique, pas le réseau réel (tout est mocké) :
  - 1 recherche nominale, OpenRouter d'abord, STOP au premier succès
  - fallback Anthropic seulement si budget restant suffisant
  - fallback DDGS en dernier recours, sans appel LLM de synthèse derrière
  - jamais deux tentatives sur le même backend (pas de boucle agentique)
  - contrat SearchResult respecté (speech/results/sources/metadata)

    python -m jarvis_core._smoke_web_search
"""
from __future__ import annotations

import asyncio
import os
import sys
from unittest.mock import AsyncMock, patch

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


_OK_RESULT = {
    "query": "q", "provider": "x", "mode": "fast", "type": "web",
    "speech": "réponse.", "results": [{"title": "t", "url": "http://x", "snippet": "s"}],
    "sources": ["http://x"], "metadata": {"searches_used": 1, "cost_estimate_usd": 0.01},
}


async def _test_openrouter_success_stops_immediately() -> None:
    from jarvis_core.providers import AIProviderManager

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "k", "ANTHROPIC_API_KEY": "k"}):
        mgr = AIProviderManager()
        mgr._openrouter_web_search = AsyncMock(return_value=dict(_OK_RESULT))
        mgr._anthropic_web_search = AsyncMock(return_value=dict(_OK_RESULT))
        mgr._ddgs_web_search = AsyncMock(return_value=dict(_OK_RESULT))

        result = await mgr.web_search("météo demain")

        check("OpenRouter appelé une seule fois", mgr._openrouter_web_search.call_count == 1)
        check("Anthropic JAMAIS appelé (succès dès le 1er backend)", mgr._anthropic_web_search.call_count == 0)
        check("DDGS JAMAIS appelé", mgr._ddgs_web_search.call_count == 0)
        check("fallback_used == False", result["metadata"]["fallback_used"] is False)
        check("success == True", result["metadata"]["success"] is True)
        check("latency_ms présent", isinstance(result["metadata"]["latency_ms"], int))


async def _test_openrouter_fail_falls_back_to_anthropic() -> None:
    from jarvis_core.providers import AIProviderManager

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "k", "ANTHROPIC_API_KEY": "k"}):
        mgr = AIProviderManager()
        mgr._openrouter_web_search = AsyncMock(side_effect=RuntimeError("HTTP 500"))
        mgr._anthropic_web_search = AsyncMock(return_value=dict(_OK_RESULT, provider="anthropic"))
        mgr._ddgs_web_search = AsyncMock(return_value=dict(_OK_RESULT))

        result = await mgr.web_search("météo demain")

        check("OpenRouter tenté une seule fois (pas de retry)", mgr._openrouter_web_search.call_count == 1)
        check("Anthropic pris comme repli", mgr._anthropic_web_search.call_count == 1)
        check("DDGS jamais appelé (Anthropic a réussi)", mgr._ddgs_web_search.call_count == 0)
        check("provider == anthropic", result["provider"] == "anthropic")
        check("fallback_used == True", result["metadata"]["fallback_used"] is True)


async def _test_both_llm_fail_falls_back_to_ddgs() -> None:
    from jarvis_core.providers import AIProviderManager

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "k", "ANTHROPIC_API_KEY": "k"}):
        mgr = AIProviderManager()
        mgr._openrouter_web_search = AsyncMock(side_effect=RuntimeError("timeout"))
        mgr._anthropic_web_search = AsyncMock(side_effect=RuntimeError("timeout"))
        mgr._ddgs_web_search = AsyncMock(return_value=dict(_OK_RESULT, provider="ddgs"))

        result = await mgr.web_search("météo demain")

        check("DDGS pris en dernier recours", mgr._ddgs_web_search.call_count == 1)
        check("provider == ddgs", result["provider"] == "ddgs")


async def _test_budget_epuise_saute_anthropic() -> None:
    """Budget quasi épuisé après l'échec OpenRouter → pas de 2e aller-retour LLM voué à l'échec."""
    from jarvis_core.providers import AIProviderManager

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "k", "ANTHROPIC_API_KEY": "k"}):
        mgr = AIProviderManager()

        async def _slow_fail(*_a, **_k):
            await asyncio.sleep(0.05)  # simule un échec qui a mangé le budget
            raise RuntimeError("timeout")

        mgr._openrouter_web_search = AsyncMock(side_effect=_slow_fail)
        mgr._anthropic_web_search = AsyncMock(return_value=dict(_OK_RESULT))
        mgr._ddgs_web_search = AsyncMock(return_value=dict(_OK_RESULT, provider="ddgs"))
        mgr._MIN_BUDGET_FOR_FALLBACK_S = 9999.0  # force le seuil à échouer volontairement

        result = await mgr.web_search("météo demain")

        check("Anthropic SAUTÉ (budget jugé insuffisant)", mgr._anthropic_web_search.call_count == 0)
        check("DDGS pris directement", mgr._ddgs_web_search.call_count == 1)
        check("provider == ddgs", result["provider"] == "ddgs")


async def _test_budget_epuise_saute_ddgs_aussi() -> None:
    """Budget quasi épuisé après échec des deux LLM → DDGS aussi sauté,
    erreur propre plutôt qu'une attente qui dépasserait le budget FAST."""
    from jarvis_core.providers import AIProviderManager

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "k", "ANTHROPIC_API_KEY": "k"}):
        mgr = AIProviderManager()
        mgr._openrouter_web_search = AsyncMock(side_effect=RuntimeError("timeout"))
        mgr._anthropic_web_search = AsyncMock(side_effect=RuntimeError("timeout"))
        mgr._ddgs_web_search = AsyncMock(return_value=dict(_OK_RESULT, provider="ddgs"))
        mgr._MIN_BUDGET_FOR_FALLBACK_S = 9999.0
        mgr._MIN_BUDGET_FOR_DDGS_S = 9999.0  # force le seuil DDGS à échouer aussi

        result = await mgr.web_search("météo demain")

        check("DDGS jamais appelé (budget jugé insuffisant, priorité au budget)", mgr._ddgs_web_search.call_count == 0)
        check("success == False (erreur propre, pas d'attente)", result["metadata"]["success"] is False)
        check("provider == none", result["provider"] == "none")


async def _test_tout_echoue_erreur_propre() -> None:
    from jarvis_core.providers import AIProviderManager

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "k", "ANTHROPIC_API_KEY": "k"}):
        mgr = AIProviderManager()
        mgr._openrouter_web_search = AsyncMock(side_effect=RuntimeError("x"))
        mgr._anthropic_web_search = AsyncMock(side_effect=RuntimeError("x"))
        mgr._ddgs_web_search = AsyncMock(side_effect=RuntimeError("x"))

        result = await mgr.web_search("météo demain")

        check("success == False", result["metadata"]["success"] is False)
        check("speech jamais vide même en échec total", bool(result["speech"]))
        check("aucune exception levée (jamais de crash côté appelant)", True)


def _test_web_search_tool_variant_selection() -> None:
    from jarvis_core.providers import _anthropic_web_search_tool

    check(
        "Sonnet 5 → variante dynamique 20260209",
        _anthropic_web_search_tool("claude-sonnet-5")["type"] == "web_search_20260209",
    )
    check(
        "Sonnet 4.5 → variante basique 20250305 (pas de filtrage dynamique)",
        _anthropic_web_search_tool("claude-sonnet-4-5")["type"] == "web_search_20250305",
    )
    check(
        "Opus 5 → variante dynamique",
        _anthropic_web_search_tool("claude-opus-5")["type"] == "web_search_20260209",
    )


def _test_voice_ready_strips_and_caps() -> None:
    from jarvis_core.providers import _voice_ready

    noisy = (
        "**Actus NVIDIA :**\n\n"
        "- Investissement massif dans l'IA (https://example.com/a).\n"
        "- Nouveau GPU annoncé (https://example.com/b).\n"
        "- Partenariat avec un cloud provider.\n"
        "- Résultats trimestriels en hausse.\n"
        "Pour plus de détails, voir les sources."
    )
    cleaned = _voice_ready(noisy, max_sentences=3)
    check("aucun markdown résiduel", "*" not in cleaned and "#" not in cleaned)
    check("aucune URL récitée", "http" not in cleaned)
    check("aucune puce résiduelle en tête de phrase", "- " not in cleaned)
    check("capé à 3 phrases max", len([s for s in cleaned.split(". ") if s.strip()]) <= 3)

    empty = _voice_ready("")
    check("jamais de speech vide", bool(empty))


def _test_normal_chat_never_gets_web_plugin() -> None:
    """Le chemin _openrouter_complete (chat normal) ne doit JAMAIS injecter plugins/tools web."""
    import inspect

    from jarvis_core.providers import AIProviderManager

    src = inspect.getsource(AIProviderManager._openrouter_complete)
    check("chat normal (_openrouter_complete) ne contient jamais 'plugins'", "plugins" not in src)


async def main() -> None:
    print("=== smoke web.search FAST V1 ===")
    await _test_openrouter_success_stops_immediately()
    await _test_openrouter_fail_falls_back_to_anthropic()
    await _test_both_llm_fail_falls_back_to_ddgs()
    await _test_budget_epuise_saute_anthropic()
    await _test_budget_epuise_saute_ddgs_aussi()
    await _test_tout_echoue_erreur_propre()
    _test_web_search_tool_variant_selection()
    _test_voice_ready_strips_and_caps()
    _test_normal_chat_never_gets_web_plugin()
    print("=== ALL PASS ===")


if __name__ == "__main__":
    asyncio.run(main())
