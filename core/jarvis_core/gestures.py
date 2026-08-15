"""Gestes discrétisés → actions HUD, selon les bindings de l'utilisateur.

Le HUD est un **capteur**, pas un décideur : il envoie des *confidences* par
frame (« pincement à 0.82, poing à 0.03 ») et laisse le Core trancher. Trois
raisons de ne pas discrétiser côté client :

1. Les seuils sont une préférence (`gesture_profile.sensitivity`) — ils vivent
   avec le profil utilisateur, pas dans le bundle React.
2. Les bindings sont stockés côté Core et changent sans rebuild du HUD.
3. Un second producteur (lunettes, caméra native) doit hériter des mêmes
   règles sans les réimplémenter. C'est déjà le pari tenu par `FACE_FRAME`,
   dont la politique THROTTLE existe « parce qu'on ne fait pas confiance au
   client » (`bus.py`).

Le bus fait donc le front montant — `Mode.EDGE`, hystérésis, cooldown. Ce
module n'intervient qu'après : traduire un `HAND_*` déjà discrétisé en action
nommée, et rien de plus.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from .bus import Bus, Event

logger = logging.getLogger("jarvis.gestures")

# Un `HAND_*` déjà discrétisé → l'id de binding correspondant.
BINDING_OF_KIND: dict[str, str] = {
    "HAND_PINCH": "pinch",
    "HAND_OPEN": "open_hand",
    "HAND_FIST": "fist",
    "HAND_PEACE": "peace",
    "HAND_POSE_POINT": "point",
}

# `HAND_SWIPE` porte sa direction dans le payload : quatre bindings, un kind.
BINDING_OF_SWIPE: dict[str, str] = {
    "left": "swipe_left",
    "right": "swipe_right",
    "up": "swipe_up",
    "down": "swipe_down",
}

WATCHED: tuple[str, ...] = (*BINDING_OF_KIND, "HAND_SWIPE")


def binding_id_for(event: Event) -> str | None:
    """Id de binding visé par un geste, ou None s'il n'en vise aucun.

    `HAND_POINT` est **volontairement** absent : c'est le flux du curseur
    (`Mode.COALESCE`, 30 fois par seconde), pas un geste discret.

    `HAND_POSE_POINT` porte l'index levé (autres doigts repliés) : geste
    discret mappé au binding `point` → `activate_voice`. Ne pas confondre
    avec le curseur continu.
    """
    if event.kind == "HAND_SWIPE":
        direction = str(event.payload.get("direction", "")).strip().lower()
        return BINDING_OF_SWIPE.get(direction)
    return BINDING_OF_KIND.get(event.kind)


class GestureRouter:
    """Abonné bus : `HAND_*` → `GESTURE_DETECTED {gestureId, action}`.

    Les bindings sont relus à la demande et mis en cache : un geste résolu ne
    doit pas coûter une lecture de fichier, mais un profil réenregistré doit
    prendre effet sans relancer le Core (`invalidate()`).
    """

    def __init__(self, bus: Bus, load_profile: Callable[[], dict[str, Any]]) -> None:
        self.bus = bus
        self._load_profile = load_profile
        self._cache: dict[str, dict[str, Any]] | None = None
        self.resolved = 0
        self.unbound = 0
        self.disabled = 0

    # -- bindings ------------------------------------------------------------

    def invalidate(self) -> None:
        """Le profil a changé — relire au prochain geste."""
        self._cache = None

    def _bindings(self) -> dict[str, dict[str, Any]]:
        if self._cache is not None:
            return self._cache
        try:
            profile = self._load_profile() or {}
        except Exception as exc:  # noqa: BLE001 — profil illisible ≠ Core mort
            logger.warning("profil gestuel illisible, aucun binding : %s", exc)
            self._cache = {}
            return self._cache

        table: dict[str, dict[str, Any]] = {}
        for binding in profile.get("bindings") or []:
            if isinstance(binding, dict) and binding.get("id"):
                table[str(binding["id"])] = binding
        self._cache = table
        return table

    # -- routage -------------------------------------------------------------

    def route(self, event: Event) -> dict[str, Any] | None:
        """Résout un geste en action. Retourne le payload émis, ou None.

        Séparé de `run()` pour être testable sans boucle ni bus vivant.
        """
        gesture_id = binding_id_for(event)
        if gesture_id is None:
            self.unbound += 1
            return None

        binding = self._bindings().get(gesture_id)
        if binding is None:
            self.unbound += 1
            logger.debug("geste %s sans binding dans le profil", gesture_id)
            return None

        if not binding.get("enabled", True):
            self.disabled += 1
            return None

        action = str(binding.get("action") or "").strip()
        if not action:
            self.unbound += 1
            return None

        payload: dict[str, Any] = {
            "gestureId": gesture_id,
            "action": action,
            "label": binding.get("label"),
            "hand": event.payload.get("hand"),
        }
        if event.kind == "HAND_SWIPE":
            payload["direction"] = event.payload.get("direction")

        self.resolved += 1
        self.bus.publish("GESTURE_DETECTED", payload, source="gestures")
        logger.info("geste %s → %s", gesture_id, action)
        return payload

    async def run(self) -> None:
        """Boucle infinie. Un geste mal formé ne ferme pas le robinet."""
        sub = self.bus.subscribe(WATCHED, name="gestures", maxsize=32)
        logger.info("routeur gestuel armé sur %s", ", ".join(WATCHED))
        while True:
            event = await sub.get()
            try:
                self.route(event)
            except Exception as exc:  # noqa: BLE001
                logger.warning("routage geste (%s) : %s", event.kind, exc)

    def stats(self) -> dict[str, Any]:
        return {
            "resolved": self.resolved,
            "unbound": self.unbound,
            "disabled": self.disabled,
            "cached": self._cache is not None,
        }


# -- normalisation des signaux bruts du HUD ----------------------------------

HANDS = ("left", "right")


def _unit(raw: Any) -> float | None:
    """Valeur bornée [0,1] — confiance ou coordonnée —, None si non numérique.

    Le HUD est local mais pas fiable pour autant : une confiance à 12.0
    passerait l'hystérésis à chaque frame et laisserait le cooldown seul juge.
    """
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value != value:  # NaN — `NaN > enter` est faux, mais `NaN <= exit` aussi
        return None
    return min(max(value, 0.0), 1.0)


def signals_from_hud(data: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Message `type: gesture` du HUD → liste de `(kind, payload)` à publier.

    Un signal absent n'est pas « à zéro », il est *non mesuré* : publier 0.0
    réarmerait l'hystérésis à tort. On ne publie donc que ce qui est là.
    """
    hand = str(data.get("hand", "right")).strip().lower()
    if hand not in HANDS:
        hand = "right"

    out: list[tuple[str, dict[str, Any]]] = []

    for field, kind in (
        ("pinch", "HAND_PINCH"),
        ("fist", "HAND_FIST"),
        ("open", "HAND_OPEN"),
        ("peace", "HAND_PEACE"),
        ("point_pose", "HAND_POSE_POINT"),
    ):
        if field not in data:
            continue
        confidence = _unit(data.get(field))
        if confidence is not None:
            out.append((kind, {"hand": hand, "confidence": confidence}))

    swipe = data.get("swipe")
    if isinstance(swipe, dict):
        direction = str(swipe.get("direction", "")).strip().lower()
        confidence = _unit(swipe.get("confidence"))
        if direction in BINDING_OF_SWIPE and confidence is not None:
            out.append((
                "HAND_SWIPE",
                {"hand": hand, "direction": direction, "confidence": confidence},
            ))

    cursor = data.get("cursor")
    if not isinstance(cursor, dict):
        cursor = data.get("point")
    if isinstance(cursor, dict):
        x = _unit(cursor.get("x"))
        y = _unit(cursor.get("y"))
        if x is not None and y is not None:
            out.append(("HAND_POINT", {"hand": hand, "x": x, "y": y}))

    return out
