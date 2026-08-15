#!/usr/bin/env python3
"""Audit filesystem prod → budget paliers NeuralGraph (hors vendor/deps).

Usage: python scripts/audit-neural-tier-budget.py
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROD_ROOTS = ["core/jarvis_core", "hud/src", "dashboard/src", "deploy"]
SOURCE_EXT = {".py", ".ts", ".tsx", ".yaml", ".yml", ".json", ".css"}

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".next", "vendor", ".turbo", ".cache", "coverage", ".pytest_cache",
}


def skip_dir(name: str) -> bool:
    return name in SKIP_DIRS or name.startswith("_") or name.startswith(".")


def skip_file(name: str) -> bool:
    if name.startswith("_smoke_") or name.startswith("."):
        return True
    low = name.lower()
    if name in ("package-lock.json", "pnpm-lock.yaml", "yarn.lock"):
        return True
    if low.startswith("test_") or low.endswith("_test.py"):
        return True
    if low.endswith(".test.ts") or low.endswith(".test.tsx") or low.endswith(".spec.ts"):
        return True
    return False


def main() -> None:
    all_files: list[Path] = []
    all_dirs: list[Path] = []

    for rel in PROD_ROOTS:
        base = ROOT / rel
        if not base.exists():
            continue
        for root, dirnames, filenames in os.walk(base):
            dirnames[:] = sorted(d for d in dirnames if not skip_dir(d))
            rp = Path(root)
            for d in dirnames:
                all_dirs.append(rp / d)
            for fn in filenames:
                if skip_file(fn):
                    continue
                p = rp / fn
                if p.suffix.lower() in SOURCE_EXT:
                    all_files.append(p)

    jc = ROOT / "core" / "jarvis_core"
    subsystems = sorted(
        p.name for p in jc.iterdir() if p.is_dir() and not skip_dir(p.name)
    ) if jc.exists() else []

    modules: set[str] = set()
    for d in all_dirs:
        ps = d.as_posix()
        if "/jarvis_core/" in ps:
            rest = ps.split("/jarvis_core/", 1)[1]
            parts = [x for x in rest.split("/") if x]
            if len(parts) >= 2:
                modules.add(f"{parts[0]}/{parts[1]}")
        elif ps.startswith("hud/src/"):
            parts = ps.replace("hud/src/", "").split("/")
            if len(parts) >= 2:
                modules.add(f"hud/{parts[0]}/{parts[1]}")
        elif ps.startswith("dashboard/src/"):
            parts = ps.replace("dashboard/src/", "").split("/")
            if len(parts) >= 2:
                modules.add(f"dashboard/{parts[0]}/{parts[1]}")

    print("PROD_FILESYSTEM_AUDIT")
    print(f"  major_process: 9  # Graph3DModel")
    print(f"  subsystem: {len(subsystems)}  # jarvis_core packages")
    print(f"  module: {len(modules)}")
    print(f"  folder: {len(all_dirs)}")
    print(f"  file: {len(all_files)}")
    print(f"  synapse: 19  # architectureLabSnapshot.connections")
    print(f"  total_nodes: {9 + len(subsystems) + len(modules) + len(all_dirs) + len(all_files)}")
    print("  subsystems:", ", ".join(subsystems))


if __name__ == "__main__":
    main()
