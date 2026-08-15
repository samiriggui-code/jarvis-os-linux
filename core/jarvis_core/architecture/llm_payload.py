"""Architecture Awareness D2.1 — contrat d'ancrage LLM (payload pur).

``ArchitectureSnapshot + ArchitectureAudit → llm_bound_payload → (futur LLM)``

Aucun LLM, réseau, SSH, Memory, Hermes, probe. Déterministe, JSON-serializable.
N'ajoute aucune information absente du snapshot/audit.
"""
from __future__ import annotations

import copy
from typing import Any

from .schema import SCHEMA_VERSION, redact_tree, snapshot_contains_secret

LLM_BOUND_SCHEMA_VERSION = "1.0.0"

_INSTRUCTION = (
    "Tu n'as aucune connaissance d'architecture comme vérité. "
    "Tu ne peux affirmer que les données de ce payload (snapshot ancré + audit). "
    "N'utilise pas la mémoire conversationnelle ni l'historique Hermes comme source d'état. "
    "Ne résous pas les conflicts[]. "
    "Ne transforme jamais UNKNOWN/CONFIGURED en AVAILABLE. "
    "AVAILABLE ne peut être affirmé que s'il figure déjà dans le snapshot avec "
    "provenance OBSERVED, evidence non vide et stale=false. "
    "Device ONLINE ≠ succès d'action (Verification). "
    "Si un composant est absent du payload, il est inconnu — ne l'invente pas."
)


def build_llm_bound_payload(
    snapshot: dict[str, Any],
    audit: dict[str, Any],
) -> dict[str, Any]:
    """
    Constructeur pur D2.1 : ancre le futur LLM au snapshot+audit uniquement.

    Déterministe pour un couple (snapshot, audit) identique.
    Redacte les secrets. Aucune mutation des entrées.
    """
    if not isinstance(snapshot, dict):
        raise TypeError("snapshot must be a dict")
    if not isinstance(audit, dict):
        raise TypeError("audit must be a dict")

    snap = redact_tree(copy.deepcopy(snapshot))
    aud = redact_tree(copy.deepcopy(audit))

    snap_id = snap.get("snapshot_id")
    ts = snap.get("timestamp") or snap.get("as_of")
    as_of = snap.get("as_of") or ts
    if not snap_id or not ts:
        raise ValueError("snapshot must include snapshot_id and timestamp/as_of")

    # Alignement : audit doit référencer le même snapshot quand présent
    audit_snap_id = aud.get("snapshot_id")
    if audit_snap_id and audit_snap_id != snap_id:
        # Ne pas inventer de fusion — exposer la limitation
        mismatch = True
    else:
        mismatch = False

    limitations = sorted(
        set(list(snap.get("limitations") or []) + list(aud.get("limitations") or []))
    )
    limitations.append("d2_1_llm_bound_payload_snapshot_audit_only")
    limitations.append("d2_1_no_conversation_memory_as_truth")
    limitations.append("d2_1_no_network_no_llm_call_in_builder")
    if mismatch:
        limitations.append("audit_snapshot_id_mismatch")

    conflicts = list(aud.get("conflicts") or [])
    if not conflicts:
        conflicts = _conflicts_from_snapshot(snap)

    payload = {
        "schema_version": LLM_BOUND_SCHEMA_VERSION,
        "snapshot_schema_version": snap.get("schema_version") or SCHEMA_VERSION,
        "instruction": _INSTRUCTION,
        "snapshot_id": snap_id,
        "timestamp": ts,
        "as_of": as_of,
        "freshness": snap.get("freshness"),
        "stale": snap.get("freshness") == "STALE",
        "audit": {
            "audit_id": aud.get("audit_id"),
            "schema_version": aud.get("schema_version"),
            "certainty": aud.get("certainty"),
            "snapshot_freshness": aud.get("snapshot_freshness") or snap.get("freshness"),
            "diagnostics": list(aud.get("diagnostics") or []),
            "ecosystem": aud.get("ecosystem"),
            "meta": {
                "deterministic": True,
                "llm_used": False,
                "network_probes": False,
                "source": "architecture.audit",
            },
        },
        "limitations": sorted(set(limitations)),
        "provenance": _index_provenance(snap),
        "evidence": _collect_safe_evidence(snap),
        "connections": list(snap.get("connections") or []),
        "depends_on": list(snap.get("depends_on") or []),
        "conflicts": conflicts,
        "components": _component_index(snap),
        "meta": {
            "deterministic": True,
            "llm_called": False,
            "network_probes": False,
            "memory_recall": False,
            "hermes_tools": False,
            "mutations": False,
            "sources": ["ArchitectureSnapshot", "architecture.audit"],
            "contract": "D2.1",
        },
    }

    out = redact_tree(payload)
    if snapshot_contains_secret(out):
        # Défense : ne jamais renvoyer un payload contaminé
        raise RuntimeError("llm_bound_payload contained unredacted secret — builder bug")
    return out


