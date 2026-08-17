"""Smoke D1 — architecture.snapshot() read-only.

Sans réseau, SSH, HUD, Hermes HTTP, Memory, Verification.

    python -m jarvis_core._smoke_architecture_snapshot
"""
from __future__ import annotations

import json
import sys
import time

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _walk_available(node, path="$"):
    """Yield (path, entry) for dicts with status==AVAILABLE."""
    if isinstance(node, dict):
        if node.get("status") == "AVAILABLE":
            yield path, node
        for k, v in node.items():
            yield from _walk_available(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _walk_available(v, f"{path}[{i}]")


def test_snapshot_shape() -> None:
    from jarvis_core.architecture import SCHEMA_VERSION, snapshot

    snap = snapshot()
    assert isinstance(snap, dict)
    assert snap.get("schema_version") == SCHEMA_VERSION
    assert snap.get("snapshot_id")
    assert snap.get("timestamp")
    assert snap.get("as_of")
    assert snap.get("freshness") in ("FRESH", "STALE", "PARTIAL")
    for key in (
        "core",
        "machines",
        "devices",
        "agents",
        "services",
        "tools",
        "llms",
        "providers",
        "capabilities",
        "connections",
        "depends_on",
        "health",
        "limitations",
        "evidence",
    ):
        assert key in snap, f"missing {key}"
    # JSON serializable
    json.dumps(snap)
    print("  OK — schema_version, snapshot_id, freshness, keys, JSON")


def test_provenance_and_limitations() -> None:
    from jarvis_core.architecture import snapshot

    snap = snapshot()
    assert any("d1_sync" in x or "no_network" in x for x in snap["limitations"])
    # capabilities are CODE, not AVAILABLE via .available
    caps = snap["capabilities"]
    assert caps
    assert all(c.get("status") != "AVAILABLE" or c.get("provenance") == "OBSERVED" for c in caps)
    legacy_notes = [c for c in caps if "available" in str(c.get("note") or "").lower()]
    assert legacy_notes, "expected note about Capability.available ignored"
    print("  OK — provenance / limitations / Capability.available ignored")


def test_available_invariant() -> None:
    from jarvis_core.architecture import assert_available_invariant, snapshot
    from jarvis_core.architecture.schema import enforce_available_or_downgrade

    snap = snapshot()
    for path, entry in _walk_available(snap):
        assert assert_available_invariant(entry), f"invariant broken at {path}: {entry}"

    # Force bad AVAILABLE → downgrade
    bad = {
        "status": "AVAILABLE",
        "provenance": "CODE",
        "evidence": [],
        "stale": False,
    }
    fixed = enforce_available_or_downgrade(bad)
    assert fixed["status"] != "AVAILABLE"
    print("  OK — AVAILABLE invariant (+ downgrade)")


def test_removed_agent_service_absent() -> None:
    from jarvis_core.architecture import snapshot

    snap = snapshot()
    assert all(m.get("id") != "hermes.host" for m in snap["machines"])
    assert all(s.get("name") != "hermes" for s in snap["services"])
    print("  OK — service agent supprimé du snapshot")


def test_no_secrets() -> None:
    import os

    from jarvis_core.architecture import snapshot, snapshot_contains_secret

    # Inject fake secret in env-derived fields path via probe_store evidence
    store = {
        "ttl_s": 120,
        "services": [
            {
                "id": "service:evil",
                "name": "evil",
                "status": "AVAILABLE",
                "observed_epoch": time.time(),
                "evidence": [
                    {
                        "kind": "http_health",
                        "at": "now",
                        "ok": True,
                        "detail": "Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz012345",
                    }
                ],
            }
        ],
    }
    snap = snapshot(probe_store=store)
    assert not snapshot_contains_secret(snap), snap
    # Redacted marker somewhere
    blob = json.dumps(snap)
    assert "sk-abcdefghijklmnopqrstuvwxyz012345" not in blob
    assert "REDACTED" in blob
    # Env key must not appear even if set
    os.environ["OPENROUTER_API_KEY"] = "sk-shouldneverappearinthejsonoutputxx"
    try:
        snap2 = snapshot()
        assert "sk-shouldneverappearinthejsonoutputxx" not in json.dumps(snap2)
        assert not snapshot_contains_secret(snap2)
    finally:
        os.environ.pop("OPENROUTER_API_KEY", None)
    print("  OK — secrets redactés")


def test_unknown_without_proof() -> None:
    from jarvis_core.architecture import snapshot

    snap = snapshot()  # no registry, no supervisor
    # apple_tv / netflix not AVAILABLE
    caps = {c["id"]: c for c in snap["capabilities"]}
    assert caps["apple_tv.control"]["status"] in ("PLANNED", "DISCOVERED", "UNKNOWN")
    assert caps["apple_tv.control"]["status"] != "AVAILABLE"
    assert caps["media.netflix.freebox"]["status"] != "AVAILABLE"
    # OpenRouter without key → UNCONFIGURED provider
    prov = {p["id"]: p for p in snap["providers"]}
    assert prov["provider:openrouter"]["status"] in ("UNCONFIGURED", "CONFIGURED")
    if prov["provider:openrouter"]["status"] == "CONFIGURED":
        # still not AVAILABLE without probe
        llms = [x for x in snap["llms"] if x.get("provider") == "openrouter"]
        assert all(x.get("status") != "AVAILABLE" for x in llms)
    print("  OK — UNKNOWN/PLANNED sans preuve, pas d'AVAILABLE fantôme")


def test_no_mutation_and_devices_observed() -> None:
    from jarvis_core.architecture import snapshot
    from jarvis_core.devices import DeviceRegistry

    reg = DeviceRegistry(ttl_s=60)
    before = set(reg._devices.keys())  # noqa: SLF001
    reg.register("pc-test", type="pc_client", runtime_kind="windows_agent", label="test")
    mid = set(reg._devices.keys())  # noqa: SLF001
    snap = snapshot(devices_registry=reg)
    after = set(reg._devices.keys())  # noqa: SLF001
    assert mid == after  # snapshot n'ajoute/supprime pas de devices
    assert "pc-test" in after
    # Device online fresh → peut être AVAILABLE avec evidence OBSERVED
    devs = {d["id"]: d for d in snap["devices"]}
    assert "pc-test" in devs
    d = devs["pc-test"]
    assert d["provenance"] == "OBSERVED"
    assert d["evidence"]
    assert d["status"] == "AVAILABLE"
    assert d.get("stale") is False
    # Agents list includes windows_agent
    assert any(a.get("device_id") == "pc-test" for a in snap["agents"])
    # before keys subset
    assert before <= after
    print("  OK — pas de mutation registry + device OBSERVED→AVAILABLE")


def test_depends_on_doc_chains() -> None:
    from jarvis_core.architecture import snapshot

    snap = snapshot()
    ids = {d["capability_id"] for d in snap["depends_on"]}
    assert "media.netflix.freebox" in ids
    assert "apple_tv.control" in ids
    assert snap["connections"]
    print("  OK — connections / depends_on DOC présents")


def test_stale_cannot_be_available() -> None:
    from jarvis_core.architecture import snapshot
    from jarvis_core.devices import DeviceRegistry

    reg = DeviceRegistry(ttl_s=0.05)
    reg.register("old-pc", type="pc_client", runtime_kind="windows_agent")
    time.sleep(0.08)
    snap = snapshot(devices_registry=reg)
    d = next(x for x in snap["devices"] if x["id"] == "old-pc")
    assert d.get("stale") is True or d["status"] != "AVAILABLE"
    if d["status"] == "AVAILABLE":
        raise AssertionError("stale device must not be AVAILABLE")
    print("  OK — stale ⇒ pas AVAILABLE")


def main() -> int:
    print("=== smoke architecture.snapshot D1 ===")
    test_snapshot_shape()
    test_provenance_and_limitations()
    test_available_invariant()
    test_removed_agent_service_absent()
    test_no_secrets()
    test_unknown_without_proof()
    test_no_mutation_and_devices_observed()
    test_depends_on_doc_chains()
    test_stale_cannot_be_available()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
