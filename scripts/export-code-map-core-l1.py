#!/usr/bin/env python3
"""Exporte les nœuds L1 CORE (CodeMap) → codeMapCoreL1.json pour Neural 3D.

Usage (racine repo) :
  python scripts/export-code-map-core-l1.py
"""
from __future__ import annotations

import json
import math
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
    / "codeMapCoreL1.json"
)

sys.path.insert(0, str(CORE))

from jarvis_core.architecture import code_map  # noqa: E402


def descendant_files(nodes: dict, nid: str) -> int:
    stack = [nid]
    seen: set[str] = set()
    count = 0
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        n = nodes[cur]
        if n["kind"] == "file":
            count += 1
        stack.extend(n.get("children") or [])
    return count


def main() -> int:
    cm = code_map()
    all_nodes = cm["nodes"]
    l1: list[dict] = []

    for n in all_nodes.values():
        if n.get("primaryProcess") != "core":
            continue
        path = n.get("path") or ""
        if not path.startswith("core/jarvis_core/") or path.count("/") != 2:
            continue
        if n["name"] == "jarvis_core":
            continue
        df = descendant_files(all_nodes, n["id"]) if n["kind"] == "directory" else 0
        l1.append(
            {
                "id": n["id"],
                "name": n["name"],
                "path": path,
                "kind": n["kind"],
                "descendantFiles": df,
                "visualWeight": round(math.sqrt(df + 1), 4),
            }
        )

    dirs = sorted([x for x in l1 if x["kind"] == "directory"], key=lambda x: x["path"])
    files = sorted([x for x in l1 if x["kind"] == "file"], key=lambda x: x["path"])
    ordered = dirs + files

    payload = {
        "_regenerate": "cd hud && npm run graph3d:core-l1",
        "schemaVersion": cm["schemaVersion"],
        "generatedAt": cm["generatedAt"],
        "processId": "core",
        "processLabel": "CORE",
        "fileCount": cm["stats"]["byProcess"].get("core", 0),
        "visualWeightNote": "visualWeight = sqrt(descendantFiles + 1) — comptes réels inchangés",
        "nodes": ordered,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"OK — {OUT.relative_to(ROOT)}")
    print(f"  directories: {len(dirs)}, top-level files: {len(files)}, total files in CORE: {payload['fileCount']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
