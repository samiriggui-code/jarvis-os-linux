#!/usr/bin/env python3
"""Exporte les dossiers CodeMap L2 → JSON consommé par le HUD Neural 3D.

Lit `jarvis_core.architecture.code_map()` (filesystem réel du repo) et écrit :
  hud/src/agentic/components/graph3d/architecture3d/data/codeMapProcessDirs.json

Usage (depuis la racine du repo) :
  python scripts/export-code-map-process-dirs.py

Prérequis : Python avec le package core importable (même env que les smokes).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / "core"
OUT = (
    ROOT
    / "hud"
    / "src"
    / "agentic"
    / "components"
    / "graph3d"
    / "architecture3d"
    / "data"
    / "codeMapProcessDirs.json"
)

sys.path.insert(0, str(CORE))

from jarvis_core.architecture import code_map  # noqa: E402


def pick_l2_directory(process_id: str, node: dict) -> bool:
    """Dossiers affichés en palier L2 (intérieur d'un process)."""
    if node["kind"] != "directory" or node.get("primaryProcess") != process_id:
        return False
    path = node.get("path") or ""

    if process_id == "core":
        if path.startswith("core/jarvis_core/") and path.count("/") == 2:
            return True
        if path.startswith("deploy/") and path.count("/") == 1:
            return True
        return False

    if process_id == "hud":
        return (path.startswith("hud/src/") or path.startswith("dashboard/src/")) and path.count("/") == 2

    if process_id in ("memory", "voice"):
        return path.startswith(f"core/jarvis_core/{process_id}")

    if process_id == "vision":
        return (
            path.startswith("core/jarvis_core/vision")
            or path.startswith("core/jarvis_core/holomat")
            or path.startswith("deploy/vision-worker")
        )

    if process_id == "devices":
        return path.startswith("deploy/windows-agent") or path.startswith("deploy/pi-salon")

    if process_id == "home":
        return path.startswith("deploy/homeassistant")

    return node.get("depth") == 2


def main() -> int:
    cm = code_map()
    processes: dict[str, list[dict]] = {}

    for process_id in cm["rootIds"]:
        dirs: list[dict] = []
        for node in cm["nodes"].values():
            if not pick_l2_directory(process_id, node):
                continue
            dirs.append(
                {
                    "id": node["id"],
                    "name": node["name"],
                    "path": node["path"],
                    "depth": node["depth"],
                }
            )
        dirs.sort(key=lambda d: d["path"])
        processes[process_id] = dirs

    payload = {
        "_regenerate": "cd hud && npm run graph3d:code-map",
        "schemaVersion": cm["schemaVersion"],
        "generatedAt": cm["generatedAt"],
        "processes": processes,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"OK — écrit {OUT.relative_to(ROOT)}")
    for pid, dirs in processes.items():
        names = ", ".join(d["name"] for d in dirs[:6])
        extra = f" (+{len(dirs) - 6})" if len(dirs) > 6 else ""
        print(f"  {pid}: {len(dirs)} dossiers — {names}{extra}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
