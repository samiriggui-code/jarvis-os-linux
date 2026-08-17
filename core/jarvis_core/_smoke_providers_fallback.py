"""Repli Anthropic direct dans AIProviderManager — sans appel réseau réel.

    python -m jarvis_core._smoke_providers_fallback
"""
from __future__ import annotations

import asyncio
import sys
from unittest.mock import AsyncMock, patch

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    import os

    from jarvis_core.providers import AIProviderManager, ProviderMode

    print("Providers — repli OpenRouter -> Anthropic (pas d'Ollama)")

    with patch.dict(
        os.environ,
        {"OPENROUTER_API_KEY": "x", "ANTHROPIC_API_KEY": "y"},
        clear=False,
    ):
        pm = AIProviderManager()
        check("mode cloud", pm.current_mode() == "cloud")

        # OpenRouter OK -> Anthropic jamais appelé.
        with patch.object(pm, "_openrouter_complete", AsyncMock(return_value="ok openrouter")):
            with patch.object(pm, "_anthropic_complete", AsyncMock(return_value="ok anthropic")) as m_anthropic:
                reply = asyncio.run(pm.complete("salut"))
                check("openrouter nominal -> pas de repli", reply == "ok openrouter")
                check("anthropic jamais appelé si openrouter OK", not m_anthropic.called)

        # OpenRouter échoue -> repli Anthropic.
        with patch.object(pm, "_openrouter_complete", AsyncMock(side_effect=RuntimeError("boom"))):
            with patch.object(pm, "_anthropic_complete", AsyncMock(return_value="ok anthropic")) as m_anthropic:
                reply = asyncio.run(pm.complete("salut"))
                check("openrouter échoue -> repli anthropic", reply == "ok anthropic")
                check("anthropic bien appelé", m_anthropic.called)

        # OpenRouter ET Anthropic échouent -> message d'erreur clair, jamais de crash.
        with patch.object(pm, "_openrouter_complete", AsyncMock(side_effect=RuntimeError("boom"))):
            with patch.object(pm, "_anthropic_complete", AsyncMock(side_effect=RuntimeError("boom2"))):
                reply = asyncio.run(pm.complete("salut"))
                check("double échec -> message d'erreur, pas de crash", "Erreur" in reply)

    # Anthropic seul (pas d'OpenRouter) : bascule directe, sans erreur.
    with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "y"}, clear=False):
        os.environ.pop("OPENROUTER_API_KEY", None)
        pm2 = AIProviderManager()
        check("mode cloud (anthropic seul)", pm2.current_mode() == "cloud")
        with patch.object(pm2, "_anthropic_complete", AsyncMock(return_value="ok anthropic seul")) as m:
            reply = asyncio.run(pm2.complete("salut"))
            check("anthropic seul -> appelé directement", m.called)
            check("réponse anthropic seul", reply == "ok anthropic seul")

    # Aucune clé -> mode system, jamais d'appel réseau.
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("OPENROUTER_API_KEY", None)
        os.environ.pop("ANTHROPIC_API_KEY", None)
        pm3 = AIProviderManager()
        check("aucune clé -> mode system", pm3.current_mode() == "system")
        reply = asyncio.run(pm3.complete("salut"))
        check("mode system -> réponse programmée, pas de crash", "Mode système" in reply)

    check("_ollama_complete bien retiré", not hasattr(AIProviderManager, "_ollama_complete"))

    print("\nProviders fallback smokes : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
