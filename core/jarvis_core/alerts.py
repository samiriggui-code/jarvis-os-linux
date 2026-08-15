"""Alertes réactives / préventives — V1 (seuils · devices · routage notif).

Architecture figée :

    FAITS (métriques / DeviceRegistry)
      → Core (seuils déterministes, transitions)
      → ALERT_* / DEVICE_*
      → AlertRouter (HUD + voix)
      → (plus tard) Hermes propose · Policy · exécutant

Hermes n'est PAS le monitoring primaire. Ce module n'importe ni FaceEngine,
ni holomat, ni perception vision, ni Windows Agent.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Iterable

from .bus import Bus, Event

logger = logging.getLogger("jarvis.alerts")

Severity = str  # "none" | "low" | "medium" | "high"

SEVERITY_RANK = {"none": 0, "low": 1, "medium": 2, "high": 3}

# Seuils d'entrée (alignés brief V1). Sortie = entrée − EXIT_MARGIN.
METRIC_THRESHOLDS: dict[str, tuple[tuple[float, Severity], ...]] = {
    # (seuil_min, severity) du plus grave au plus léger
    "disk": ((95.0, "high"), (90.0, "medium"), (80.0, "low")),
    "ram": ((95.0, "high"), (90.0, "medium"), (75.0, "low")),
    "cpu": ((95.0, "medium"), (85.0, "low")),  # CPU : pas de high spam
}

EXIT_MARGIN = 5.0
CPU_WINDOW = 3  # samples consécutifs au-dessus du seuil
DEFAULT_COOLDOWN_S = 60.0
DEVICE_POLL_S = 5.0

WATCHED_ALERTS: tuple[str, ...] = (
    "ALERT_RAISED",
    "ALERT_CLEARED",
    "DEVICE_OFFLINE",
    "DEVICE_ONLINE",
)


def severity_for(metric: str, value: float) -> Severity:
    """Sévérité d'entrée pour une valeur brute."""
    rules = METRIC_THRESHOLDS.get(metric) or ()
    for threshold, sev in rules:
        if value >= threshold:
            return sev
    return "none"


def exit_floor(metric: str, severity: Severity) -> float:
    """Sous ce niveau, la sévérité active peut retomber."""
    rules = METRIC_THRESHOLDS.get(metric) or ()
    for threshold, sev in rules:
        if sev == severity:
            return threshold - EXIT_MARGIN
    return 0.0


def metric_summary(metric: str, host: str, value: float, severity: Severity) -> str:
    labels = {"disk": "espace disque", "ram": "mémoire", "cpu": "charge CPU"}
    label = labels.get(metric, metric)
    host_lbl = host or "hôte"
    if severity == "high":
        return f"Alerte : {label} du {host_lbl} critique à {value:.0f} %."
    if severity == "medium":
        return f"Attention, {label} du {host_lbl} atteint {value:.0f} %."
    return f"Le {label} du {host_lbl} est élevé ({value:.0f} %)."


def device_offline_summary(device_id: str, device_type: str = "") -> str:
    label = _device_label(device_id, device_type)
    return f"{label} vient de perdre sa connexion au Core. Je surveille la reconnexion."


def device_online_summary(device_id: str, device_type: str = "") -> str:
    label = _device_label(device_id, device_type)
    return f"{label} est de nouveau connecté."


def _device_label(device_id: str, device_type: str = "") -> str:
    did = (device_id or "").lower()
    dtype = (device_type or "").lower()
    if "windows" in did or "windows" in dtype or did.startswith("pc"):
        return "Le Windows Agent"
    if "pi" in did or "salon" in did or dtype in {"pi", "raspberry"}:
        return "Le satellite salon"
    if "nuc" in did or dtype in {"nuc", "core"}:
        return "Le NUC"
    return f"Le device {device_id}"


@dataclass
class _MetricState:
    severity: Severity = "none"
    streak: int = 0
    last_raise_ts: float = 0.0


