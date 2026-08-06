"""Smoke test gestuel — chaîne complète HUD → bus → bindings, horloge simulée.

`_smoke_bus` prouve que le bus discrétise. Celui-ci prouve que ce qui en sort
devient la bonne action, et surtout qu'un geste **répété** repart : c'est le
piège que `GESTURE_DETECTED` en `Mode.EDGE` faisait tomber en silence — un
premier pincement passait, tous les suivants étaient mangés.

Zéro caméra, zéro sleep, zéro fichier : le profil est injecté.

    python -m jarvis_core._smoke_gestures
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.bus import Bus, Mode  # noqa: E402
from jarvis_core.gestures import GestureRouter, WATCHED, signals_from_hud  # noqa: E402


class Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t

    def advance_ms(self, ms: float) -> None:
        self.t += ms / 1000.0


PROFILE = {
    "sensitivity": 0.7,
    "bindings": [
        {"id": "pinch", "label": "Pincement", "action": "select_or_close", "enabled": True},
        {"id": "open_hand", "label": "Paume", "action": "open_launcher", "enabled": True},
        {"id": "swipe_right", "label": "Droite", "action": "next_panel", "enabled": True},
        {"id": "swipe_left", "label": "Gauche", "action": "prev_panel", "enabled": False},
        {"id": "point", "label": "Index", "action": "activate_voice", "enabled": True},
    ],
}


def rig(profile=PROFILE):
    """Bus + routeur + collecteur d'actions, câblés à la main."""
    clock = Clock()
    bus = Bus(clock=clock)
    router = GestureRouter(bus, lambda: profile)
    watched = bus.subscribe(WATCHED, name="gestures")
    actions = bus.subscribe(["GESTURE_DETECTED"], name="hud")
    return clock, bus, router, watched, actions


def pump(router, watched) -> None:
    """Draine ce que le bus a laissé passer, comme le ferait `run()`."""
    while True:
        event = watched.get_nowait()
        if event is None:
            return
        router.route(event)


def feed(bus, router, watched, clock, frames, *, fps: int = 30) -> None:
    """Rejoue des messages `type: gesture` du HUD, une frame à la fois."""
    for frame in frames:
        for kind, payload in signals_from_hud(frame):
            bus.publish(kind, payload, source="hud")
        pump(router, watched)
        clock.advance_ms(1000 / fps)


def drain(sub) -> list:
    out = []
    while True:
        event = sub.get_nowait()
        if event is None:
            return out
        out.append(event)


