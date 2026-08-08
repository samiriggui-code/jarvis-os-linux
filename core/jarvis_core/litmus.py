"""Litmus — une preuve par capability (pattern agent-swarm → JARVIS).

Chaque entrée répond à : « cette capability est-elle *branchée*, pas seulement déclarée ? »

Tiers :
  static      — registre, exécuteur, provider (ms)
  e2e         — smoke subprocess offline ou fake agent
  integration — dépend de l'environnement (Windows inventory…)
"""

from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Callable

from .capabilities import CAPABILITIES, Owner
from .routing.provider import CapabilityProvider, provider_for_intent


class LitmusTier(str, Enum):
    STATIC = "static"
    E2E = "e2e"
    INTEGRATION = "integration"


CheckFn = Callable[[Any], tuple[bool, str]]


@dataclass(frozen=True)
class LitmusEntry:
    capability_id: str
    label: str
    tier: LitmusTier
    smoke_module: str | None = None
    check: CheckFn | None = None
    skip_env: str | None = None


def _check_executor_registered(orch: Any, intent: str) -> tuple[bool, str]:
    ok = intent in orch.intents.actions
    return ok, "executor manquant" if not ok else "registered"


def _check_provider_satellite(_orch: Any, intent: str) -> tuple[bool, str]:
    prov = provider_for_intent(intent)
    ok = prov is CapabilityProvider.SATELLITE
    return ok, f"provider={prov}"


def _check_provider_core(_orch: Any, intent: str) -> tuple[bool, str]:
    prov = provider_for_intent(intent)
    ok = prov is CapabilityProvider.CORE
    return ok, f"provider={prov}"


def _check_device_dispatch(_orch: Any) -> tuple[bool, str]:
    try:
        from .device_dispatch import DeviceDispatch

        ok = DeviceDispatch is not None
    except ImportError:
        ok = False
    return ok, "DeviceDispatch" if ok else "import fail"


def _check_device_registry(_orch: Any) -> tuple[bool, str]:
    ok = hasattr(_orch, "devices") and hasattr(_orch.devices, "update_capabilities")
    return ok, "DeviceRegistry" if ok else "absent"


def _check_mission_drain_api(_orch: Any) -> tuple[bool, str]:
    from .missions.store import MissionStore

    ok = all(
        hasattr(MissionStore, name)
        for name in ("start_drain", "begin_step", "finish_step", "block")
    )
    return ok, "MissionStore drain API" if ok else "API manquante"


def _check_hermes_slim(_orch: Any) -> tuple[bool, str]:
    from .capabilities import _apply_hermes_slim

    prev = os.environ.get("JARVIS_HERMES_SKILLS_ONLY")
    try:
        os.environ["JARVIS_HERMES_SKILLS_ONLY"] = "1"
        got = _apply_hermes_slim({"skills", "terminal", "web"})
        ok = got == {"skills"}
    finally:
        if prev is None:
            os.environ.pop("JARVIS_HERMES_SKILLS_ONLY", None)
        else:
            os.environ["JARVIS_HERMES_SKILLS_ONLY"] = prev
    return ok, f"slim={got}" if ok else f"FAIL slim={got}"


def _make_static_catalog() -> list[LitmusEntry]:
    entries: list[LitmusEntry] = []

    for cap in CAPABILITIES.values():
        if not cap.available:
            continue
        if cap.owner not in (Owner.CORE, Owner.DEVICE):
            continue
        cap_id = f"intent:{cap.intent}"
        entries.append(
            LitmusEntry(
                capability_id=cap_id,
                label=f"executor · {cap.intent}",
                tier=LitmusTier.STATIC,
                check=lambda o, i=cap.intent: _check_executor_registered(o, i),
            )
        )

    for intent in ("core.cursor", "device.app_launch"):
        entries.append(
            LitmusEntry(
                capability_id=f"intent:{intent}",
                label=f"provider SATELLITE · {intent}",
                tier=LitmusTier.STATIC,
                check=lambda o, i=intent: _check_provider_satellite(o, i),
            )
        )

    for intent in ("home.control", "media.video"):
        entries.append(
            LitmusEntry(
                capability_id=f"intent:{intent}",
                label=f"provider CORE · {intent}",
                tier=LitmusTier.STATIC,
                check=lambda o, i=intent: _check_provider_core(o, i),
            )
        )

    entries.extend(
        [
            LitmusEntry(
                capability_id="host:device.dispatch",
                label="DeviceDispatch module",
                tier=LitmusTier.STATIC,
                check=lambda o: _check_device_dispatch(o),
            ),
            LitmusEntry(
                capability_id="host:device.registry",
                label="DeviceRegistry on Orchestrator",
                tier=LitmusTier.STATIC,
                check=lambda o: _check_device_registry(o),
            ),
            LitmusEntry(
                capability_id="product:missions.drain",
                label="MissionStore drain API",
                tier=LitmusTier.STATIC,
                check=lambda o: _check_mission_drain_api(o),
            ),
            LitmusEntry(
                capability_id="product:hermes.slim",
                label="Hermes skills-only filter",
                tier=LitmusTier.STATIC,
                check=lambda o: _check_hermes_slim(o),
            ),
        ]
    )
    return entries


