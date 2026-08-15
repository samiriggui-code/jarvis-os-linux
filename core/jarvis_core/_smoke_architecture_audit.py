"""Smoke D3 — architecture.audit() déterministe sur ArchitectureSnapshot.

Sans LLM, SSH, réseau, HUD, Hermes, Memory write, Verification write, D2.

    python -m jarvis_core._smoke_architecture_audit
"""
from __future__ import annotations

import copy
import json
import sys
import time

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _base_snap(**overrides):
    """Snapshot minimal synthétique (pas de seconde vérité — fixture de test)."""
    snap = {
        "schema_version": "1.0.0",
        "snapshot_id": "snap-test-fixed-id",
        "timestamp": "2026-08-13T00:00:00+00:00",
        "as_of": "2026-08-13T00:00:00+00:00",
        "freshness": "FRESH",
        "core": {
            "id": "core",
            "status": "CONFIGURED",
            "provenance": "CODE",
            "evidence": [],
            "stale": False,
        },
        "machines": [
            {
                "id": "hermes.host",
                "status": "UNKNOWN",
                "provenance": "DOC",
                "conflict": True,
                "resolved_by": None,
                "qualifiers": ["CONFLICT"],
                "claims": [
                    {"source": "doc:JARVIS_CONTEXT", "value": "nuc", "provenance": "DOC"},
                    {"source": "doc:ecosystem-hosts", "value": "vps", "provenance": "DOC"},
                ],
                "evidence": [],
                "stale": False,
            }
        ],
        "devices": [],
        "agents": [],
        "services": [],
        "tools": [],
        "llms": [],
        "providers": [],
        "capabilities": [],
        "connections": [
            {
                "id": "pi-to-freebox-adb",
                "from": "device:pi-salon",
                "to": "device:freebox-player",
                "kind": "adb",
                "provenance": "DOC",
                "status": "UNKNOWN",
            }
        ],
        "depends_on": [
            {
                "capability_id": "media.netflix.freebox",
                "chain": [
                    "core",
                    "device:pi-salon",
                    "service:adb",
                    "device:freebox-player",
                    "app:netflix",
                ],
                "provenance": "DOC",
            },
            {
                "capability_id": "apple_tv.control",
                "chain": ["core", "service:home_assistant", "device:apple_tv"],
                "provenance": "DOC",
            },
        ],
        "health": {},
        "limitations": ["fixture"],
        "evidence": [],
    }
    snap.update(overrides)
    return snap


def test_capability_available_observed_connected() -> None:
    from jarvis_core.architecture import AUDIT_CONNECTED, audit

    snap = _base_snap(
        capabilities=[
            {
                "id": "cap.observed",
                "status": "AVAILABLE",
                "provenance": "OBSERVED",
                "evidence": [{"kind": "probe", "ok": True, "at": "t"}],
                "stale": False,
                "observed_at": "2026-08-13T00:00:00+00:00",
            }
        ],
        depends_on=[],
    )
    report = audit(snap, capability_id="cap.observed")
    d = next(x for x in report["diagnostics"] if x["subject"] == "cap.observed")
    assert d["audit_status"] == AUDIT_CONNECTED, d
    assert d["reason"] == "observed_available"
    assert report["meta"]["llm_used"] is False
    print("  OK — capability AVAILABLE observée → CONNECTED")


def test_configured_not_available() -> None:
    from jarvis_core.architecture import AUDIT_CONNECTED, AUDIT_UNKNOWN, audit

    snap = _base_snap(
        capabilities=[
            {
                "id": "cap.cfg",
                "status": "CONFIGURED",
                "provenance": "CODE",
                "evidence": [],
                "stale": False,
            }
        ],
        depends_on=[],
    )
    report = audit(snap, capability_id="cap.cfg")
    d = next(x for x in report["diagnostics"] if x["subject"] == "cap.cfg")
    assert d["audit_status"] != AUDIT_CONNECTED
    assert d["audit_status"] == AUDIT_UNKNOWN
    assert "configured_without_observation" in d["reason"]
    print("  OK — CONFIGURED sans observation → pas CONNECTED/AVAILABLE")


def test_unknown_stays_unknown() -> None:
    from jarvis_core.architecture import AUDIT_UNKNOWN, audit

    snap = _base_snap(
        capabilities=[
            {
                "id": "cap.unk",
                "status": "UNKNOWN",
                "provenance": "DOC",
                "evidence": [],
                "stale": False,
            }
        ],
        depends_on=[],
    )
    report = audit(snap, capability_id="cap.unk")
    d = next(x for x in report["diagnostics"] if x["subject"] == "cap.unk")
    assert d["audit_status"] == AUDIT_UNKNOWN
    print("  OK — UNKNOWN → audit UNKNOWN")