def main() -> None:
    # 1. Pincement tenu 1 s = UNE action, pas trente.
    clock, bus, router, watched, actions = rig()
    feed(bus, router, watched, clock, [{"hand": "right", "pinch": 0.85}] * 30)
    got = drain(actions)
    assert len(got) == 1, f"pincement tenu → {len(got)} action(s), attendu 1"
    assert got[0].payload["action"] == "select_or_close", got[0].payload

    # 2. LE cas qui cassait : pincer, relâcher, repincer → DEUX actions.
    #    Avec GESTURE_DETECTED en Mode.EDGE, la seconde était avalée pour
    #    toujours (payload sans `confidence` → value=1.0 → jamais réarmé).
    clock, bus, router, watched, actions = rig()
    cycle = [{"hand": "right", "pinch": v} for v in ([0.9] * 10 + [0.1] * 10 + [0.9] * 10)]
    feed(bus, router, watched, clock, cycle)
    got = drain(actions)
    assert len(got) == 2, f"pincer/relacher/pincer → {len(got)} action(s), attendu 2"

    # 3. Chaque main a sa propre machine à états.
    clock, bus, router, watched, actions = rig()
    feed(bus, router, watched, clock, [
        {"hand": "right", "pinch": 0.9},
        {"hand": "left", "pinch": 0.9},
    ])
    got = drain(actions)
    assert len(got) == 2, "la main gauche a été bloquée par la droite"
    assert {e.payload["hand"] for e in got} == {"left", "right"}

    # 4. La direction du balayage choisit le binding.
    clock, bus, router, watched, actions = rig()
    feed(bus, router, watched, clock, [
        {"hand": "right", "swipe": {"direction": "right", "confidence": 0.95}},
    ])
    got = drain(actions)
    assert len(got) == 1 and got[0].payload["gestureId"] == "swipe_right", got
    assert got[0].payload["action"] == "next_panel"

    # 5. Un binding désactivé ne tire pas.
    clock, bus, router, watched, actions = rig()
    feed(bus, router, watched, clock, [
        {"hand": "right", "swipe": {"direction": "left", "confidence": 0.95}},
    ])
    assert drain(actions) == [], "swipe_left est enabled:false"
    assert router.disabled == 1

    # 6. Le curseur ne déclenche AUCUN binding — sinon bouger la main
    #    activerait la voix en boucle (binding `point` du profil par défaut).
    clock, bus, router, watched, actions = rig()
    feed(bus, router, watched, clock, [
        {"hand": "right", "point": {"x": i / 60, "y": 0.5}} for i in range(60)
    ])
    assert drain(actions) == [], "HAND_POINT a résolu un binding"

    # 7. Le curseur, lui, arrive bien — et coalescé : la dernière position.
    clock, bus, router, watched, _ = rig()
    cursor = bus.subscribe(["HAND_POINT"], name="curseur")
    feed(bus, router, watched, clock, [
        {"hand": "right", "point": {"x": i / 60, "y": 0.5}} for i in range(60)
    ])
    positions = drain(cursor)
    assert len(positions) == 1, f"60 positions → {len(positions)} en attente, attendu 1"
    assert abs(positions[0].payload["x"] - 59 / 60) < 1e-6, "ce n'est pas la dernière"

    # 8. Le HUD n'est pas cru sur parole : bornes et NaN.
    assert signals_from_hud({"hand": "right", "pinch": 12.0})[0][1]["confidence"] == 1.0
    assert signals_from_hud({"hand": "right", "pinch": -3})[0][1]["confidence"] == 0.0
    assert signals_from_hud({"hand": "right", "pinch": float("nan")}) == []
    assert signals_from_hud({"hand": "right", "pinch": "beaucoup"}) == []
    assert signals_from_hud({"hand": "gauche", "pinch": 0.9})[0][1]["hand"] == "right"

    # 9. Un signal absent n'est pas « à zéro » : publier 0.0 réarmerait
    #    l'hystérésis à tort, et le geste suivant repartirait trop tôt.
    kinds = [k for k, _ in signals_from_hud({"hand": "right", "pinch": 0.9})]
    assert kinds == ["HAND_PINCH"], kinds

    # 10. Un profil réenregistré prend effet sans relancer le Core.
    mutable = {"bindings": [{"id": "pinch", "action": "select_or_close", "enabled": True}]}
    clock, bus, router, watched, actions = rig(mutable)
    feed(bus, router, watched, clock, [{"hand": "right", "pinch": 0.9}])
    assert len(drain(actions)) == 1
    mutable["bindings"] = [{"id": "pinch", "action": "open_launcher", "enabled": True}]
    router.invalidate()
    clock.advance_ms(1000)
    feed(bus, router, watched, clock, [{"hand": "right", "pinch": 0.1}, {"hand": "right", "pinch": 0.9}])
    got = drain(actions)
    assert got and got[-1].payload["action"] == "open_launcher", "cache non invalidé"

    # 11. La sensibilité pilote toujours les seuils après notre changement de
    #     politique — GESTURE_DETECTED ne doit PAS être repassé en EDGE.
    bus = Bus(clock=Clock())
    bus.apply_gesture_profile({"sensitivity": 1.0})
    assert bus.policies["GESTURE_DETECTED"].mode is Mode.PASS, \
        "GESTURE_DETECTED réarmé en EDGE : le 2e geste sera avalé"
    assert bus.policies["HAND_PINCH"].mode is Mode.EDGE

    print("OK - gestures smoke passed")
    print("  pincement tenu -> 1 action | pincer/relacher/pincer -> 2 | 2 mains -> 2")
    print("  swipe droite -> next_panel | binding off -> rien | curseur -> 0 binding")
    print("  60 positions -> 1 coalescee | HUD borne [0,1] | profil recharge a chaud")


if __name__ == "__main__":
    main()
