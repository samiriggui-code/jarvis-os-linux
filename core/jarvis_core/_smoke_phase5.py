"""Phase 5 — Capability Router + gate régression Phase 4."""
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


def main(argv: list[str] | None = None) -> int:
    print("PHASE 5 - Capability Router")
    print(f"python={sys.executable}")

    print("\n-- jarvis_core.Orchestrator --")
    from jarvis_core import Orchestrator

    orch = Orchestrator()
    check("router", hasattr(orch, "router"))
    check("IntentRoutingMixin", hasattr(orch, "_execute_intent"))
    check("_bind_output_route", hasattr(orch, "_bind_output_route"))

    env = os.environ.copy()
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_capability_router"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n-- gate Phase 4 (régression) --")
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_phase4"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n" + "=" * 56)
    print("PHASE 5 smokes : ALL PASS (exit 0)")
    print("=" * 56)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