def test_offline_dependency_degraded_or_offline() -> None:
    from jarvis_core.architecture import AUDIT_DEGRADED, AUDIT_OFFLINE, audit

    # core CONFIGURED maps UNKNOWN for chain; use OBSERVED AVAILABLE for core via device trick:
    # Put pi OFFLINE after a CONNECTED core — core entry must be CONNECTED for prior_connected
    snap = _base_snap(
        core={
            "id": "core",
            "status": "AVAILABLE",
            "provenance": "OBSERVED",
            "evidence": [{"kind": "local_process", "ok": True}],
            "stale": False,
        },
        devices=[
            {
                "id": "pi-salon",
                "status": "OFFLINE",
                "provenance": "OBSERVED",
                "evidence": [{"kind": "device_registry_last_seen", "ok": False}],
                "stale": False,
            }
        ],
        capabilities=[
            {
                "id": "media.netflix.freebox",
                "status": "UNKNOWN",
                "provenance": "DOC",
                "evidence": [],
                "stale": False,
            }
        ],
    )
    report = audit(snap, capability_id="media.netflix.freebox")
    d = next(x for x in report["diagnostics"] if x["subject"] == "media.netflix.freebox")
    assert d["audit_status"] in (AUDIT_DEGRADED, AUDIT_OFFLINE), d
    assert d["dependency_at_fault"] == "device:pi-salon"
    assert d["chain_walk"], "expected chain walk"
    print("  OK — dépendance OFFLINE → DEGRADED/OFFLINE")


def test_unknown_dependency_limitation() -> None:
    from jarvis_core.architecture import AUDIT_UNKNOWN, audit

    snap = _base_snap(
        core={
            "id": "core",
            "status": "AVAILABLE",
            "provenance": "OBSERVED",
            "evidence": [{"kind": "local", "ok": True}],
            "stale": False,
        },
        devices=[
            {
                "id": "pi-salon",
                "status": "AVAILABLE",
                "provenance": "OBSERVED",
                "evidence": [{"kind": "device_registry_last_seen", "ok": True}],
                "stale": False,
            }
        ],
        capabilities=[
            {
                "id": "media.netflix.freebox",
                "status": "UNKNOWN",
                "provenance": "DOC",
                "evidence": [],
                "stale": False,
            }
        ],
    )
    report = audit(snap, capability_id="media.netflix.freebox")
    d = next(x for x in report["diagnostics"] if x["subject"] == "media.netflix.freebox")
    # service:adb absent → MISSING/UNKNOWN with limitation
    assert d["audit_status"] in (AUDIT_UNKNOWN, "MISSING") or d["audit_status"] == "DEGRADED"
    assert d["dependency_at_fault"] == "service:adb"
    assert any("unknown_dependency:service:adb" in x or "dependency" in x for x in d["limitations"])
    assert any(
        s.get("ref") == "service:adb" and s.get("found") is False for s in d["chain_walk"]
    )
    print("  OK — dépendance UNKNOWN/absente → limitation explicite")


def test_stale_snapshot_certainty() -> None:
    from jarvis_core.architecture import audit

    snap = _base_snap(freshness="STALE")
    report = audit(snap, capability_id="apple_tv.control")
    assert report["snapshot_freshness"] == "STALE"
    assert report["certainty"] == "STALE"
    assert any("stale" in x.lower() for x in report["limitations"])
    print("  OK — snapshot STALE → certainty STALE, pas de certitude fraîche")


def test_hermes_conflict_preserved() -> None:
    from jarvis_core.architecture import audit

    snap = _base_snap()
    report = audit(snap)
    assert report["conflicts"], report
    hermes = next(c for c in report["conflicts"] if c["subject"] == "hermes.host")
    assert hermes["conflict"] is True
    assert hermes["resolved_by"] is None
    values = {c.get("value") for c in hermes["claims"]}
    assert "nuc" in values and "vps" in values
    print("  OK — conflit NUC/VPS conservé")


def test_no_mutation() -> None:
    from jarvis_core.architecture import audit

    snap = _base_snap(
        capabilities=[
            {
                "id": "apple_tv.control",
                "status": "PLANNED",
                "provenance": "DOC",
                "evidence": [],
                "stale": False,
            }
        ]
    )
    before = copy.deepcopy(snap)
    _ = audit(snap)
    assert snap == before
    print("  OK — aucune mutation du snapshot")


def test_no_network_ssh() -> None:
    from jarvis_core.architecture import audit

    snap = _base_snap()
    report = audit(snap)
    assert report["meta"]["network_probes"] is False
    assert report["meta"]["ssh_used"] is False
    assert report["meta"]["ondemand_audit"] is False
    print("  OK — aucun réseau/SSH / ondemand dans D3.0")


