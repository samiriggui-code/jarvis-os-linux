"""Smoke — architecture.code_map() vérité structurelle (contains-only V1).

Sans réseau, SSH, HUD, Hermes, Memory, Verification. Ne dépend que du
filesystem du repo (comme code_map() lui-même).

    python -m jarvis_core._smoke_architecture_code_map
"""
from __future__ import annotations

import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _load():
    from jarvis_core.architecture import code_map

    return code_map()


def test_scan_no_crash_and_shape() -> None:
    graph = _load()
    assert graph["schemaVersion"]
    assert graph["generatedAt"]
    assert isinstance(graph["nodes"], dict)
    assert graph["stats"]["total"] == len(graph["nodes"])
    print(f"  OK — scan sans crash, {graph['stats']['total']} nodes, {graph['elapsed_ms']}ms")


def test_nine_root_ids() -> None:
    graph = _load()
    root_ids = graph["rootIds"]
    assert len(root_ids) == 9, root_ids
    expected = {"core", "bridge", "memory", "policy", "hud", "devices", "home", "voice", "vision"}
    assert set(root_ids) == expected, set(root_ids) ^ expected
    for rid in root_ids:
        node = graph["nodes"][rid]
        assert node["kind"] == "process"
        assert node["parentId"] is None
        assert node["depth"] == 0
    print("  OK — exactement 9 rootIds, tous kind=process, parentId=null, depth=0")


def test_every_file_has_one_primary_process() -> None:
    graph = _load()
    files = [n for n in graph["nodes"].values() if n["kind"] == "file"]
    assert files, "aucun fichier scanné"
    for n in files:
        assert isinstance(n["primaryProcess"], str) and n["primaryProcess"], n
        assert n["primaryProcess"] in graph["rootIds"], n
    print(f"  OK — {len(files)} fichiers, chacun avec exactement un primaryProcess valide")


def test_no_duplicate_file_path() -> None:
    graph = _load()
    paths = [n["path"] for n in graph["nodes"].values() if n["kind"] == "file"]
    assert len(paths) == len(set(paths)), "chemins fichier dupliqués détectés"
    print("  OK — aucun path fichier dupliqué")


def test_parent_and_children_consistency() -> None:
    graph = _load()
    nodes = graph["nodes"]

    for nid, n in nodes.items():
        if n["parentId"] is not None:
            assert n["parentId"] in nodes, f"{nid} parentId inconnu: {n['parentId']}"

    for nid, n in nodes.items():
        for cid in n["children"]:
            assert cid in nodes, f"{nid} référence un enfant inconnu: {cid}"

    # Cohérence bidirectionnelle stricte : parent(enfant) == parent, et
    # enfant ∈ children(parent).
    for nid, n in nodes.items():
        pid = n["parentId"]
        if pid is None:
            continue
        assert nid in nodes[pid]["children"], f"{nid} absent de children({pid})"
    for nid, n in nodes.items():
        for cid in n["children"]:
            assert nodes[cid]["parentId"] == nid, f"children({nid}) contient {cid} mais son parentId diffère"

    print("  OK — parentId/children cohérents dans les deux sens, tous référencent des nœuds existants")


def test_process_refs_contains_primary() -> None:
    graph = _load()
    for n in graph["nodes"].values():
        if n["kind"] not in ("file", "directory", "process"):
            continue
        assert n["primaryProcess"] in n["processRefs"], n
    print("  OK — processRefs contient toujours primaryProcess")


def test_zero_unattributed() -> None:
    # code_map() lève ValueError au premier fichier non attribuable —
    # donc "ne lève pas" ⇒ 0 non attribué. On le revérifie explicitement.
    graph = _load()
    files = [n for n in graph["nodes"].values() if n["kind"] == "file"]
    unattributed = [n for n in files if not n["primaryProcess"]]
    assert not unattributed, unattributed
    print("  OK — 0 fichier non attribué")


def test_real_example_explain_py() -> None:
    graph = _load()
    nodes = graph["nodes"]

    target = next(
        (n for n in nodes.values() if n["kind"] == "file" and n["path"] == "core/jarvis_core/architecture/explain.py"),
        None,
    )
    assert target is not None, "explain.py introuvable dans le scan"
    assert target["primaryProcess"] == "core"

    parent_dir = nodes[target["parentId"]]
    assert parent_dir["kind"] == "directory"
    assert parent_dir["path"] == "core/jarvis_core/architecture"
    assert parent_dir["primaryProcess"] == "core"

    root = nodes[parent_dir["parentId"]]
    assert root["kind"] == "process"
    assert root["id"] == "core"

    print("  OK — CORE -> architecture -> explain.py (core/jarvis_core/architecture/explain.py)")


def test_transversal_example_perception_dispatch() -> None:
    graph = _load()
    nodes = graph["nodes"]

    target = next(
        (
            n
            for n in nodes.values()
            if n["kind"] == "file" and n["path"] == "core/jarvis_core/perception_dispatch.py"
        ),
        None,
    )
    assert target is not None, "perception_dispatch.py introuvable dans le scan"
    assert target["primaryProcess"] == "vision"
    assert set(target["processRefs"]) == {"vision", "hud"}
    print("  OK — perception_dispatch.py primaryProcess=vision, processRefs={vision,hud}")


def test_process_stats_are_internally_coherent() -> None:
    graph = _load()
    stats = graph["stats"]
    files = [n for n in graph["nodes"].values() if n["kind"] == "file"]

    assert sum(stats["byProcess"].values()) == len(files)
    assert stats["byKind"]["file"] == len(files)
    assert stats["byKind"]["process"] == 9

    recount: dict[str, int] = {}
    for n in files:
        recount[n["primaryProcess"]] = recount.get(n["primaryProcess"], 0) + 1
    assert recount == stats["byProcess"]

    print("  Répartition fichiers par process (scan live) :")
    for pid in graph["rootIds"]:
        print(f"    {pid:8s} {stats['byProcess'].get(pid, 0)}")
    print(f"  OK — stats.byProcess cohérentes avec le recomptage direct ({len(files)} fichiers)")


def main() -> int:
    print("=== smoke architecture.code_map ===")
    test_scan_no_crash_and_shape()
    test_nine_root_ids()
    test_every_file_has_one_primary_process()
    test_no_duplicate_file_path()
    test_parent_and_children_consistency()
    test_process_refs_contains_primary()
    test_zero_unattributed()
    test_real_example_explain_py()
    test_transversal_example_perception_dispatch()
    test_process_stats_are_internally_coherent()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
