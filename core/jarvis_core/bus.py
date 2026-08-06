"""Bus d'événements interne — pub/sub asyncio à queues bornées.

Pas de broker externe (Redis, MQTT) : « JARVIS BASE doit survivre sans HUD / IA
/ domotique » (CLAUDE.md). Un broker en plus, c'est une brique de plus qui peut
tomber et emporter le socle.

Le point dur n'est pas le transport, c'est la **back-pressure**. Un producteur
en rafale — MediaPipe qui sort 30 mains/seconde — ne doit ni gonfler la RAM ni
bloquer un consommateur lent. Deux mécanismes séparés, à deux endroits :

**À la publication : la politique de signal.** Un `HAND_PINCH` n'est pas « la
main est en position pincée », c'est la *transition* ouvert → pincé. Sans
détection de front, un pincement maintenu 1 s = 30 clics. Sans hystérésis, une
main qui tremble autour du seuil en génère autant. → `Mode.EDGE`.

**À la livraison : la queue bornée.** `maxsize` fini + abandon du plus ancien.
C'est structurel : aucun producteur ne peut faire exploser la mémoire, et un
consommateur lent perd des événements *vieux* au lieu de prendre du retard.

Les coordonnées continues (`HAND_POINT`) ne veulent ni l'un ni l'autre : elles
veulent la **dernière** valeur, pas les 30 précédentes. → `Mode.COALESCE`,
qui remplace l'événement en attente au lieu d'en empiler un nouveau.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Iterable

logger = logging.getLogger("jarvis.bus")

DEFAULT_MAXSIZE = 64


class Mode(str, Enum):
    PASS = "pass"
    """Tout passe — événements discrets et rares (auth, système)."""

    EDGE = "edge"
    """Fronts montants avec hystérésis + cooldown — gestes discrets."""

    THROTTLE = "throttle"
    """Au plus un par fenêtre — flux qu'on échantillonne (frames visage)."""

    COALESCE = "coalesce"
    """Garder la dernière valeur en attente — coordonnées continues."""


@dataclass(frozen=True)
class Event:
    kind: str
    payload: dict[str, Any] = field(default_factory=dict)
    source: str = "core"
    ts: float = 0.0
    seq: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.kind,
            "source": self.source,
            "seq": self.seq,
            **self.payload,
        }


@dataclass
class RatePolicy:
    """Comment traiter un `kind` à la publication.

    `key_field` sépare les machines à états : les gestes sont indexés par main
    (`hand`), sinon un pincement de la main droite bloquerait la gauche.
    """

    mode: Mode = Mode.PASS
    enter: float = 0.7
    exit: float = 0.4
    cooldown_ms: float = 300.0
    window_ms: float = 100.0
    value_field: str = "confidence"
    key_field: str | None = None
    emit_release: bool = False

    def key_for(self, event: Event) -> str:
        if not self.key_field:
            return event.kind
        return f"{event.kind}:{event.payload.get(self.key_field, '_')}"


# Politiques par défaut. Les seuils gestuels sont écrasés par
# `gesture_profile.sensitivity` de l'utilisateur (cf. auth/profiles.py).
DEFAULT_POLICIES: dict[str, RatePolicy] = {
    # Gestes discrets = un événement par transition, pas par frame.
    "HAND_PINCH": RatePolicy(mode=Mode.EDGE, key_field="hand"),
    "HAND_FIST": RatePolicy(mode=Mode.EDGE, key_field="hand"),
    "HAND_OPEN": RatePolicy(mode=Mode.EDGE, key_field="hand"),
    # Résolu par `gestures.py` À PARTIR d'un HAND_* déjà discrétisé : refaire
    # un front ici l'émettrait une seule fois, puis plus jamais. `_allow` lit
    # `confidence` avec 1.0 par défaut, et le réarmement exige `value <= exit`
    # — un payload sans confiance reste donc désarmé à vie. La discrétisation
    # a eu lieu en amont ; ici on laisse passer.
    "GESTURE_DETECTED": RatePolicy(mode=Mode.PASS, key_field="gestureId"),
    # Balayages : mouvement bref, cooldown plus long pour éviter le double-tir.
    "HAND_SWIPE": RatePolicy(mode=Mode.EDGE, cooldown_ms=600.0, key_field="hand"),
    # Position du curseur : seule la dernière compte.
    "HAND_POINT": RatePolicy(mode=Mode.COALESCE, key_field="hand"),
    # Charge machine : seul le dernier relevé a un sens. Un HUD qui se
    # reconnecte veut l'état actuel, pas la file des dix précédents.
    #
    # `key_field="host"` est indispensable, pas cosmétique : le HUD tourne sur
    # le NUC et agrège tout l'écosystème (NUC, VPS, Pi, ProLiant, portable).
    # Sans clé, le relevé du VPS écraserait celui du NUC en attente — même
    # piège que les deux mains sur HAND_PINCH.
    "SYSTEM_METRICS": RatePolicy(mode=Mode.COALESCE, key_field="host"),
    "BODY_POSE": RatePolicy(mode=Mode.COALESCE),
    "EYE_GAZE": RatePolicy(mode=Mode.COALESCE),
    # Frames visage : le HUD limite déjà à ~5 fps, mais on ne fait pas
    # confiance au client — un producteur natif n'aura pas ce throttle.
    "FACE_FRAME": RatePolicy(mode=Mode.THROTTLE, window_ms=150.0),
}


