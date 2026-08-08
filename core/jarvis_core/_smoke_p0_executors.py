"""P0 — exécutants Core (tuiles système) enregistrés."""
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
    print("P0 — Core system executors")
    from jarvis_core import Orchestrator
    from jarvis_core.capabilities import CAPABILITIES, Owner
    from jarvis_core.executors import IntentExecutorsMixin

    orch = Orchestrator()
    p0_intents = (
        "core.preferences",
        "core.neural_map",
        "core.dashboard",
        "core.monitor",
        "core.security",
        "core.providers",
        "core.usage",
        "system.network",
    )
    for intent in p0_intents:
        check(f"registered · {intent}", intent in orch.intents.actions)

    check("core.cursor registered (DEVICE)", "core.cursor" in orch.intents.actions)
    cursor = CAPABILITIES.get("cursor")
    check("core.cursor Owner.DEVICE", cursor is not None and cursor.owner is Owner.DEVICE)
    check("core.cursor available", cursor is not None and cursor.available)

    for method in (
        "_execute_preferences",
        "_execute_monitor",
        "_execute_providers",
        "_execute_network",
        "_execute_device_intent",
    ):
        check(f"mixin · {method}", hasattr(IntentExecutorsMixin, method))

    for cap in CAPABILITIES.values():
        if cap.intent in p0_intents:
            check(f"available · {cap.intent}", cap.available)

    docker = CAPABILITIES.get("docker")
    storage = CAPABILITIES.get("storage")
    check("docker toolset terminal", docker is not None and docker.toolset == "terminal")
    check("storage toolset terminal", storage is not None and storage.toolset == "terminal")
    check(
        "core.missions available",
        CAPABILITIES.get("objectifs") is not None and CAPABILITIES["objectifs"].available,
    )
    check(
        "vps.code available",
        CAPABILITIES.get("code") is not None and CAPABILITIES["code"].available,
    )
    check(
        "media.music gated by env",
        CAPABILITIES.get("music") is not None and not CAPABILITIES["music"].available,
    )

    print("\nALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
