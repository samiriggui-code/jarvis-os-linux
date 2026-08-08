"""Litmus gate — preuve par capability (branchée, pas seulement déclarée).

    python -m jarvis_core._smoke_litmus           # static + e2e
    python -m jarvis_core._smoke_litmus --fast    # static seulement (~1s)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check_entry(capability_id: str, tier: str, ok: bool, detail: str = "") -> None:
    status = "OK" if ok else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] [{tier}] {capability_id}{suffix}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Litmus — capability wiring proofs")
    parser.add_argument("--fast", action="store_true", help="Static checks only")
    parser.add_argument("--write-matrix", action="store_true", help="Regenerate docs/audit/EVAL_MATRIX.md")
    args = parser.parse_args()

    if args.write_matrix:
        from jarvis_core.eval_matrix import write_matrix

        dest = write_matrix()
        print(f"EVAL_MATRIX -> {dest}")

    from jarvis_core import Orchestrator
    from jarvis_core.litmus import run_all

    print("LITMUS — capability proofs")
    print(f"mode={'fast' if args.fast else 'full'}")
    print()

    orch = Orchestrator()
    failures, results = run_all(orch=orch, root=Path(__file__).resolve().parents[1], fast=args.fast)

    current_tier = ""
    for entry, ok, detail in results:
        if entry.tier.value != current_tier:
            current_tier = entry.tier.value
            print(f"\n── {current_tier.upper()} ──")
        check_entry(entry.capability_id, entry.tier.value, ok, detail or entry.label)

    print()
    total = len(results)
    passed = total - failures
    print(f"{'ALL PASS' if failures == 0 else 'FAIL'} — {passed}/{total} litmus")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
