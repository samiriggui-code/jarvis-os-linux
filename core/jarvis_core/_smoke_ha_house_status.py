"""Smoke — snapshot état maison (HA) sans live HA."""
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
    print("=== smoke HA house status ===")
    from jarvis_core.homeassistant import Entity, build_house_status

    entities = [
        Entity("light.salon", "Salon", "off", None),
        Entity("media_player.chambre_chambre", "Chambre", "off", None),
        Entity("media_player.freebox_player_pop_2", "Freebox", "unavailable", None),
        Entity("binary_sensor.apple_tv_chambre", "Apple TV Chambre", "on", None),
        Entity("binary_sensor.something_else", "Noise", "on", None),
        Entity("switch.salon_wifi", "Wi-Fi", "on", None),
    ]
    status = build_house_status(entities)
    check("ok", status.get("ok") is True)
    check("counts light", status["counts"].get("light") == 1)
    check("speech mentions light", "lumière" in status["speech"].lower() or "lumiere" in status["speech"].lower())
    check("speech mentions lecteur", "lecteur" in status["speech"].lower())
    check("rows non vides", len(status["rows"]) >= 3)
    check("binary noise filtered", not any(r[3] == "binary_sensor.something_else" for r in status["rows"]))
    check("columns", status["columns"] == ["domaine", "nom", "état", "entité"])

    empty = build_house_status([])
    check("empty total 0", empty["total"] == 0)
    check("empty speech no light", "aucune lumière" in empty["speech"])

    zero_light = build_house_status(
        [Entity("media_player.chambre_chambre", "Chambre", "off", None)]
    )
    check("zero light speech", "aucune lumière" in zero_light["speech"])

    print("=== ALL PASS ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
