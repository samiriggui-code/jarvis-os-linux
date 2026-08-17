"""Smoke — parsing streaming HA (Gateway spec, sans live HA)."""
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
    print("HA streaming — parsing Gateway")

    from jarvis_core.gateway import HASS_DEFAULT_URL, hass_default_url
    from jarvis_core.homeassistant import (
        DEFAULT_URL,
        Entity,
        _STREAMING_SOURCE_NAMES,
        _entity_has_source,
        _fold,
        _prefer_available_players,
        _room_of,
        _streaming_app_of,
    )

    check("DEFAULT_URL = NUC local", DEFAULT_URL == HASS_DEFAULT_URL == "http://127.0.0.1:8123")
    check("hass_default_url", hass_default_url() == "http://127.0.0.1:8123")

    check("app netflix", _streaming_app_of(_fold("lance netflix sur apple tv chambre")) == "netflix")
    check("app prime video", _streaming_app_of(_fold("ouvre prime video")) == "prime")
    check("app prime court", _streaming_app_of(_fold("lance prime")) == "prime")
    check("room chambre/apple", _room_of(_fold("netflix apple tv chambre")) == "chambre")
    check("room salon", _room_of(_fold("netflix freebox salon")) == "salon")
    check("source Netflix", _STREAMING_SOURCE_NAMES["netflix"] == "Netflix")
    check("source Prime", _STREAMING_SOURCE_NAMES["prime"] == "Prime Video")

    atv = Entity(
        "media_player.chambre_chambre",
        "Chambre",
        "off",
        None,
        attributes={"source_list": ["Netflix", "Prime Video", "Disney+", "YouTube"]},
    )
    dead = Entity("media_player.freebox_player_pop_2", "Freebox", "unavailable", None)
    check("has Netflix source", _entity_has_source(atv, "Netflix"))
    check("prefer live", _prefer_available_players([dead, atv]) == [atv])

    print("\nHA streaming smokes : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
