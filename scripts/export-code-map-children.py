#!/usr/bin/env python3
"""Exporte les enfants réels de CHAQUE nœud CodeMap → codeMapChildren.json.

Lit `jarvis_core.architecture.code_map()` (filesystem réel du repo) et écrit,
pour tout nœud process/directory qui a des enfants, la liste enrichie de ses
enfants directs (id, name, path, kind, primaryProcess, descendantFiles,
visualWeight) — consommé par `hud/.../data/codeMapChildren.ts::childrenOf()`.

Usage (depuis la racine du repo) :
  python scripts/export-code-map-children.py

Prérequis : Python avec le package core importable (même env que les smokes).
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
    / "codeMapChildren.json"
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
    nodes = cm["nodes"]

    children_by_parent_id: dict[str, list[dict]] = {}
    for nid, n in nodes.items():
        child_ids = n.get("children") or []
        if not child_ids:
            continue
        entries: list[dict] = []
        for cid in child_ids:
            c = nodes[cid]
            df = descendant_files(nodes, cid) if c["kind"] == "directory" else 0
            entries.append(
                {
                    "id": c["id"],
                    "name": c["name"],
                    "path": c["path"],
                    "kind": c["kind"],
                    "primaryProcess": c["primaryProcess"],
                    "descendantFiles": df,
                    "visualWeight": round(math.sqrt(df + 1), 4),
                }
            )
        entries.sort(key=lambda x: (x["kind"] != "directory", x["path"] or ""))
        children_by_parent_id[nid] = entries

    payload = {
        "_regenerate": "cd hud && npm run graph3d:children",
        "schemaVersion": cm["schemaVersion"],
        "childrenByParentId": children_by_parent_id,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"OK — {OUT.relative_to(ROOT)}")
    print(f"  {len(children_by_parent_id)} nœuds parents avec enfants")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
