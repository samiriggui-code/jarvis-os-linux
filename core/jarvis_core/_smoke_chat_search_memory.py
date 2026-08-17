"""Smoke — mémoire recherche web inter-tours."""

from __future__ import annotations

import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    from jarvis_core.chat_search_memory import (
        followup_search_prompt,
        get_last_web_search,
        search_context_note,
        looks_like_search_followup,
        remember_web_search,
    )

    class _Orch:
        pass

    orch = _Orch()
    remember_web_search(
        orch,
        "samir",
        query="actualités du jour",
        summary="Résumé test",
        url="https://www.google.com/search?q=actu",
    )
    mem = get_last_web_search(orch, "samir")
    check("remember + get", mem is not None and mem.get("query") == "actualités du jour")
    check("followup detect", looks_like_search_followup("approfondis le premier point"))
    check("not followup", not looks_like_search_followup("j'arrive"))
    check(
        "interim echo not followup",
        not looks_like_search_followup(
            "je continue de travailler là-dessus ça prend un peu plus de temps"
        ),
    )
    check("continue la recherche", looks_like_search_followup("continue la recherche"))
    enriched = followup_search_prompt("compare les prix", mem or {})
    check("enriched prompt", "actualités" in enriched and "compare" in enriched)
    note = search_context_note(mem, intent="web.search")
    check("search note", "actualités" in note)
    print("\nchat search memory : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