def _conflicts_from_snapshot(snap: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in snap.get("machines") or []:
        if isinstance(m, dict) and (m.get("conflict") or "CONFLICT" in (m.get("qualifiers") or [])):
            out.append(
                {
                    "subject": m.get("id"),
                    "conflict": True,
                    "resolved_by": m.get("resolved_by"),
                    "claims": list(m.get("claims") or []),
                    "status": m.get("status"),
                    "provenance": m.get("provenance"),
                    "note": "documentary_conflict_preserved_not_resolved",
                }
            )
    return out


def _index_provenance(snap: dict[str, Any]) -> list[dict[str, Any]]:
    """Liste provenance par composant — jamais inventée."""
    rows: list[dict[str, Any]] = []
    for family in (
        "machines",
        "devices",
        "agents",
        "services",
        "tools",
        "llms",
        "providers",
        "capabilities",
    ):
        for e in snap.get(family) or []:
            if not isinstance(e, dict) or not e.get("id"):
                continue
            rows.append(
                {
                    "id": e.get("id"),
                    "family": family,
                    "provenance": e.get("provenance"),
                    "status": e.get("status"),
                }
            )
    return rows


def _collect_safe_evidence(snap: dict[str, Any]) -> list[dict[str, Any]]:
    """Evidence déjà présentes dans le snapshot (redactées avec le tree)."""
    out: list[dict[str, Any]] = []
    for item in snap.get("evidence") or []:
        if isinstance(item, dict):
            out.append(dict(item))
    for family in ("devices", "agents", "services", "llms", "capabilities", "machines"):
        for e in snap.get(family) or []:
            if not isinstance(e, dict):
                continue
            for ev in e.get("evidence") or []:
                if isinstance(ev, dict):
                    row = dict(ev)
                    row["parent_id"] = e.get("id")
                    row["family"] = family
                    out.append(row)
    return out


def _component_index(snap: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Index mince : id/status/provenance/qualifiers/stale/conflict — pas d'invention."""

    def slim(entries: list[Any]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for e in entries or []:
            if not isinstance(e, dict) or not e.get("id"):
                continue
            rows.append(
                {
                    "id": e.get("id"),
                    "status": e.get("status"),
                    "provenance": e.get("provenance"),
                    "qualifiers": list(e.get("qualifiers") or []),
                    "stale": e.get("stale"),
                    "conflict": e.get("conflict"),
                    "resolved_by": e.get("resolved_by"),
                    "observed_at": e.get("observed_at"),
                    "evidence_count": len(e.get("evidence") or [])
                    if isinstance(e.get("evidence"), list)
                    else 0,
                }
            )
        return rows

    return {
        "machines": slim(snap.get("machines") or []),
        "devices": slim(snap.get("devices") or []),
        "agents": slim(snap.get("agents") or []),
        "services": slim(snap.get("services") or []),
        "llms": slim(snap.get("llms") or []),
        "providers": slim(snap.get("providers") or []),
        "capabilities": slim(snap.get("capabilities") or []),
    }
