"""Phase 0 — orchestrateur smokes Core (sans HUD).

Usage (depuis core/, venv) :
  python -m jarvis_core._smoke_phase0
  python -m jarvis_core._smoke_phase0 --ws   # inclut smokes WS si Core écoute

Gate refactor : tous les smokes offline doivent passer avant extraction __init__.py.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]

# Modules offline — pas de serveur WS requis
OFFLINE_SMOKES: list[str] = [
    "jarvis_core.auth._smoke",
    "jarvis_core.auth._smoke_login",
    "jarvis_core._smoke_face_multi",
    "jarvis_core._smoke_auth_multi",
    "jarvis_core._smoke_auth_biometrics",
    "jarvis_core._smoke_bus",
    "jarvis_core._smoke_capabilities",
    "jarvis_core._smoke_p2",
    "jarvis_core._smoke_p3",
    "jarvis_core._smoke_surface_decision",
    "jarvis_core._smoke_tool_events",
    "jarvis_core._smoke_gestures",
    "jarvis_core._smoke_devices",
    "jarvis_core._smoke_supervisor",
    "jarvis_core._smoke_metrics",
    "jarvis_core._smoke_wake_mute",
]

# Nécessitent jarvis-core actif sur JARVIS_CORE_WS
WS_SMOKES: list[str] = [
    "jarvis_core._smoke_auth_face",
]


def _run_module(mod: str, *, env: dict[str, str]) -> None:
    print(f"\n-- {mod} --")
    rc = subprocess.call(
        [sys.executable, "-m", mod],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Phase 0 smokes Core")
    parser.add_argument(
        "--ws",
        action="store_true",
        help="Inclure smokes WebSocket (Core doit tourner)",
    )
    parser.add_argument(
        "--ws-only",
        action="store_true",
        help="Uniquement smokes WS",
    )
    args = parser.parse_args(argv)

    env = os.environ.copy()
    print("PHASE 0 - smokes Core sans HUD")
    print(f"python={sys.executable}")

    if not args.ws_only:
        for mod in OFFLINE_SMOKES:
            _run_module(mod, env=env)

    if args.ws or args.ws_only:
        ws = env.get("JARVIS_CORE_WS", "ws://127.0.0.1:8765")
        print(f"\n-- WS smokes · {ws} --")
        for mod in WS_SMOKES:
            _run_module(mod, env=env)

    print("\nPHASE 0 smokes : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