class Subscription:
    """Queue bornée d'un consommateur. Jette le plus ancien, ne bloque jamais."""

    def __init__(
        self,
        kinds: Iterable[str] | None,
        *,
        maxsize: int = DEFAULT_MAXSIZE,
        name: str = "anon",
        coalesce_keys: bool = True,
    ) -> None:
        self.kinds = set(kinds) if kinds else None  # None = tout
        self.maxsize = maxsize
        self.name = name
        self.coalesce_keys = coalesce_keys
        self.dropped = 0
        self.coalesced = 0
        self.delivered = 0
        self._items: deque[tuple[str, Event]] = deque()
        self._waiter: asyncio.Future[None] | None = None

    def accepts(self, kind: str) -> bool:
        return self.kinds is None or kind in self.kinds

    def offer(self, event: Event, *, coalesce_key: str | None) -> None:
        """Dépose sans jamais attendre. Appelé depuis publish()."""
        if coalesce_key is not None and self.coalesce_keys:
            for i, (key, _) in enumerate(self._items):
                if key == coalesce_key:
                    self._items[i] = (key, event)  # la dernière valeur gagne
                    self.coalesced += 1
                    self._wake()
                    return

        if len(self._items) >= self.maxsize:
            self._items.popleft()
            self.dropped += 1
            if self.dropped in (1, 10, 100) or self.dropped % 1000 == 0:
                logger.warning(
                    "bus « %s » saturé — %d événement(s) abandonné(s)",
                    self.name,
                    self.dropped,
                )
        self._items.append((coalesce_key or "", event))
        self._wake()

    def _wake(self) -> None:
        if self._waiter is not None and not self._waiter.done():
            self._waiter.set_result(None)

    async def get(self) -> Event:
        while not self._items:
            self._waiter = asyncio.get_running_loop().create_future()
            await self._waiter
            self._waiter = None
        self.delivered += 1
        return self._items.popleft()[1]

    def get_nowait(self) -> Event | None:
        if not self._items:
            return None
        self.delivered += 1
        return self._items.popleft()[1]

    def __len__(self) -> int:
        return len(self._items)

    def stats(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "pending": len(self._items),
            "maxsize": self.maxsize,
            "delivered": self.delivered,
            "dropped": self.dropped,
            "coalesced": self.coalesced,
        }