@dataclass
class ThresholdEngine:
    """SYSTEM_METRICS → ALERT_RAISED / ALERT_CLEARED (déterministe)."""

    emit: Callable[[str, dict[str, Any]], Any]
    cooldown_s: float = DEFAULT_COOLDOWN_S
    cpu_window: int = CPU_WINDOW
    clock: Callable[[], float] = time.monotonic
    _states: dict[str, _MetricState] = field(default_factory=dict)
    raised: int = 0
    cleared: int = 0

    def _key(self, host: str, metric: str) -> str:
        return f"{metric}:{host or '_'}"

    def observe(self, metrics: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
        """Traite un relevé. Retourne les events produits (aussi émis via emit)."""
        if not isinstance(metrics, dict):
            return []
        host = str(metrics.get("host") or "unknown")
        out: list[tuple[str, dict[str, Any]]] = []
        for metric in ("disk", "ram", "cpu"):
            raw = metrics.get(metric)
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            ev = self._observe_one(host, metric, value)
            if ev:
                out.append(ev)
        return out

    def _observe_one(
        self, host: str, metric: str, value: float
    ) -> tuple[str, dict[str, Any]] | None:
        key = self._key(host, metric)
        state = self._states.setdefault(key, _MetricState())
        enter = severity_for(metric, value)
        now = self.clock()

        # Fenêtre CPU : n'entre pas sur un pic unique.
        need_streak = self.cpu_window if metric == "cpu" else 1
        if enter != "none" and SEVERITY_RANK[enter] > SEVERITY_RANK[state.severity]:
            state.streak += 1
        else:
            state.streak = 0 if enter == "none" else state.streak

        # Clear / downgrade
        if state.severity != "none":
            floor = exit_floor(metric, state.severity)
            if value < floor:
                new_sev = severity_for(metric, value)
                if new_sev == "none":
                    payload = self._payload(
                        host, metric, value, "none", key, event="cleared"
                    )
                    state.severity = "none"
                    state.streak = 0
                    state.last_raise_ts = 0.0
                    self.cleared += 1
                    self.emit("ALERT_CLEARED", payload)
                    return ("ALERT_CLEARED", payload)
                # Downgrade vers une sévérité plus basse encore active
                if SEVERITY_RANK[new_sev] < SEVERITY_RANK[state.severity]:
                    if now - state.last_raise_ts < self.cooldown_s:
                        state.severity = new_sev
                        return None
                    state.severity = new_sev
                    state.last_raise_ts = now
                    payload = self._payload(
                        host, metric, value, new_sev, key, event="raised"
                    )
                    self.raised += 1
                    self.emit("ALERT_RAISED", payload)
                    return ("ALERT_RAISED", payload)

        # Raise / escalate
        if (
            enter != "none"
            and SEVERITY_RANK[enter] > SEVERITY_RANK[state.severity]
            and state.streak >= need_streak
        ):
            # Anti-spam : pas de re-raise / escalate dans le cooldown.
            if state.last_raise_ts and now - state.last_raise_ts < self.cooldown_s:
                return None
            state.severity = enter
            state.last_raise_ts = now
            state.streak = 0
            payload = self._payload(host, metric, value, enter, key, event="raised")
            self.raised += 1
            self.emit("ALERT_RAISED", payload)
            return ("ALERT_RAISED", payload)

        return None

    def _payload(
        self,
        host: str,
        metric: str,
        value: float,
        severity: Severity,
        alert_id: str,
        *,
        event: str,
    ) -> dict[str, Any]:
        # Champs préparés pour Hermes diagnose (G) — non consommés en V1.
        return {
            "alert_id": alert_id,
            "kind": f"metric.{metric}",
            "source": "threshold",
            "host": host,
            "metric": metric,
            "value": round(value, 1),
            "severity": severity if event == "raised" else "none",
            "summary": (
                metric_summary(metric, host, value, severity)
                if event == "raised"
                else f"Retour à la normale : {metric} sur {host} ({value:.0f} %)."
            ),
            "suggest_analyze": severity in ("medium", "high") and event == "raised",
            "ts": time.time(),
        }

    async def run(self, bus: Bus) -> None:
        sub = bus.subscribe(["SYSTEM_METRICS"], name="threshold-engine", maxsize=32)
        logger.info("ThresholdEngine armé sur SYSTEM_METRICS")
        while True:
            event = await sub.get()
            try:
                self.observe(event.payload)
            except Exception as exc:  # noqa: BLE001
                logger.warning("threshold (%s) : %s", event.kind, exc)


@dataclass
class DevicePresenceWatcher:
    """DeviceRegistry TTL → DEVICE_OFFLINE / DEVICE_ONLINE."""

    devices: Any
    emit: Callable[[str, dict[str, Any]], Any]
    poll_s: float = DEVICE_POLL_S
    clock: Callable[[], float] = time.time
    _known: dict[str, bool] = field(default_factory=dict)
    offline_events: int = 0
    online_events: int = 0

    def poll(self) -> list[tuple[str, dict[str, Any]]]:
        """Un passage : refresh TTL + diff. Testable sans asyncio."""
        registry = self.devices
        if registry is None:
            return []
        registry._refresh_online()
        out: list[tuple[str, dict[str, Any]]] = []
        current = {
            d.device_id: bool(d.online) for d in registry._devices.values()
        }
        for device_id, online in current.items():
            prev = self._known.get(device_id)
            if prev is None:
                self._known[device_id] = online
                continue
            if prev and not online:
                dev = registry._devices.get(device_id)
                payload = {
                    "device_id": device_id,
                    "device_type": getattr(dev, "type", "") if dev else "",
                    "online": False,
                    "summary": device_offline_summary(
                        device_id, getattr(dev, "type", "") if dev else ""
                    ),
                    "suggest_analyze": True,
                    "severity": "medium",
                    "source": "device_registry",
                    "ts": self.clock(),
                }
                self.offline_events += 1
                self.emit("DEVICE_OFFLINE", payload)
                out.append(("DEVICE_OFFLINE", payload))
            elif (not prev) and online:
                dev = registry._devices.get(device_id)
                payload = {
                    "device_id": device_id,
                    "device_type": getattr(dev, "type", "") if dev else "",
                    "online": True,
                    "summary": device_online_summary(
                        device_id, getattr(dev, "type", "") if dev else ""
                    ),
                    "suggest_analyze": False,
                    "severity": "low",
                    "source": "device_registry",
                    "ts": self.clock(),
                }
                self.online_events += 1
                self.emit("DEVICE_ONLINE", payload)
                out.append(("DEVICE_ONLINE", payload))
            self._known[device_id] = online
        # Devices disparus du registre : traités comme offline si étaient online
        for device_id, prev in list(self._known.items()):
            if device_id not in current and prev:
                payload = {
                    "device_id": device_id,
                    "device_type": "",
                    "online": False,
                    "summary": device_offline_summary(device_id),
                    "suggest_analyze": True,
                    "severity": "medium",
                    "source": "device_registry",
                    "ts": self.clock(),
                }
                self.offline_events += 1
                self.emit("DEVICE_OFFLINE", payload)
                out.append(("DEVICE_OFFLINE", payload))
                self._known[device_id] = False
        return out

    async def run(self) -> None:
        logger.info("DevicePresenceWatcher armé · poll=%.0fs", self.poll_s)
        while True:
            try:
                self.poll()
            except Exception as exc:  # noqa: BLE001
                logger.warning("device presence : %s", exc)
            await asyncio.sleep(self.poll_s)


NotifyFn = Callable[[str, str], Awaitable[None]]  # message, level
SpeakFn = Callable[[str], Awaitable[None]]


@dataclass
class AlertRouter:
    """ALERT_* / DEVICE_* → display_notification + speak (V1)."""

    bus: Bus
    notify: NotifyFn
    speak: SpeakFn
    cooldown_s: float = 30.0
    clock: Callable[[], float] = time.monotonic
    _last: dict[str, float] = field(default_factory=dict)
    notified: int = 0
    spoken: int = 0
    suppressed: int = 0

    def route_key(self, event: Event) -> str:
        p = event.payload
        if event.kind.startswith("ALERT_"):
            return f"{event.kind}:{p.get('alert_id') or p.get('kind')}"
        return f"{event.kind}:{p.get('device_id') or '_'}"

    def channels_for(self, event: Event) -> tuple[bool, bool]:
        """(notification, voice)."""
        sev = str(event.payload.get("severity") or "low").lower()
        if event.kind == "ALERT_CLEARED":
            return True, False
        if event.kind == "DEVICE_ONLINE":
            return True, False
        if event.kind == "DEVICE_OFFLINE":
            return True, True
        if sev in ("medium", "high", "critical"):
            return True, True
        return True, False

    async def handle(self, event: Event) -> dict[str, Any]:
        key = self.route_key(event)
        now = self.clock()
        last = self._last.get(key, 0.0)
        if now - last < self.cooldown_s:
            self.suppressed += 1
            return {"ok": True, "suppressed": True}

        summary = str(event.payload.get("summary") or "").strip()
        if not summary:
            return {"ok": False, "reason": "summary manquant"}

        want_notif, want_voice = self.channels_for(event)
        level = "warning"
        sev = str(event.payload.get("severity") or "").lower()
        if event.kind.endswith("CLEARED") or event.kind == "DEVICE_ONLINE":
            level = "success"
        elif sev == "high":
            level = "error"
        elif sev in ("medium",):
            level = "warning"
        else:
            level = "info"

        self._last[key] = now
        if want_notif:
            await self.notify(summary, level)
            self.notified += 1
        if want_voice:
            await self.speak(summary)
            self.spoken += 1
        return {
            "ok": True,
            "notified": want_notif,
            "spoken": want_voice,
            "summary": summary,
        }

    async def run(self) -> None:
        sub = self.bus.subscribe(WATCHED_ALERTS, name="alert-router", maxsize=64)
        logger.info("AlertRouter armé sur %s", ", ".join(WATCHED_ALERTS))
        while True:
            event = await sub.get()
            try:
                await self.handle(event)
            except Exception as exc:  # noqa: BLE001
                logger.warning("alert router (%s) : %s", event.kind, exc)
