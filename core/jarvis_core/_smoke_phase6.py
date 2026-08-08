"""Phase 6 — unification circuit produit Core."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    print("PHASE 6 - Circuit produit Core")
    print(f"python={sys.executable}")

    from jarvis_core import Orchestrator
    from jarvis_core.routing import CapabilityProvider, provider_for_intent, resolve_execution_host
    from jarvis_core.routing.router import CapabilityRouter, RouteContext
    from jarvis_core.devices import DeviceRegistry
    from jarvis_core.hermes import HermesIntentDelegate
    from jarvis_core.executors import IntentExecutorsMixin
    from jarvis_core.surfaces.publisher import publish_result_surface

    orch = Orchestrator()
    check("Orchestrator", orch is not None)
    check("router", hasattr(orch, "router"))
    check("HermesIntentDelegate import", HermesIntentDelegate is not None)
    check("executors segmented", hasattr(IntentExecutorsMixin, "_execute_home"))
    check("surface publisher", callable(publish_result_surface))
    check("_open_intent unified", hasattr(orch, "_open_intent"))
    check("no _chat_via_capability", not hasattr(orch, "_chat_via_capability"))
    check("no _try_streaming_platforms", not hasattr(orch, "_try_streaming_platforms"))

    reg = DeviceRegistry(ttl_s=120)
    reg.register_local_core()
    router = CapabilityRouter(reg)
    host = resolve_execution_host(router, RouteContext(), "home.control")
    check("home host gate open", not host.rejected and host.reason == "core_in_process")
    check("home provider", provider_for_intent("home.control") is CapabilityProvider.CORE)

    # Litmus remplace les boucles executor + smokes intent/p4 redondants
    env = os.environ.copy()
    print("\n-- Litmus (static + e2e) --")
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_litmus"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n-- P2 HUD contract --")
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_p2_hud"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n-- P1 integrations --")
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_p1"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n-- P2a prod UX --")
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_p2a"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n-- P2b contrat HUD --")
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_p2b"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_hermes_events"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n-- P3 tuiles restantes --")
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_p3_tiles"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n-- gate Phase 5 (régression) --")
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_phase5"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n" + "=" * 56)
    print("PHASE 6 smokes : ALL PASS (exit 0)")
    print("=" * 56)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
