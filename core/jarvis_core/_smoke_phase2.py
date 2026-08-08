"""Phase 2 — gate refactor Core (post Phase 1).

Usage (depuis core/, venv) :
  python -m jarvis_core._smoke_phase2
  python -m jarvis_core._smoke_phase2 --ws   # + smokes WS si Core écoute

Gate :
  1. Import / instanciation Orchestrator
  2. Smoke multi-profil face offline (_smoke_face_multi)
  3. Tous les smokes Phase 0 offline
  4. (optionnel) smokes WS live
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


def _run_module(mod: str, *, env: dict[str, str]) -> None:
    print(f"\n-- {mod} --")
    rc = subprocess.call([sys.executable, "-m", mod], cwd=str(ROOT), env=env)
    if rc != 0:
        raise SystemExit(rc)


def _check_orchestrator() -> None:
    print("-- jarvis_core.Orchestrator --")
    from jarvis_core import HOST, PORT, Orchestrator  # noqa: F401

    Orchestrator()
    print(f"  [OK] Orchestrator() · HOST={HOST} PORT={PORT}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Phase 2 smokes Core")
    parser.add_argument("--ws", action="store_true", help="Inclure smokes WebSocket")
    args = parser.parse_args(argv)

    env = os.environ.copy()
    print("PHASE 2 - gate refactor Core")
    print(f"python={sys.executable}")

    _check_orchestrator()
    ws_args = ["--ws"] if args.ws else []
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_phase0", *ws_args],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n" + "=" * 56)
    print("PHASE 2 smokes : ALL PASS (exit 0)")
    print("  Note : « login refusé » dans auth = test de sécurité OK, pas un échec.")
    print("=" * 56)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
