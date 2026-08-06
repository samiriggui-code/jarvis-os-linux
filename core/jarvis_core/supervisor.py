"""Superviseur — registre de composants, heartbeat, circuit breaker.

Répond à « un process qui meurt et personne ne le sait ». Trois règles, et la
première est la plus importante :

**Il signale, il ne redémarre pas.** systemd redémarre (`Restart=on-failure`).
Deux superviseurs qui se battent pour relancer la même brique, c'est pire que
zéro : boucles de redémarrage croisées et logs illisibles.

**Il n'émet que sur transition.** Sonder toutes les 5 s et diffuser à chaque
fois, c'est 12 messages/minute de bruit par composant. Le HUD veut savoir
*quand ça change*, pas être tenu au courant que tout va toujours bien.

**Il arrête de marteler.** Après 3 échecs consécutifs le composant passe
`degraded` et l'intervalle double jusqu'à un plafond. Un voicebox éteint ne doit
pas générer un timeout HTTP toutes les 5 s pour l'éternité.

En prime : `sd_notify` (watchdog systemd). Ça couvre le cas que `Restart=` ne
couvre pas — le Core qui **se fige** au lieu de mourir. Inactif hors systemd,
donc no-op en dev sous Windows.
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

logger = logging.getLogger("jarvis.supervisor")

#: Une sonde répond `True` (en service), `False` (en panne) ou `None`
#: (« je n'ai pas d'avis » — état laissé inchangé, cf. `_check_one`).
CheckFn = Callable[[], Awaitable[bool | None]]

UNKNOWN = "unknown"
LOADING = "loading"
READY = "ready"
DEGRADED = "degraded"

FAILURES_BEFORE_DEGRADED = 3
BACKOFF_FACTOR = 2.0
MAX_INTERVAL_S = 120.0
CHECK_TIMEOUT_S = 5.0


@dataclass
class Component:
    """Une brique surveillée. `critical` ne sert qu'à l'affichage : le
    superviseur ne tue rien, et JARVIS BASE doit survivre à tout."""

    name: str
    check: CheckFn
    interval_s: float = 5.0
    critical: bool = False
    state: str = UNKNOWN
    error: str | None = None
    # -inf : un composant fraîchement enregistré est dû tout de suite, sinon il
    # resterait « unknown » pendant tout son premier intervalle.
    last_check: float = float("-inf")
    last_ok: float | None = None
    failures: int = 0
    checks: int = 0
    transitions: int = 0
    _interval_now: float = field(default=0.0, repr=False)

    def __post_init__(self) -> None:
        self._interval_now = self.interval_s

    def due(self, now: float) -> bool:
        return (now - self.last_check) >= self._interval_now

    def status(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "state": self.state,
            "error": self.error,
            "critical": self.critical,
            "failures": self.failures,
            "checks": self.checks,
            "transitions": self.transitions,
            "interval_s": round(self._interval_now, 1),
            "age_s": None if self.last_ok is None else round(self.last_check - self.last_ok, 1),
        }


class Supervisor:
    """Boucle unique de heartbeat. Publie sur le bus, ne touche à rien d'autre."""

    def __init__(
        self,
        emit: Callable[[str, dict[str, Any]], Any] | None = None,
        *,
        clock: Callable[[], float] = time.monotonic,
        tick_s: float = 1.0,
    ) -> None:
        self._emit = emit
        self._clock = clock
        self.tick_s = tick_s
        self.components: dict[str, Component] = {}
        self._task: asyncio.Task[None] | None = None
        self._watchdog = SystemdWatchdog()

    # -- registre ------------------------------------------------------------

    def register(
        self,
        name: str,
        check: CheckFn,
        *,
        interval_s: float = 5.0,
        critical: bool = False,
        state: str = UNKNOWN,
    ) -> Component:
        comp = Component(
            name=name, check=check, interval_s=interval_s, critical=critical, state=state
        )
        self.components[name] = comp
        logger.info("surveille « %s » toutes les %.0f s", name, interval_s)
        return comp

    def note(self, name: str, state: str, error: str | None = None) -> None:
        """État poussé de l'extérieur : chargement en cours, sonde de boot…

        Contrairement au heartbeat, c'est une observation *certaine* : on ne
        tolère pas 3 blips avant de dégrader. Et un composant déjà connu comme
        mort part directement en backoff — inutile de le sonder toutes les 15 s.
        """
        comp = self.components.get(name)
        if comp is None:
            return
        now = self._clock()
        if state == DEGRADED:
            comp.failures = max(comp.failures, FAILURES_BEFORE_DEGRADED)
            comp._interval_now = min(comp.interval_s * BACKOFF_FACTOR, MAX_INTERVAL_S)
            comp.last_check = now
        elif state == READY:
            comp.failures = 0
            comp.last_ok = now
            comp._interval_now = comp.interval_s
        self._transition(comp, state, error)

    # -- boucle --------------------------------------------------------------

    async def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _loop(self) -> None:
        self._watchdog.ready()
        while True:
            try:
                await self.tick()
                self._watchdog.ping()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — la boucle ne meurt jamais
                logger.exception("tick superviseur : %s", exc)
            await asyncio.sleep(self.tick_s)

    async def tick(self) -> None:
        """Sonde les composants dus. Exposé pour les tests (horloge simulée)."""
        now = self._clock()
        due = [c for c in self.components.values() if c.due(now)]
        if not due:
            return
        await asyncio.gather(*(self._check_one(c, now) for c in due))

    async def _check_one(self, comp: Component, now: float) -> None:
        comp.last_check = now
        comp.checks += 1
        try:
            ok = await asyncio.wait_for(comp.check(), timeout=CHECK_TIMEOUT_S)
            error = None
        except asyncio.TimeoutError:
            ok, error = False, f"pas de réponse en {CHECK_TIMEOUT_S:.0f} s"
        except Exception as exc:  # noqa: BLE001 — un check cassé = composant KO
            ok, error = False, str(exc)

        # `None` = la sonde n'a PAS d'avis, ce qui n'est pas « en panne ».
        #
        # Le cas type est HOLOMAT VISION : le flux caméra vit dans le
        # navigateur, le Core ne peut que relire ce que le HUD lui rapporte.
        # Tant que rien n'a été rapporté — Core lancé sans navigateur, page pas
        # encore ouverte — il n'y a aucune raison d'annoncer une avarie. La
        # brique reste simplement « inconnue », et la checklist le montre en
        # gris plutôt qu'en rouge.
        #
        # Sans ce troisième cas, l'arbitrage caméra rendait la ligne
        # définitivement rouge : une caméra volontairement éteinte entre deux
        # usages devenait une panne permanente.
        if ok is None:
            return

        if ok:
            comp.failures = 0
            comp.last_ok = now
            comp._interval_now = comp.interval_s
            self._transition(comp, READY, None)
            return

        comp.failures += 1
        if comp.failures >= FAILURES_BEFORE_DEGRADED:
            # Circuit ouvert : on espace au lieu de marteler.
            comp._interval_now = min(comp._interval_now * BACKOFF_FACTOR, MAX_INTERVAL_S)
            self._transition(comp, DEGRADED, error)
        else:
            comp.error = error

    def _transition(self, comp: Component, state: str, error: str | None) -> None:
        if comp.state == state:
            comp.error = error
            return
        previous = comp.state
        comp.state = state
        comp.error = error
        comp.transitions += 1
        level = logger.warning if state == DEGRADED else logger.info
        level("« %s » %s → %s%s", comp.name, previous, state, f" ({error})" if error else "")
        if self._emit is not None:
            self._emit("component_state", {
                "component": comp.name,
                "state": state,
                "previous": previous,
                **comp.status(),
            })

    def emit_one(self, name: str, state: str | None = None) -> None:
        """Diffuse l'état d'UNE brique, à la demande.

        Sert au cadencement du démarrage parlé : la séquence révèle chaque
        ligne au moment de sa phrase plutôt que de recevoir les six d'un bloc
        (cf. `replay(exclude=…)`). `state` force la valeur annoncée — « loading »
        pendant qu'on parle de la brique — sans toucher à l'état réel tenu par
        les sondes, qui reste la seule vérité.
        """
        comp = self.components.get(name)
        if comp is None or self._emit is None:
            return
        self._emit("component_state", {
            "component": comp.name,
            "state": state or comp.state,
            "previous": comp.state,
            "revealed": True,
            **{k: v for k, v in comp.status().items() if k != "state"},
        })

    def replay(self, exclude: set[str] | None = None) -> None:
        """Réémet l'état de chaque brique, même inchangé.

        ⚠ Sans ceci, un HUD qui se connecte APRÈS le démarrage du Core ne voit
        jamais les briques déjà prêtes : `_transition` ne parle que sur
        changement, et un composant passé `unknown → ready` il y a dix minutes
        ne rebasculera plus. La checklist restait donc grise pour tout ce qui
        fonctionnait, et seule une brique ayant la malchance de changer d'état
        pendant qu'on regardait s'allumait.

        Avec la cinématique de démarrage, le HUD arrive presque une minute
        après le Core : le cas n'est pas un détail, c'est le cas NOMINAL.

        On rejoue l'état, on ne resonde pas : une resonde synchrone ferait
        attendre le HUD au pire moment, juste quand la checklist doit se
        remplir. Les sondes suivent leur propre rythme, elles corrigeront.

        `exclude` retient les briques que quelqu'un d'autre va révéler à son
        rythme — le démarrage parlé, qui allume chaque ligne sur sa phrase.
        Sans cette réserve, le rejeu en bloc les allumait toutes avant que la
        première phrase ne soit prononcée.
        """
        if self._emit is None:
            return
        held = exclude or set()
        for comp in self.components.values():
            if comp.name in held:
                continue
            self._emit("component_state", {
                "component": comp.name,
                "state": comp.state,
                "previous": comp.state,
                "replayed": True,
                **comp.status(),
            })
        logger.info("état rejoué pour %d brique(s) — nouveau client", len(self.components))

    # -- observabilité -------------------------------------------------------

    def status(self) -> dict[str, Any]:
        comps = [c.status() for c in self.components.values()]
        degraded = [c["name"] for c in comps if c["state"] == DEGRADED]
        return {
            "ok": not degraded,
            "degraded": degraded,
            "watchdog": self._watchdog.status(),
            "components": comps,
        }


