"""Smoke D2.1 — build_llm_bound_payload(snapshot, audit) pur.

Aucun LLM, réseau, SSH, Memory, Hermes, HUD, HA.

    python -m jarvis_core._smoke_architecture_llm_payload
"""
from __future__ import annotations

import copy
import json
import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _fixture_snap(**overrides):
    snap = {
        "schema_version": "1.0.0",
        "snapshot_id": "snap-d21-fixed",
        "timestamp": "2026-08-13T02:00:00+00:00",
        "as_of": "2026-08-13T02:00:00+00:00",
        "freshness": "PARTIAL",
        "core": {"id": "core", "status": "CONFIGURED", "provenance": "CODE", "evidence": [], "stale": False},
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
        "devices": [
            {
                "id": "pc-unknown",
                "status": "UNKNOWN",
                "provenance": "UNKNOWN",
                "evidence": [],
                "stale": False,
            }
        ],
        "agents": [],
        "services": [
            {
                "id": "service:evil",
                "name": "evil",
                "status": "CONFIGURED",
                "provenance": "CODE",
                "evidence": [{"detail": "token=sk-abcdefghijklmnopqrstuvwxyz012345"}],
                "stale": False,
            }
        ],
        "tools": [],
        "llms": [],
        "providers": [],
        "capabilities": [
            {
                "id": "media.netflix.freebox",
                "status": "UNKNOWN",
                "provenance": "DOC",
                "evidence": [],
                "stale": False,
            }
        ],
        "connections": [
            {
                "id": "core-to-pi",
                "from": "core",
                "to": "device:pi-salon",
                "kind": "ws_or_http",
                "provenance": "CODE",
                "status": "UNKNOWN",
            }
        ],
        "depends_on": [
            {
                "capability_id": "media.netflix.freebox",
                "chain": ["core", "device:pi-salon", "service:adb", "app:netflix"],
                "provenance": "DOC",
            }
        ],
        "health": {},
        "limitations": ["fixture_d21", "coverage_partial"],
        "evidence": [],
    }
    snap.update(overrides)
    return snap


def test_deterministic_identical() -> None:
    from jarvis_core.architecture import audit, build_llm_bound_payload

    snap = _fixture_snap()
    aud = audit(snap)
    a = build_llm_bound_payload(snap, aud)
    b = build_llm_bound_payload(snap, aud)
    assert a == b
    json.dumps(a)
    print("  OK — même snapshot+audit → payload identique + JSON")


def test_no_invented_ghost() -> None:
    from jarvis_core.architecture import audit, build_llm_bound_payload

    snap = _fixture_snap()
    assert not any(
        (e.get("id") or "").lower().endswith("ghost") or "ghost" in str(e.get("id") or "").lower()
        for e in (snap.get("agents") or [])
    )
    payload = build_llm_bound_payload(snap, audit(snap))
    blob = json.dumps(payload).lower()
    assert "agent:ghost" not in blob
    assert '"ghost"' not in blob
    print("  OK — adversarial : aucun agent:ghost inventé")


def test_no_available_added() -> None:
    from jarvis_core.architecture import audit, build_llm_bound_payload

    snap = _fixture_snap()
    # Fixture has no AVAILABLE
    for family in ("devices", "services", "capabilities", "llms"):
        for e in snap.get(family) or []:
            assert e.get("status") != "AVAILABLE"
    payload = build_llm_bound_payload(snap, audit(snap))
    for family, rows in (payload.get("components") or {}).items():
        for e in rows:
            # Builder must not promote
            if e.get("status") == "AVAILABLE":
                raise AssertionError(f"AVAILABLE inventé dans {family}: {e}")
    print("  OK — aucun AVAILABLE ajouté")


def test_unknown_stays_unknown() -> None:
    from jarvis_core.architecture import audit, build_llm_bound_payload

    payload = build_llm_bound_payload(_fixture_snap(), audit(_fixture_snap()))
    caps = {c["id"]: c for c in payload["components"]["capabilities"]}
    assert caps["media.netflix.freebox"]["status"] == "UNKNOWN"
    assert caps["media.netflix.freebox"]["provenance"] == "DOC"
    print("  OK — UNKNOWN reste UNKNOWN + provenance")


