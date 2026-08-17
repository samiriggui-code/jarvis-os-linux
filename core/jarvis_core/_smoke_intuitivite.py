"""Accueil dynamique + contexte mémoire dans le chat libre — sans réseau réel.

    python -m jarvis_core._smoke_intuitivite
"""
from __future__ import annotations

import asyncio
import json
import sys
from unittest.mock import AsyncMock, patch

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


class _Ws:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    async def send(self, raw: str) -> None:
        self.messages.append(json.loads(raw))


def main() -> int:
    from jarvis_core import Orchestrator

    print("Intuitivité — accueil dynamique + contexte mémoire")

    # ── 1. Accueil dynamique : ne casse jamais, parle une fois ─────────
    orch = Orchestrator()
    orch.providers.complete = AsyncMock(return_value="Bonsoir. Sur quoi travaille-t-on ?")
    orch.speak = AsyncMock(return_value={"type": "tts_skipped"})
    ws = _Ws()
    asyncio.run(orch._speak_welcome_greeting(ws))
    check("accueil : providers.complete appelé", orch.providers.complete.called)
    check("accueil : speak appelé avec le texte généré", orch.speak.call_args.args[0] == "Bonsoir. Sur quoi travaille-t-on ?")
    check("accueil : événement renvoyé au client", any(m.get("type") == "tts_skipped" for m in ws.messages))

    # ── 2. Accueil dynamique : jamais de crash si providers échoue ──────
    orch2 = Orchestrator()
    orch2.providers.complete = AsyncMock(side_effect=RuntimeError("boom"))
    orch2.speak = AsyncMock(return_value={"type": "tts_skipped"})
    ws2 = _Ws()
    asyncio.run(orch2._speak_welcome_greeting(ws2))  # ne doit pas lever
    check("accueil : échec providers -> pas de crash, pas de speak", not orch2.speak.called)

    # ── 3. Contexte mémoire : hits injectés dans le prompt ──────────────
    with patch("jarvis_core.memory.service.jarvis_memory_search") as m_search:
        m_search.return_value = {
            "ok": True,
            "hits": [{"title": "Recherche HP ProDesk hier", "snippet": "comparaison prix"}],
        }
        orch3 = Orchestrator()
        captured: dict = {}

        async def fake_complete_structured(prompt, **kw):
            captured["prompt"] = prompt
            return {"speech": "ok", "component": "ResultPanel", "props": {"title": "T", "body": "b", "source": "s", "items": []}}

        orch3.providers.complete_structured = fake_complete_structured
        orch3.speak = AsyncMock(return_value={"type": "tts_skipped"})
        orch3._publish_component_surface = AsyncMock()
        ws3 = _Ws()
        asyncio.run(orch3.handle_user_chat(ws3, "et sinon, cette recherche d'hier ?"))
        check("mémoire : recherche appelée", m_search.called)
        check("mémoire : hit injecté dans le prompt", "HP ProDesk" in captured.get("prompt", ""))

    # ── 4. Contexte mémoire : aucun hit -> prompt inchangé, pas de crash ─
    with patch("jarvis_core.memory.service.jarvis_memory_search") as m_search2:
        m_search2.return_value = {"ok": True, "hits": []}
        orch4 = Orchestrator()
        captured2: dict = {}

        async def fake_complete_structured2(prompt, **kw):
            captured2["prompt"] = prompt
            return {"speech": "ok", "component": "ResultPanel", "props": {"title": "T", "body": "b", "source": "s", "items": []}}

        orch4.providers.complete_structured = fake_complete_structured2
        orch4.speak = AsyncMock(return_value={"type": "tts_skipped"})
        orch4._publish_component_surface = AsyncMock()
        ws4 = _Ws()
        asyncio.run(orch4.handle_user_chat(ws4, "quelle heure est-il"))
        check("mémoire : aucun hit -> pas de note ajoutée", "Mémoire foyer" not in captured2.get("prompt", ""))

    # ── 5. Mémoire indisponible -> chat continue quand même ─────────────
    with patch("jarvis_core.memory.service.jarvis_memory_search", side_effect=RuntimeError("db down")):
        orch5 = Orchestrator()
        orch5.providers.complete_structured = AsyncMock(
            return_value={"speech": "ok", "component": "ResultPanel", "props": {"title": "T", "body": "b", "source": "s", "items": []}}
        )
        orch5.speak = AsyncMock(return_value={"type": "tts_skipped"})
        orch5._publish_component_surface = AsyncMock()
        ws5 = _Ws()
        asyncio.run(orch5.handle_user_chat(ws5, "salut"))  # ne doit pas lever
        check("mémoire down : chat continue sans crash", orch5.providers.complete_structured.called)

    print("\nIntuitivité smokes : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
