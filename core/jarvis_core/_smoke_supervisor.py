"""Smoke test Superviseur — transitions, circuit breaker, backoff.

Horloge simulée et checks factices : ce qu'on veut prouver est temporel
(« après 3 échecs on espace »), donc surtout pas de `sleep`.

    python -m jarvis_core._smoke_supervisor
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.supervisor import (  # noqa: E402
    BACKOFF_FACTOR,
    DEGRADED,
    FAILURES_BEFORE_DEGRADED,
    MAX_INTERVAL_S,
    READY,
    Supervisor,
)


class Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t

    def advance(self, s: float) -> None:
        self.t += s


async def main() -> None:
    clock = Clock()
    events: list[dict] = []
    sup = Supervisor(emit=lambda kind, p: events.append(p), clock=clock)

    alive = {"ok": True}

    async def check() -> bool:
        return alive["ok"]

    comp = sup.register("voicebox", check, interval_s=5.0)

    # 1. Premier succès = une transition unknown → ready.
    await sup.tick()
    assert comp.state == READY, comp.state
    assert len(events) == 1, f"{len(events)} events (attendu 1)"

    # 2. Tout va bien : on n'inonde pas le bus.
    for _ in range(20):
        clock.advance(5.0)
        await sup.tick()
    assert len(events) == 1, f"{len(events)} events pour 21 sondes OK (attendu 1)"
    assert comp.checks == 21

    # 3. Il faut 3 échecs pour dégrader — pas un blip réseau.
    alive["ok"] = False
    for i in range(FAILURES_BEFORE_DEGRADED - 1):
        clock.advance(5.0)
        await sup.tick()
        assert comp.state == READY, f"dégradé après {i+1} échec(s), trop tôt"
    clock.advance(5.0)
    await sup.tick()
    assert comp.state == DEGRADED, comp.state
    assert len(events) == 2, f"{len(events)} events (attendu 2 : ready puis degraded)"

    # 4. Circuit ouvert : l'intervalle grandit au lieu de marteler.
    before = comp._interval_now
    clock.advance(before)
    await sup.tick()
    assert comp._interval_now == before * BACKOFF_FACTOR, "pas de backoff"
    intervals = [comp._interval_now]
    for _ in range(12):
        clock.advance(comp._interval_now)
        await sup.tick()
        intervals.append(comp._interval_now)
    assert max(intervals) <= MAX_INTERVAL_S, f"backoff non plafonné : {max(intervals)}"
    assert intervals[-1] == MAX_INTERVAL_S, f"plafond non atteint : {intervals[-1]}"
    degraded_events = [e for e in events if e["state"] == DEGRADED]
    assert len(degraded_events) == 1, "degraded réémis à chaque échec : c'est du bruit"

    # 5. Retour à la normale : intervalle réinitialisé, transition émise.
    alive["ok"] = True
    clock.advance(MAX_INTERVAL_S)
    await sup.tick()
    assert comp.state == READY, comp.state
    assert comp._interval_now == 5.0, f"intervalle non réinitialisé : {comp._interval_now}"
    assert comp.failures == 0
    assert len(events) == 3

    # 6. Un check qui lève ne fait pas tomber la boucle : le composant est KO.
    async def explodes() -> bool:
        raise RuntimeError("boom")

    bad = sup.register("cassé", explodes, interval_s=1.0)
    for _ in range(FAILURES_BEFORE_DEGRADED):
        clock.advance(bad._interval_now)
        await sup.tick()
    assert bad.state == DEGRADED
    assert "boom" in (bad.error or "")

    # 7. Un check qui pend est un échec, pas un blocage.
    async def hangs() -> bool:
        await asyncio.sleep(60)
        return True

    slow = sup.register("qui-pend", hangs, interval_s=1.0)
    sup_timeout_start = clock()
    await sup.tick()  # ne doit pas rendre la main dans 60 s
    assert slow.failures == 1, slow.failures
    assert "pas de réponse" in (slow.error or ""), slow.error

    # 8. status() résume, et signale ce qui est cassé.
    st = sup.status()
    assert st["ok"] is False
    assert set(st["degraded"]) == {"cassé", "qui-pend"} or "cassé" in st["degraded"]
    assert st["watchdog"]["enabled"] is False, "watchdog actif hors systemd"
    assert len(st["components"]) == 3

    # 9. note() = observation certaine : dégrade tout de suite et part en
    #    backoff, au lieu de sonder un service déjà connu comme mort.
    clock2 = Clock()
    events2: list[dict] = []
    sup2 = Supervisor(emit=lambda kind, p: events2.append(p), clock=clock2)
    voice = sup2.register("voice", check, interval_s=15.0)
    sup2.note("voice", DEGRADED, "injoignable")
    assert voice.state == DEGRADED, voice.state
    assert voice.failures >= FAILURES_BEFORE_DEGRADED, "note() doit armer le backoff"
    assert voice._interval_now > voice.interval_s, "pas de backoff après note()"
    assert len(events2) == 1

    sup2.note("voice", READY)
    assert voice.failures == 0 and voice._interval_now == 15.0, "retour non réinitialisé"

    print("OK - supervisor smoke passed")
    print("  21 sondes OK -> 1 seul event (transition uniquement)")
    print(f"  {FAILURES_BEFORE_DEGRADED} echecs -> degraded | backoff 5s -> {MAX_INTERVAL_S:.0f}s plafonne")
    print("  degraded emis 1 fois, pas a chaque echec | retour ready -> intervalle reinitialise")
    print("  check qui leve = KO | check qui pend = timeout, pas un blocage")


if __name__ == "__main__":
    asyncio.run(main())