class SystemdWatchdog:
    """`sd_notify` sans dépendance. Silencieux hors systemd.

    Couvre le Core **figé**, que `Restart=on-failure` ne voit pas : plus de
    `WATCHDOG=1` → systemd le tue et le relance.
    """

    def __init__(self) -> None:
        self.address = os.environ.get("NOTIFY_SOCKET") or ""
        usec = os.environ.get("WATCHDOG_USEC") or "0"
        try:
            self.interval_s = int(usec) / 2_000_000.0  # moitié du délai, comme recommandé
        except ValueError:
            self.interval_s = 0.0
        self.enabled = bool(self.address) and self.interval_s > 0
        self._last = 0.0
        self._sock: socket.socket | None = None
        if self.enabled:
            logger.info("watchdog systemd actif · ping toutes les %.1f s", self.interval_s)

    def _send(self, message: str) -> None:
        if not self.address:
            return
        try:
            if self._sock is None:
                self._sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
            # « @ » en tête = espace de noms abstrait Linux → octet nul.
            addr = "\0" + self.address[1:] if self.address.startswith("@") else self.address
            self._sock.sendto(message.encode("utf-8"), addr)
        except Exception as exc:  # noqa: BLE001 — jamais bloquant
            logger.debug("sd_notify %r : %s", message, exc)

    def ready(self) -> None:
        if self.address:
            self._send("READY=1")

    def ping(self) -> None:
        if not self.enabled:
            return
        now = time.monotonic()
        if now - self._last < self.interval_s:
            return
        self._last = now
        self._send("WATCHDOG=1")

    def status(self) -> dict[str, Any]:
        return {"enabled": self.enabled, "interval_s": round(self.interval_s, 1)}


def http_check(url: str, *, timeout: float = 3.0) -> CheckFn:
    """Check générique GET → 2xx. Pour Hermes (:8642) et tout service HTTP."""

    async def check() -> bool:
        from urllib import request as urlrequest

        def _get() -> int:
            req = urlrequest.Request(url, method="GET")
            with urlrequest.urlopen(req, timeout=timeout) as resp:
                return int(resp.status)

        return 200 <= await asyncio.to_thread(_get) < 300

    return check