def test_hermes_conflict_unresolved() -> None:
    from jarvis_core.architecture import audit, build_llm_bound_payload

    payload = build_llm_bound_payload(_fixture_snap(), audit(_fixture_snap()))
    hermes = next(c for c in payload["conflicts"] if c["subject"] == "hermes.host")
    assert hermes["conflict"] is True
    assert hermes["resolved_by"] is None
    values = {c.get("value") for c in hermes["claims"]}
    assert "nuc" in values and "vps" in values
    print("  OK — conflit Hermes NUC/VPS non résolu")


def test_secrets_redacted() -> None:
    from jarvis_core.architecture import audit, build_llm_bound_payload, snapshot_contains_secret

    snap = _fixture_snap()
    payload = build_llm_bound_payload(snap, audit(snap))
    blob = json.dumps(payload)
    assert "sk-abcdefghijklmnopqrstuvwxyz012345" not in blob
    assert not snapshot_contains_secret(payload)
    print("  OK — secrets redactés")


def test_limitations_and_connections() -> None:
    from jarvis_core.architecture import audit, build_llm_bound_payload

    snap = _fixture_snap()
    payload = build_llm_bound_payload(snap, audit(snap))
    assert "fixture_d21" in payload["limitations"]
    assert payload["connections"]
    assert payload["depends_on"]
    assert payload["schema_version"]
    assert payload["snapshot_id"] == "snap-d21-fixed"
    assert payload["timestamp"]
    assert payload["as_of"]
    assert payload["freshness"] == "PARTIAL"
    assert "audit" in payload and payload["audit"].get("diagnostics") is not None
    assert payload["provenance"]
    print("  OK — schema/limitations/connections/depends_on/audit/provenance")


def test_stale_preserved() -> None:
    from jarvis_core.architecture import audit, build_llm_bound_payload

    snap = _fixture_snap(freshness="STALE")
    payload = build_llm_bound_payload(snap, audit(snap))
    assert payload["freshness"] == "STALE"
    assert payload["stale"] is True
    print("  OK — snapshot STALE reste stale")


def test_no_mutation_no_network_no_llm() -> None:
    from jarvis_core.architecture import audit, build_llm_bound_payload

    snap = _fixture_snap()
    before = copy.deepcopy(snap)
    aud = audit(snap)
    aud_before = copy.deepcopy(aud)
    payload = build_llm_bound_payload(snap, aud)
    assert snap == before
    assert aud == aud_before
    assert payload["meta"]["llm_called"] is False
    assert payload["meta"]["network_probes"] is False
    assert payload["meta"]["memory_recall"] is False
    assert payload["meta"]["hermes_tools"] is False
    assert payload["meta"]["mutations"] is False
    assert payload["meta"]["contract"] == "D2.1"
    print("  OK — pas mutation / réseau / LLM / Memory / Hermes")


def test_required_keys() -> None:
    from jarvis_core.architecture import LLM_BOUND_SCHEMA_VERSION, audit, build_llm_bound_payload

    payload = build_llm_bound_payload(_fixture_snap(), audit(_fixture_snap()))
    for key in (
        "schema_version",
        "snapshot_id",
        "timestamp",
        "as_of",
        "freshness",
        "audit",
        "limitations",
        "provenance",
        "evidence",
        "connections",
        "depends_on",
        "conflicts",
    ):
        assert key in payload, key
    assert payload["schema_version"] == LLM_BOUND_SCHEMA_VERSION
    print("  OK — clés contrat D2.1 présentes")


def main() -> int:
    print("=== smoke architecture.llm_payload D2.1 ===")
    test_deterministic_identical()
    test_no_invented_ghost()
    test_no_available_added()
    test_unknown_stays_unknown()
    test_hermes_conflict_unresolved()
    test_secrets_redacted()
    test_limitations_and_connections()
    test_stale_preserved()
    test_no_mutation_no_network_no_llm()
    test_required_keys()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