def test_reproducible() -> None:
    from jarvis_core.architecture import audit

    snap = _base_snap(
        capabilities=[
            {
                "id": "apple_tv.control",
                "status": "PLANNED",
                "provenance": "DOC",
                "evidence": [],
                "stale": False,
            }
        ]
    )
    a = audit(snap)
    b = audit(snap)
    assert a == b
    assert a["audit_id"] == "audit:snap-test-fixed-id"
    print("  OK — audit reproductible à snapshot identique")


def test_no_llm_memory_verification() -> None:
    from jarvis_core.architecture import audit

    snap = _base_snap()
    report = audit(snap)
    assert report["meta"]["llm_used"] is False
    assert report["meta"]["memory_writes"] is False
    assert report["meta"]["verification_writes"] is False
    assert report["meta"]["mutations"] is False
    print("  OK — pas LLM / Memory write / Verification write")


def test_live_snapshot_netflix_apple_tv() -> None:
    """Critère B′ D3 #8 — chaînes Netflix/Apple TV expliquées sans LLM."""
    from jarvis_core.architecture import AUDIT_CONNECTED, audit, snapshot

    snap = snapshot()
    report = audit(snap)
    assert report["snapshot_id"] == snap["snapshot_id"]
    by = {d["subject"]: d for d in report["diagnostics"] if d.get("kind") == "capability"}
    assert "media.netflix.freebox" in by
    assert "apple_tv.control" in by
    assert by["media.netflix.freebox"]["audit_status"] != AUDIT_CONNECTED
    assert by["apple_tv.control"]["chain_walk"] or by["apple_tv.control"]["chain"]
    assert report["meta"]["llm_used"] is False
    json.dumps(report)  # serializable
    print("  OK — snapshot live → Netflix/Apple TV expliqués (pas CONNECTED)")


def test_never_promote_doc_to_observed() -> None:
    from jarvis_core.architecture import AUDIT_CONNECTED, map_snapshot_status_to_audit

    status, reason = map_snapshot_status_to_audit(
        {"status": "CONFIGURED", "provenance": "DOC", "evidence": [], "stale": False}
    )
    assert status != AUDIT_CONNECTED
    status2, _ = map_snapshot_status_to_audit(
        {"status": "UNKNOWN", "provenance": "DOC", "evidence": [{"ok": True}], "stale": False}
    )
    assert status2 != AUDIT_CONNECTED
    # Fake AVAILABLE with DOC must not map to CONNECTED
    status3, _ = map_snapshot_status_to_audit(
        {"status": "AVAILABLE", "provenance": "DOC", "evidence": [{"ok": True}], "stale": False}
    )
    assert status3 != AUDIT_CONNECTED
    print("  OK — pas de promotion CONFIGURED/UNKNOWN/DOC → CONNECTED")


def test_device_online_does_not_prove_action_success() -> None:
    """Cas de smoke obligatoire : un équipement ONLINE n'est pas la preuve qu'une ACTION a réussi."""
    from jarvis_core.architecture import AUDIT_CONNECTED, audit

    snap = _base_snap(
        core={
            "id": "core",
            "status": "AVAILABLE",
            "provenance": "OBSERVED",
            "evidence": [{"kind": "local", "ok": True}],
            "stale": False,
        },
        capabilities=[
            {
                # La capacité elle-même est OBSERVED AVAILABLE (ex. device en ligne) —
                # mais la chaîne se termine sur une app jamais confirmée.
                "id": "device.pi_salon.online",
                "status": "AVAILABLE",
                "provenance": "OBSERVED",
                "evidence": [{"kind": "device_registry_last_seen", "ok": True}],
                "stale": False,
                "observed_at": "2026-08-13T00:00:00+00:00",
            }
        ],
        depends_on=[
            {
                "capability_id": "device.pi_salon.online",
                "chain": ["core", "app:netflix"],
                "provenance": "DOC",
            }
        ],
    )
    report = audit(snap, capability_id="device.pi_salon.online")
    d = next(x for x in report["diagnostics"] if x["subject"] == "device.pi_salon.online")
    # Le device seul est CONNECTED, mais la chaîne applicative ne l'est pas :
    # l'audit ne doit jamais prétendre que l'app (l'action) a réussi pour autant.
    assert d["audit_status"] != AUDIT_CONNECTED, d
    assert "device_online_ne_prouve_pas_application" in d["limitations"], d
    print("  OK — équipement ONLINE ≠ preuve qu'une action/app a réussi")


def main() -> int:
    print("=== smoke architecture.audit D3 ===")
    test_capability_available_observed_connected()
    test_configured_not_available()
    test_unknown_stays_unknown()
    test_offline_dependency_degraded_or_offline()
    test_unknown_dependency_limitation()
    test_stale_snapshot_certainty()
    test_hermes_conflict_preserved()
    test_no_mutation()
    test_no_network_ssh()
    test_reproducible()
    test_no_llm_memory_verification()
    test_live_snapshot_netflix_apple_tv()
    test_never_promote_doc_to_observed()
    test_device_online_does_not_prove_action_success()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