# E2E — module exécuté une fois ; plusieurs capability_ids prouvées.
E2E_PROOFS: tuple[LitmusEntry, ...] = (
    LitmusEntry(
        capability_id="intent:core.cursor",
        label="Intent → Policy → Device → tool_event",
        tier=LitmusTier.E2E,
        smoke_module="jarvis_core._smoke_p4_device_agent",
    ),
    LitmusEntry(
        capability_id="host:app.launch",
        label="WS device.execute + execute_result",
        tier=LitmusTier.E2E,
        smoke_module="jarvis_core._smoke_p4_device_agent",
    ),
    LitmusEntry(
        capability_id="host:app.software.cursor",
        label="Fake agent software cap",
        tier=LitmusTier.E2E,
        smoke_module="jarvis_core._smoke_p4_device_agent",
    ),
    LitmusEntry(
        capability_id="product:intent.circuit",
        label="Circuit intent offline (home, holomat, missions…)",
        tier=LitmusTier.E2E,
        smoke_module="jarvis_core._smoke_intent_circuit",
    ),
    LitmusEntry(
        capability_id="product:policy.chain",
        label="Policy + Hermes refus + match_intent",
        tier=LitmusTier.E2E,
        smoke_module="jarvis_core._smoke_capabilities",
    ),
    LitmusEntry(
        capability_id="product:p0.executors",
        label="Tuiles système P0",
        tier=LitmusTier.E2E,
        smoke_module="jarvis_core._smoke_p0_executors",
    ),
    LitmusEntry(
        capability_id="host:system.inventory",
        label="Scan inventaire Windows",
        tier=LitmusTier.INTEGRATION,
        smoke_module="jarvis_core._smoke_p4_windows_apps",
        skip_env="JARVIS_LITMUS_SKIP_WINDOWS",
    ),
    LitmusEntry(
        capability_id="product:missions.drain",
        label="Mission drain loop E2E",
        tier=LitmusTier.E2E,
        smoke_module="jarvis_core._smoke_drain",
    ),
    LitmusEntry(
        capability_id="product:hermes.slim",
        label="Hermes MCP slim E2E",
        tier=LitmusTier.E2E,
        smoke_module="jarvis_core._smoke_hermes_slim",
    ),
)


def catalog(*, include_e2e: bool = True) -> list[LitmusEntry]:
    items = _make_static_catalog()
    if include_e2e:
        items.extend(E2E_PROOFS)
    return items


def run_static(orch: Any) -> list[tuple[LitmusEntry, bool, str]]:
    results: list[tuple[LitmusEntry, bool, str]] = []
    seen: set[str] = set()
    for entry in _make_static_catalog():
        key = entry.capability_id
        if key in seen and entry.check is None:
            continue
        seen.add(key)
        if entry.check is None:
            continue
        ok, detail = entry.check(orch)
        results.append((entry, ok, detail))
    return results


def run_e2e(*, root: Path | None = None, env: dict[str, str] | None = None) -> list[tuple[LitmusEntry, bool, str]]:
    root = root or Path(__file__).resolve().parents[1]
    env = dict(env or os.environ)
    results: list[tuple[LitmusEntry, bool, str]] = []
    ran_modules: dict[str, bool] = {}

    for entry in E2E_PROOFS:
        if entry.skip_env and env.get(entry.skip_env, "").lower() in ("1", "true", "yes"):
            results.append((entry, True, "SKIP env"))
            continue
        mod = entry.smoke_module
        if not mod:
            continue
        if mod not in ran_modules:
            rc = subprocess.call(
                [sys.executable, "-m", mod],
                cwd=str(root),
                env=env,
            )
            ran_modules[mod] = rc == 0
        ok = ran_modules[mod]
        results.append((entry, ok, mod if ok else f"FAIL {mod}"))
    return results


def run_all(*, orch: Any, root: Path | None = None, fast: bool = False) -> tuple[int, list[tuple[LitmusEntry, bool, str]]]:
    results = run_static(orch)
    if not fast:
        results.extend(run_e2e(root=root))
    failures = sum(1 for _, ok, _ in results if not ok)
    return failures, results
