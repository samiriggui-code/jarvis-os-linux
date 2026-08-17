"""Smoke — filet chat → web.search (google, cherche sur…)."""

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
    from jarvis_core.chat_research_route import looks_like_web_search

    print("chat research route")
    for phrase in (
        "cherche les actualités du jour",
        "cherche sur google la météo",
        "cherche sur google demain",
        "sur google les dernières nouvelles",
        "recherche sur google jarvis os",
        "trouve sur google comment faire",
        "look up weather paris",
        "search for latest news",
        "quelle météo demain",
        "cherche sur internet des photos",
    ):
        check(f"web · {phrase[:40]!r}", looks_like_web_search(phrase))

    for phrase in (
        "j'arrive",
        "salut jarvis",
        "allume le salon",
        "merci",
        "configure google home",
    ):
        check(f"no web · {phrase[:40]!r}", not looks_like_web_search(phrase))

    print("\nchat research route : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
