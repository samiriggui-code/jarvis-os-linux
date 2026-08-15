"""Smoke — ThresholdEngine · DevicePresence · AlertRouter (V1 réactif).

Sans caméra, sans Hermes, sans Windows Agent, sans NUC.

    python -m jarvis_core._smoke_alerts
"""
from __future__ import annotations

import asyncio
import sys
import time

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _emit_collect(store: list):
    def emit(kind: str, payload: dict) -> None:
        store.append((kind, payload))

    return emit


def test_a_threshold() -> None:
    from jarvis_core.alerts import ThresholdEngine

    store: list = []
    eng = ThresholdEngine(emit=_emit_collect(store), cooldown_s=0.0, cpu_window=1)

    # 50 % → rien
    assert eng.observe({"host": "nuc", "disk": 50, "ram": 30, "cpu": 10}) == []
    assert store == []

    # 92 % → un seul ALERT_RAISED (medium)
    evs = eng.observe({"host": "nuc", "disk": 92, "ram": 30, "cpu": 10})
    assert len(evs) == 1 and evs[0][0] == "ALERT_RAISED", evs
    assert evs[0][1]["severity"] == "medium"
    assert evs[0][1]["metric"] == "disk"
    assert "suggest_analyze" in evs[0][1]

    # Même niveau encore → pas de doublon
    assert eng.observe({"host": "nuc", "disk": 93, "ram": 30, "cpu": 10}) == []

    # Retour 50 % → un seul ALERT_CLEARED
    store.clear()
    evs = eng.observe({"host": "nuc", "disk": 50, "ram": 30, "cpu": 10})
    assert len(evs) == 1 and evs[0][0] == "ALERT_CLEARED", evs
    assert eng.raised == 1 and eng.cleared == 1

    # CPU : pic unique avec window=3 ne déclenche pas
    eng2 = ThresholdEngine(emit=_emit_collect([]), cooldown_s=0.0, cpu_window=3)
    assert eng2.observe({"host": "nuc", "disk": 10, "ram": 10, "cpu": 90}) == []
    assert eng2.observe({"host": "nuc", "disk": 10, "ram": 10, "cpu": 90}) == []
    evs = eng2.observe({"host": "nuc", "disk": 10, "ram": 10, "cpu": 90})
    assert len(evs) == 1 and evs[0][1]["metric"] == "cpu"

    print("  A OK — threshold 50→92→RAISED, 92→50→CLEARED, CPU window")


def test_b_devices() -> None:
    from jarvis_core.alerts import DevicePresenceWatcher
    from jarvis_core.devices import DeviceRegistry

    reg = DeviceRegistry(ttl_s=0.15)
    store: list = []
    watch = DevicePresenceWatcher(reg, emit=_emit_collect(store), poll_s=0.05)

    reg.register("pc-windows-1", type="windows", runtime_kind="windows_agent")
    # Premier poll : mémorise online, pas d'event
    assert watch.poll() == []
    assert store == []

    # Expire TTL
    time.sleep(0.20)
    evs = watch.poll()
    assert len(evs) == 1 and evs[0][0] == "DEVICE_OFFLINE", evs
    assert evs[0][1]["device_id"] == "pc-windows-1"
    assert "Windows Agent" in evs[0][1]["summary"]

    # Pas de doublon
    assert watch.poll() == []

    # Heartbeat → ONLINE
    store.clear()
    reg.heartbeat("pc-windows-1")
    evs = watch.poll()
    assert len(evs) == 1 and evs[0][0] == "DEVICE_ONLINE", evs
    assert watch.offline_events == 1 and watch.online_events == 1

    print("  B OK — OFFLINE puis ONLINE, sans doublon")


async def test_c_router() -> None:
    from jarvis_core.alerts import AlertRouter
    from jarvis_core.bus import Bus, Event

    bus = Bus()
    notifs: list = []
    voices: list = []

    async def notify(msg: str, level: str) -> None:
        notifs.append((msg, level))

    async def speak(msg: str) -> None:
        voices.append(msg)

    router = AlertRouter(bus, notify=notify, speak=speak, cooldown_s=30.0)

    # LOW → notif seule
    low = Event(
        kind="ALERT_RAISED",
        payload={
            "alert_id": "disk:nuc",
            "severity": "low",
            "summary": "Le espace disque du nuc est élevé (82 %).",
        },
    )
    r = await router.handle(low)
    assert r["notified"] and not r["spoken"]
    assert len(notifs) == 1 and voices == []

    # MEDIUM → notif + voix
    med = Event(
        kind="ALERT_RAISED",
        payload={
            "alert_id": "disk:nuc2",
            "severity": "medium",
            "summary": "Attention, espace disque du nuc atteint 92 %.",
        },
    )
    r = await router.handle(med)
    assert r["notified"] and r["spoken"]
    assert len(voices) == 1

    # Doublon même clé → cooldown
    r = await router.handle(med)
    assert r.get("suppressed") is True
    assert router.suppressed == 1

    # DEVICE_OFFLINE → notif + voix
    off = Event(
        kind="DEVICE_OFFLINE",
        payload={
            "device_id": "pc-windows-1",
            "severity": "medium",
            "summary": "Le Windows Agent vient de perdre sa connexion au Core. Je surveille la reconnexion.",
        },
    )
    await router.handle(off)
    assert any("Windows Agent" in v for v in voices)

    print("  C OK — LOW notif, MEDIUM notif+voix, cooldown, device offline")


def main() -> int:
    test_a_threshold()
    test_b_devices()
    asyncio.run(test_c_router())
    print("OK - alerts V1 smoke passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"ÉCHEC — {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
