"""Smoke — Plex : reprendre Stargate SG-1 là où on s'est arrêté.

Contrat produit (``plex.py``) :
  * ``/library/onDeck`` = marque-page Plex (pas JARVIS)
  * « lance / reprends Stargate » → épisode en cours, **pas** S01E01
  * lecture via HA → Apple TV chambre (défaut) avec lien ``plex://``

Modes :
  * offline (toujours) — mock onDeck + resolve
  * live resolve — si ``JARVIS_PLEX_TOKEN`` (NUC / core.env)
  * live play — seulement si ``JARVIS_SMOKE_PLEX_PLAY=1``
    (pousse vraiment l'épisode sur l'Apple TV)

    python -m jarvis_core._smoke_plex_sg1_resume
    JARVIS_SMOKE_PLEX_PLAY=1 python -m jarvis_core._smoke_plex_sg1_resume
"""
from __future__ import annotations

import asyncio
import os
import sys
from typing import Any
from unittest.mock import AsyncMock

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

# Phrases vocales typiques — « stargate » (len>3) porte le match ; « sg1 » seul
# est filtré par resolve (mots ≤3 ignorés).
PHRASE_RESUME = "reprends stargate sg-1"
PHRASE_LANCE = "lance stargate"


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


def skip(label: str, reason: str) -> None:
    print(f"  [SKIP] {label} — {reason}")


def _load_core_env() -> None:
    """Charge /etc/jarvis/core.env sur NUC si présent (sans écraser l'env)."""
    from pathlib import Path

    path = Path(os.environ.get("JARVIS_CORE_ENV") or "/etc/jarvis/core.env")
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


async def _test_offline() -> None:
    from jarvis_core.plex import DEFAULT_ROOM, Item, PlexAdapter, PLAYERS, _fold

    item = Item(
        rating_key="4242",
        kind="episode",
        title="Children of the Gods",
        show="Stargate SG-1",
        season=1,
        episode=1,
        offset_ms=(40 * 60 + 52) * 1000,
        duration_ms=45 * 60 * 1000,
    )
    check("label S/E", "saison 1" in item.label and "épisode 1" in item.label)
    check("resumes_at 40:52", item.resumes_at == "40:52")
    check("chambre = appletv", PLAYERS[DEFAULT_ROOM].kind == "appletv")

    plex = PlexAdapter(url="http://127.0.0.1:9", token="smoke-token")
    plex.on_deck = AsyncMock(  # type: ignore[method-assign]
        return_value=[item],
    )
    plex.search = AsyncMock(return_value=[])  # type: ignore[method-assign]

    found = await plex.resolve(PHRASE_RESUME)
    check("resolve préfère onDeck", len(found) == 1 and found[0].rating_key == "4242")
    check("match stargate", any(w in _fold(found[0].show or "") for w in ("stargate",)))

    # Sans onDeck → tombe sur search (ne doit PAS inventer un épisode).
    plex.on_deck = AsyncMock(return_value=[])  # type: ignore[method-assign]
    plex.search = AsyncMock(return_value=[item])  # type: ignore[method-assign]
    found2 = await plex.resolve(PHRASE_LANCE)
    check("fallback search", len(found2) == 1)

    # « sg1 » seul : trop court → liste vide (contrat actuel).
    empty = await plex.resolve("sg1")
    check("sg1 seul trop court", empty == [])


async def _test_live() -> None:
    _load_core_env()
    from jarvis_core.plex import PlexAdapter

    plex = PlexAdapter()
    if not plex.configured:
        skip("live Plex", "JARVIS_PLEX_TOKEN absente")
        return

    try:
        ok = await plex.health()
    except Exception as exc:  # noqa: BLE001
        skip("live health", str(exc))
        return
    check("Plex joignable", ok)

    deck = await plex.on_deck(force=True)
    print(f"    onDeck global · {len(deck)} item(s)")
    for it in deck[:8]:
        print(f"      - {it.label} @ {it.resumes_at} (key={it.rating_key})")

    targets = await plex.resolve(PHRASE_RESUME)
    if not targets:
        # Essai sans « sg-1 » / variante orthographe.
        for alt in ("reprends stargate", "lance stargate", "stargate sg-1"):
            targets = await plex.resolve(alt)
            if targets:
                print(f"    match via « {alt} »")
                break

    if not targets:
        skip(
            "live SG-1 onDeck",
            "aucun épisode Stargate en cours dans Plex — "
            "ouvre un épisode une fois dans l'app puis relance le smoke",
        )
        return

    item = targets[0]
    show_ok = "stargate" in (item.show or item.title or "").lower()
    check("cible Stargate", show_ok)
    check("kind episode", item.kind == "episode")
    print(f"    → {item.label} · reprise {item.resumes_at} · offset_ms={item.offset_ms}")

    play = (os.environ.get("JARVIS_SMOKE_PLEX_PLAY") or "").strip().lower() in {
        "1", "true", "yes",
    }
    if not play:
        skip(
            "live play Apple TV",
            "set JARVIS_SMOKE_PLEX_PLAY=1 pour pousser vraiment sur la TV",
        )
        return

    # Lance pour de vrai (chambre / Apple TV).
    result = await plex.execute(PHRASE_RESUME if show_ok else PHRASE_LANCE, room="chambre")
    check("play ok", result.get("ok") is True)
    check("action play", result.get("action") == "play")
    print(f"    play → {result.get('title')} @ {result.get('resumes_at')} · room={result.get('room')}")


def main() -> int:
    print("=== smoke Plex SG-1 resume ===")
    print("--- offline ---")
    asyncio.run(_test_offline())
    print("--- live ---")
    asyncio.run(_test_live())
    print("=== ALL PASS ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
