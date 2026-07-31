"""Smoke test Bus — back-pressure et politiques de signal, horloge simulée.

Ce sont les cas qu'on ne peut pas vérifier « à l'œil » et qui cassent en prod :
un geste maintenu qui part en rafale de clics, une main qui tremble sur le
seuil, une queue qui gonfle sans limite. Horloge injectée → déterministe, zéro
`sleep`, zéro caméra.

    python -m jarvis_core._smoke_bus
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.bus import Bus, Mode  # noqa: E402


class Clock:
    """Horloge manuelle — les politiques dépendent du temps, pas du hasard."""

    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t

    def advance_ms(self, ms: float) -> None:
        self.t += ms / 1000.0


def _burst(bus: Bus, kind: str, clock: Clock, values, *, fps: int = 30, **extra) -> int:
    emitted = 0
    for value in values:
        if bus.publish(kind, {"confidence": value, **extra}):
            emitted += 1
        clock.advance_ms(1000 / fps)
    return emitted


def main() -> None:
    # 1. Geste maintenu = UN événement, pas un par frame.
    clock = Clock()
    bus = Bus(clock=clock)
    bus.subscribe(name="hud")
    held = _burst(bus, "HAND_PINCH", clock, [0.85] * 30, hand="right")
    assert held == 1, f"pincement tenu 1 s → {held} events (attendu 1)"

    # 2. Hystérésis : trembler autour de enter=0.7 ne doit pas mitrailler.
    clock = Clock()
    bus = Bus(clock=clock)
    bus.subscribe(name="hud")
    jitter = [0.68, 0.72, 0.69, 0.71, 0.67, 0.73, 0.66, 0.74, 0.69, 0.72]
    chatter = _burst(bus, "HAND_PINCH", clock, jitter, hand="right")
    assert chatter == 1, f"tremblement sur le seuil → {chatter} events (attendu 1)"

    # 3. Il faut vraiment relâcher (< exit) pour réarmer.
    clock = Clock()
    bus = Bus(clock=clock)
    bus.subscribe(name="hud")
    cycle = _burst(bus, "HAND_PINCH", clock, [0.9] * 10 + [0.1] * 10 + [0.9] * 10, hand="right")
    assert cycle == 2, f"pince/relâche/pince → {cycle} events (attendu 2)"

    # 4. Les deux mains ont des machines à états séparées.
    clock = Clock()
    bus = Bus(clock=clock)
    bus.subscribe(name="hud")
    hands = 0
    for hand in ("left", "right", "left", "right"):
        if bus.publish("HAND_PINCH", {"hand": hand, "confidence": 0.9}):
            hands += 1
        clock.advance_ms(10)
    assert hands == 2, f"gauche+droite → {hands} events (attendu 2)"

    # 5. Coordonnées continues : la dernière valeur, pas les 60 précédentes.
    clock = Clock()
    bus = Bus(clock=clock)
    sub = bus.subscribe(name="hud")
    for i in range(60):
        bus.publish("HAND_POINT", {"hand": "right", "x": i, "y": 0})
        clock.advance_ms(16)
    assert len(sub) == 1, f"60 positions → {len(sub)} en attente (attendu 1)"
    assert sub.get_nowait().payload["x"] == 59, "coalescing doit garder la dernière"

    # 6. Queue bornée : rafale non bornée, mémoire bornée, les vieux partent.
    clock = Clock()
    bus = Bus(clock=clock)
    sub = bus.subscribe(["SYS"], maxsize=64, name="lent")
    for i in range(5000):
        bus.publish("SYS", {"i": i})
    assert len(sub) == 64, f"plafond non respecté : {len(sub)}"
    assert sub.dropped == 5000 - 64
    assert sub.get_nowait().payload["i"] == 4936, "on jette le plus ancien, pas le plus récent"

    # 7. Throttle serveur : on ne fait pas confiance au débit du client.
    clock = Clock()
    bus = Bus(clock=clock)
    bus.subscribe(name="hud")
    passed = 0
    for _ in range(30):
        if bus.publish("FACE_FRAME", {}):
            passed += 1
        clock.advance_ms(1000 / 30)
    assert 5 <= passed <= 8, f"30 frames / fenêtre 150 ms → {passed} passées"

    # 8. La sensibilité utilisateur pilote les seuils.
    bus = Bus(clock=Clock())
    bus.apply_gesture_profile({"sensitivity": 0.2})
    low = bus.policies["HAND_PINCH"]
    bus.apply_gesture_profile({"sensitivity": 1.0})
    high = bus.policies["HAND_PINCH"]
    assert low.mode is Mode.EDGE and high.mode is Mode.EDGE
    assert high.enter < low.enter, "plus sensible = déclenche plus tôt"
    assert high.cooldown_ms < low.cooldown_ms, "plus sensible = réarme plus vite"
    assert low.enter - low.exit > 0.2, "l'hystérésis ne doit jamais disparaître"

    # 9. Un abonné cassé ne fait pas tomber publish().
    bus = Bus(clock=Clock())
    broken = bus.subscribe(name="cassé")
    broken.offer = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))  # type: ignore[method-assign]
    healthy = bus.subscribe(name="sain")
    assert bus.publish("SYS", {"i": 1}) is not None
    assert len(healthy) == 1, "un abonné cassé a privé les autres"

    # Console Windows en cp1252 : sortie ASCII, comme auth/_smoke.py.
    print("OK - bus smoke passed")
    print("  geste tenu 30 frames -> 1 event | tremblement -> 1 | pince/relache/pince -> 2")
    print("  60 coordonnees -> 1 (la derniere) | 5000 events -> 64 en RAM | 30 frames -> 6")


if __name__ == "__main__":
    main()