class Bus:
    """Pub/sub in-process. `publish()` ne bloque ni ne lève jamais."""

    def __init__(
        self,
        policies: dict[str, RatePolicy] | None = None,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.policies = dict(DEFAULT_POLICIES if policies is None else policies)
        self._clock = clock
        self._subs: list[Subscription] = []
        self._seq = 0
        # état des machines EDGE / THROTTLE, par clé de politique
        self._armed: dict[str, bool] = {}
        self._last_emit: dict[str, float] = {}
        self.published = 0
        self.suppressed = 0

    # -- abonnement ----------------------------------------------------------

    def subscribe(
        self,
        kinds: Iterable[str] | None = None,
        *,
        maxsize: int = DEFAULT_MAXSIZE,
        name: str = "anon",
    ) -> Subscription:
        sub = Subscription(kinds, maxsize=maxsize, name=name)
        self._subs.append(sub)
        return sub

    def unsubscribe(self, sub: Subscription) -> None:
        if sub in self._subs:
            self._subs.remove(sub)

    def set_policy(self, kind: str, policy: RatePolicy) -> None:
        self.policies[kind] = policy
        # Repartir propre : d'anciens seuils ne doivent pas rester armés.
        prefix = f"{kind}:"
        for store in (self._armed, self._last_emit):
            for key in [k for k in store if k == kind or k.startswith(prefix)]:
                store.pop(key, None)

    def apply_gesture_profile(self, profile: dict[str, Any]) -> None:
        """Traduit `gesture_profile.sensitivity` (0–1) en seuils EDGE.

        Sensibilité haute = seuil d'entrée bas (réagit plus tôt) et cooldown
        court. Un enfant ou une main tremblante veut l'inverse.
        """
        try:
            sensitivity = float(profile.get("sensitivity", 0.7))
        except (TypeError, ValueError):
            return
        sensitivity = min(max(sensitivity, 0.0), 1.0)

        enter = 0.9 - 0.4 * sensitivity          # 0.9 (peu sensible) → 0.5
        exit_ = enter - 0.3                      # hystérésis constante
        cooldown = 500.0 - 300.0 * sensitivity   # 500 ms → 200 ms

        for kind, policy in list(self.policies.items()):
            if policy.mode is not Mode.EDGE:
                continue
            self.set_policy(
                kind,
                RatePolicy(
                    mode=Mode.EDGE,
                    enter=enter,
                    exit=exit_,
                    cooldown_ms=max(cooldown, policy.cooldown_ms if kind == "HAND_SWIPE" else 0.0),
                    window_ms=policy.window_ms,
                    value_field=policy.value_field,
                    key_field=policy.key_field,
                    emit_release=policy.emit_release,
                ),
            )
        logger.info(
            "politiques gestuelles · sensibilité=%.2f → enter=%.2f exit=%.2f cooldown=%.0f ms",
            sensitivity,
            enter,
            exit_,
            cooldown,
        )

    # -- publication ---------------------------------------------------------

    def publish(
        self,
        kind: str,
        payload: dict[str, Any] | None = None,
        *,
        source: str = "core",
    ) -> Event | None:
        """Retourne l'événement livré, ou None s'il a été supprimé.

        Ne lève jamais : un producteur ne doit pas mourir parce qu'un
        consommateur est cassé.
        """
        self._seq += 1
        event = Event(
            kind=kind,
            payload=payload or {},
            source=source,
            ts=self._clock(),
            seq=self._seq,
        )

        policy = self.policies.get(kind, RatePolicy())
        if not self._allow(event, policy):
            self.suppressed += 1
            return None

        coalesce_key = policy.key_for(event) if policy.mode is Mode.COALESCE else None
        self.published += 1
        for sub in self._subs:
            if not sub.accepts(kind):
                continue
            try:
                sub.offer(event, coalesce_key=coalesce_key)
            except Exception as exc:  # noqa: BLE001
                logger.warning("abonné « %s » a rejeté l'événement : %s", sub.name, exc)
        return event

    def _allow(self, event: Event, policy: RatePolicy) -> bool:
        if policy.mode in (Mode.PASS, Mode.COALESCE):
            return True

        key = policy.key_for(event)
        now = event.ts

        if policy.mode is Mode.THROTTLE:
            last = self._last_emit.get(key)
            if last is not None and (now - last) * 1000.0 < policy.window_ms:
                return False
            self._last_emit[key] = now
            return True

        # Mode.EDGE — front montant seulement, avec hystérésis et cooldown.
        try:
            value = float(event.payload.get(policy.value_field, 1.0))
        except (TypeError, ValueError):
            value = 1.0

        armed = self._armed.get(key, True)  # armé = prêt à émettre

        if value <= policy.exit:
            # Retombé sous le seuil bas : on réarme pour le prochain geste.
            self._armed[key] = True
            return False

        if value < policy.enter:
            # Zone morte de l'hystérésis — ni émission ni réarmement.
            return False

        if not armed:
            return False  # geste maintenu : déjà émis

        last = self._last_emit.get(key)
        if last is not None and (now - last) * 1000.0 < policy.cooldown_ms:
            return False

        self._armed[key] = False
        self._last_emit[key] = now
        return True

    # -- observabilité -------------------------------------------------------

    def stats(self) -> dict[str, Any]:
        return {
            "published": self.published,
            "suppressed": self.suppressed,
            "subscribers": [s.stats() for s in self._subs],
        }
