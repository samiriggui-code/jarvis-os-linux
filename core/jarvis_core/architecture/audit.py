"""Architecture Awareness D3 — architecture.audit() déterministe.

Consomme uniquement un ArchitectureSnapshot. Aucune seconde source de vérité.
Aucun LLM, SSH, probe réseau, Memory/Verification write, auto-remediation.

ON_DEMAND_AUDIT (B′ §15) est volontairement hors de ce livrable D3.0 —
feu vert Samir : pas de nouveau probe dans D3.
"""
from __future__ import annotations

import copy
from typing import Any

from .schema import (
    PROVENANCE_CODE,
    PROVENANCE_DOC,
    PROVENANCE_OBSERVED,
    PROVENANCE_UNKNOWN,
    SCHEMA_VERSION,
    assert_available_invariant,
    redact_tree,
)

AUDIT_SCHEMA_VERSION = "1.0.0"

# Sorties d'audit (B′ §15) — jamais AVAILABLE (c'est un statut snapshot)
AUDIT_CONNECTED = "CONNECTED"
AUDIT_DEGRADED = "DEGRADED"
AUDIT_OFFLINE = "OFFLINE"
AUDIT_MISSING = "MISSING"
AUDIT_UNCONFIGURED = "UNCONFIGURED"
AUDIT_UNKNOWN = "UNKNOWN"

_VALID_AUDIT = frozenset(
    {
        AUDIT_CONNECTED,
        AUDIT_DEGRADED,
        AUDIT_OFFLINE,
        AUDIT_MISSING,
        AUDIT_UNCONFIGURED,
        AUDIT_UNKNOWN,
    }
)


def audit(
    snapshot: dict[str, Any],
    *,
    capability_id: str | None = None,
) -> dict[str, Any]:
    """
    Compile un AuditReport déterministe à partir d'un ArchitectureSnapshot.

    Read-only : ne mute pas ``snapshot``. Reproductible pour un snapshot identique
    (même ``audit_id`` dérivé de ``snapshot_id``).
    """
    if not isinstance(snapshot, dict):
        raise TypeError("architecture.audit() requires an ArchitectureSnapshot dict")

    # Copie defensive — aucune mutation de l'entrée
    snap = copy.deepcopy(snapshot)

    snap_id = str(snap.get("snapshot_id") or "")
    freshness = str(snap.get("freshness") or "PARTIAL")
    limitations: list[str] = list(snap.get("limitations") or [])
    limitations.append("d3_audit_snapshot_only_no_ondemand_probes")
    limitations.append("d3_audit_does_not_validate_actions")  # Verification séparée

    certainty = _certainty_from_freshness(freshness)
    if certainty != "HIGH":
        limitations.append(f"snapshot_certainty_{certainty.lower()}")

    index = _build_index(snap)
    conflicts = _extract_conflicts(snap)

    diagnostics: list[dict[str, Any]] = []

    # 1) Capacités (filtrées optionnellement)
    caps = list(snap.get("capabilities") or [])
    if capability_id:
        caps = [c for c in caps if c.get("id") == capability_id or c.get("app_id") == capability_id]
        if not caps:
            diagnostics.append(
                _diag(
                    subject=capability_id,
                    kind="capability",
                    audit_status=AUDIT_MISSING,
                    reason="capability_absent_from_snapshot",
                    provenance=PROVENANCE_UNKNOWN,
                    limitations=["capability_not_in_snapshot"],
                    snapshot_freshness=freshness,
                    certainty=certainty,
                )
            )

    depends_by_cap = {
        d.get("capability_id"): d for d in (snap.get("depends_on") or []) if d.get("capability_id")
    }

    for cap in caps:
        cid = str(cap.get("id") or cap.get("app_id") or "")
        dep = depends_by_cap.get(cid)
        diagnostics.append(
            _audit_capability(
                cap,
                dep,
                index,
                snap,
                freshness=freshness,
                certainty=certainty,
            )
        )

    # 2) Si pas de filtre : chaînes depends_on sans entrée capability (filet)
    if not capability_id:
        seen = {d.get("subject") for d in diagnostics}
        for dep in snap.get("depends_on") or []:
            cid = dep.get("capability_id")
            if cid and cid not in seen:
                diagnostics.append(
                    _audit_capability(
                        {
                            "id": cid,
                            "status": "UNKNOWN",
                            "provenance": PROVENANCE_DOC,
                            "evidence": [],
                            "qualifiers": [],
                            "stale": False,
                        },
                        dep,
                        index,
                        snap,
                        freshness=freshness,
                        certainty=certainty,
                    )
                )

        # 3) Écosystème dégradé / offline (composants runtime)
        diagnostics.extend(
            _ecosystem_component_diagnostics(snap, freshness=freshness, certainty=certainty)
        )

    report = {
        "schema_version": AUDIT_SCHEMA_VERSION,
        "snapshot_schema_version": snap.get("schema_version") or SCHEMA_VERSION,
        "audit_id": f"audit:{snap_id}" if snap_id else "audit:missing_snapshot_id",
        "snapshot_id": snap_id or None,
        "timestamp": snap.get("timestamp"),
        "as_of": snap.get("as_of"),
        "snapshot_freshness": freshness,
        "certainty": certainty,
        "diagnostics": diagnostics,
        "conflicts": conflicts,
        "ecosystem": _ecosystem_summary(diagnostics),
        "limitations": sorted(set(limitations)),
        "meta": {
            "deterministic": True,
            "llm_used": False,
            "network_probes": False,
            "ssh_used": False,
            "memory_writes": False,
            "verification_writes": False,
            "mutations": False,
            "source": "ArchitectureSnapshot",
            "ondemand_audit": False,
        },
    }
    return redact_tree(report)


def map_snapshot_status_to_audit(entry: dict[str, Any] | None) -> tuple[str, str]:
    """
    Mappe un statut snapshot → (audit_status, reason).
    Ne promeut jamais CONFIGURED/UNKNOWN/DOC → AVAILABLE/CONNECTED sans preuve.
    """
    if entry is None:
        return AUDIT_MISSING, "component_absent_from_snapshot"

    status = str(entry.get("status") or "UNKNOWN")
    provenance = str(entry.get("provenance") or PROVENANCE_UNKNOWN)
    stale = bool(entry.get("stale"))
    evidence = entry.get("evidence") if isinstance(entry.get("evidence"), list) else []

    if status == "AVAILABLE":
        if (
            provenance == PROVENANCE_OBSERVED
            and evidence
            and not stale
            and assert_available_invariant(entry)
        ):
            return AUDIT_CONNECTED, "observed_available"
        # AVAILABLE invalide ne doit pas arriver (D1), mais on ne ment pas
        return AUDIT_UNKNOWN, "available_invariant_not_met"

    if status == "DEGRADED":
        return AUDIT_DEGRADED, "snapshot_degraded"

    if status == "OFFLINE":
        return AUDIT_OFFLINE, "snapshot_offline"

    if status == "UNCONFIGURED":
        return AUDIT_UNCONFIGURED, "snapshot_unconfigured"

    if status == "CONFIGURED":
        return AUDIT_UNKNOWN, "configured_without_observation"

    if status == "DISCOVERED":
        return AUDIT_UNKNOWN, "discovered_not_validated"

    if status == "PLANNED":
        return AUDIT_MISSING, "planned_not_implemented"

    if status == "BLOCKED":
        return AUDIT_UNKNOWN, "blocked_by_policy_or_flag"

    if status == "UNKNOWN":
        return AUDIT_UNKNOWN, "insufficient_evidence"

    return AUDIT_UNKNOWN, f"unmapped_snapshot_status:{status}"


def _certainty_from_freshness(freshness: str) -> str:
    if freshness == "FRESH":
        return "HIGH"
    if freshness == "STALE":
        return "STALE"
    return "LIMITED"  # PARTIAL or unknown


def _build_index(snap: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Index multi-alias des entrées snapshot pour résoudre depends_on / connections."""
    index: dict[str, dict[str, Any]] = {}

    core = snap.get("core")
    if isinstance(core, dict):
        c = dict(core)
        c.setdefault("id", "core")
        c.setdefault("status", "CONFIGURED")
        c.setdefault("provenance", PROVENANCE_CODE)
        c.setdefault("evidence", [])
        c.setdefault("stale", False)
        index["core"] = c

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
        for entry in snap.get(family) or []:
            if not isinstance(entry, dict):
                continue
            eid = entry.get("id")
            if not eid:
                continue
            eid_s = str(eid)
            index[eid_s] = entry
            # Préfixes famille
            if family == "devices":
                index[f"device:{eid_s}"] = entry
            elif family == "services":
                index[f"service:{eid_s}"] = entry
                name = entry.get("name")
                if name:
                    index[f"service:{name}"] = entry
            elif family == "agents":
                index[f"agent:{eid_s}"] = entry if not eid_s.startswith("agent:") else entry
                did = entry.get("device_id")
                if did:
                    index[f"agent:{did}"] = entry
            elif family == "machines":
                index[f"machine:{eid_s}"] = entry
            elif family == "capabilities":
                index[f"capability:{eid_s}"] = entry
                app = entry.get("app_id")
                if app:
                    index[str(app)] = entry
                    index[f"capability:{app}"] = entry
            elif family == "llms":
                index[f"llm:{eid_s}"] = entry if not eid_s.startswith("llm:") else entry
            elif family == "providers":
                index[f"provider:{eid_s}"] = entry if not eid_s.startswith("provider:") else entry

    # Connections indexées par id
    for conn in snap.get("connections") or []:
        if isinstance(conn, dict) and conn.get("id"):
            index[f"connection:{conn['id']}"] = conn

    return index


def _resolve(ref: str, index: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    if ref in index:
        return index[ref]
    # Essais d'alias courants
    for key in (ref, f"device:{ref}", f"service:{ref}", f"agent:{ref}", f"capability:{ref}"):
        if key in index:
            return index[key]
    return None


def _extract_conflicts(snap: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for family in ("machines", "devices", "services", "capabilities", "llms"):
        for entry in snap.get(family) or []:
            if not isinstance(entry, dict):
                continue
            if entry.get("conflict") is True or "CONFLICT" in (entry.get("qualifiers") or []):
                out.append(
                    {
                        "subject": entry.get("id"),
                        "family": family,
                        "conflict": True,
                        "resolved_by": entry.get("resolved_by"),
                        "claims": list(entry.get("claims") or []),
                        "status": entry.get("status"),
                        "provenance": entry.get("provenance"),
                        "limitations": list(entry.get("limitations") or []),
                        "note": "documentary_conflict_preserved_not_resolved",
                    }
                )
    return out


def _diag(**kwargs: Any) -> dict[str, Any]:
    audit_status = kwargs.get("audit_status", AUDIT_UNKNOWN)
    if audit_status not in _VALID_AUDIT:
        audit_status = AUDIT_UNKNOWN
        kwargs["reason"] = f"invalid_audit_status_coerced:{kwargs.get('audit_status')}"
    return {
        "subject": kwargs.get("subject"),
        "kind": kwargs.get("kind", "component"),
        "audit_status": audit_status,
        "reason": kwargs.get("reason", "unspecified"),
        "dependency_at_fault": kwargs.get("dependency_at_fault"),
        "evidence": list(kwargs.get("evidence") or []),
        "provenance": kwargs.get("provenance", PROVENANCE_UNKNOWN),
        "snapshot_status": kwargs.get("snapshot_status"),
        "qualifiers": list(kwargs.get("qualifiers") or []),
        "freshness": {
            "snapshot_freshness": kwargs.get("snapshot_freshness"),
            "certainty": kwargs.get("certainty"),
            "stale": kwargs.get("stale", False),
            "observed_at": kwargs.get("observed_at"),
        },
        "limitations": list(kwargs.get("limitations") or []),
        "chain": list(kwargs.get("chain") or []),
        "chain_walk": list(kwargs.get("chain_walk") or []),
        "connections_related": list(kwargs.get("connections_related") or []),
    }


def _link_ok_for_chain(entry: dict[str, Any] | None) -> bool:
    """Maillon « OK » pour une chaîne = AVAILABLE OBSERVED non-stale (B′)."""
    if entry is None:
        return False
    status, _reason = map_snapshot_status_to_audit(entry)
    return status == AUDIT_CONNECTED


def _walk_chain(
    chain: list[str],
    index: dict[str, dict[str, Any]],
    snap: dict[str, Any],
) -> tuple[str, str, str | None, list[dict[str, Any]], list[str]]:
    """
    Marche depends_on.
    Retourne (audit_status, reason, dependency_at_fault, chain_walk, limitations).
    """
    walk: list[dict[str, Any]] = []
    limitations: list[str] = []
    prior_connected = 0
    connections = list(snap.get("connections") or [])

    for ref in chain:
        entry = _resolve(ref, index)
        related = [
            c.get("id")
            for c in connections
            if isinstance(c, dict)
            and (c.get("from") == ref or c.get("to") == ref or c.get("to") == f"device:{ref}")
        ]
        if entry is None:
            link_audit, link_reason = AUDIT_MISSING, "dependency_absent_from_snapshot"
            limitations.append(f"unknown_dependency:{ref}")
            walk.append(
                {
                    "ref": ref,
                    "resolved_id": None,
                    "found": False,
                    "snapshot_status": None,
                    "audit_status": link_audit,
                    "reason": link_reason,
                    "provenance": PROVENANCE_UNKNOWN,
                    "evidence": [],
                    "connections_related": related,
                }
            )
            # Premier maillon manquant / UNKNOWN → stop
            overall = AUDIT_UNKNOWN if prior_connected else AUDIT_MISSING
            # Si on a déjà des maillons CONNECTED avant → chaîne DEGRADED/incomplète
            if prior_connected:
                overall = AUDIT_DEGRADED
            return overall, link_reason, ref, walk, limitations

        link_audit, link_reason = map_snapshot_status_to_audit(entry)
        # Connexion DOC UNKNOWN ne prouve pas le lien applicatif
        for c in connections:
            if not isinstance(c, dict):
                continue
            if c.get("to") == ref or c.get("from") == ref:
                if c.get("status") == "UNKNOWN":
                    limitations.append(f"connection_unobserved:{c.get('id')}")

        walk.append(
            {
                "ref": ref,
                "resolved_id": entry.get("id"),
                "found": True,
                "snapshot_status": entry.get("status"),
                "audit_status": link_audit,
                "reason": link_reason,
                "provenance": entry.get("provenance"),
                "evidence": list(entry.get("evidence") or []),
                "stale": bool(entry.get("stale")),
                "connections_related": related,
            }
        )

        if link_audit == AUDIT_CONNECTED:
            prior_connected += 1
            continue

        # Premier maillon non CONNECTED
        if link_audit == AUDIT_OFFLINE:
            overall = AUDIT_DEGRADED if prior_connected else AUDIT_OFFLINE
            return overall, link_reason, ref, walk, limitations
        if link_audit == AUDIT_DEGRADED:
            return AUDIT_DEGRADED, link_reason, ref, walk, limitations
        if link_audit == AUDIT_UNCONFIGURED:
            overall = AUDIT_DEGRADED if prior_connected else AUDIT_UNCONFIGURED
            return overall, link_reason, ref, walk, limitations
        if link_audit == AUDIT_MISSING:
            overall = AUDIT_DEGRADED if prior_connected else AUDIT_MISSING
            return overall, link_reason, ref, walk, limitations
        # UNKNOWN / configured_without_observation / etc.
        limitations.append(f"dependency_unknown:{ref}")
        overall = AUDIT_DEGRADED if prior_connected else AUDIT_UNKNOWN
        return overall, link_reason, ref, walk, limitations

    # Tous les maillons CONNECTED
    return AUDIT_CONNECTED, "all_dependencies_observed_available", None, walk, limitations


def _audit_capability(
    cap: dict[str, Any],
    dep: dict[str, Any] | None,
    index: dict[str, dict[str, Any]],
    snap: dict[str, Any],
    *,
    freshness: str,
    certainty: str,
) -> dict[str, Any]:
    cid = str(cap.get("id") or "")
    cap_audit, cap_reason = map_snapshot_status_to_audit(cap)
    limitations = list(cap.get("limitations") or [])
    chain = list((dep or {}).get("chain") or [])
    chain_walk: list[dict[str, Any]] = []
    dependency_at_fault: str | None = None
    related_conns: list[str] = []

    # Si capacité déjà CONNECTED (AVAILABLE OBSERVED) — rare en D1 — vérifier aussi la chaîne
    if chain:
        chain_status, chain_reason, fault, chain_walk, chain_lims = _walk_chain(chain, index, snap)
        limitations.extend(chain_lims)
        dependency_at_fault = fault
        related_conns = sorted(
            {
                cid_c
                for step in chain_walk
                for cid_c in (step.get("connections_related") or [])
                if cid_c
            }
        )

        if cap_audit == AUDIT_CONNECTED:
            # Capacité observée ≠ apps/outils en bout de chaîne
            if chain_status != AUDIT_CONNECTED:
                # Ne pas prétendre CONNECTED si la chaîne applicative casse
                final = chain_status
                reason = f"capability_observed_but_chain_{chain_reason}"
            else:
                final = AUDIT_CONNECTED
                reason = "capability_and_chain_observed"
            # Device online ≠ app OK — si dernier maillon est app:* toujours MISSING en D1
            if any(
                (s.get("ref") or "").startswith("app:") and s.get("audit_status") != AUDIT_CONNECTED
                for s in chain_walk
            ):
                limitations.append("device_online_ne_prouve_pas_application")
        else:
            # Capacité non CONNECTED : la chaîne explique pourquoi
            final = chain_status if chain_status != AUDIT_CONNECTED else cap_audit
            # Si chaîne OK mais cap CONFIGURED/UNKNOWN → rester UNKNOWN (pas promouvoir)
            if chain_status == AUDIT_CONNECTED and cap_audit != AUDIT_CONNECTED:
                final = cap_audit
                reason = f"{cap_reason};chain_links_ok_but_capability_not_observed"
                limitations.append("chain_ok_does_not_promote_capability_to_connected")
            else:
                reason = f"{cap_reason};chain:{chain_reason}"
    else:
        final = cap_audit
        reason = cap_reason
        if cap_audit != AUDIT_CONNECTED:
            limitations.append("no_depends_on_chain_in_snapshot")

    # Snapshot STALE → ne pas affirmer une certitude fraîche même si CONNECTED
    if certainty == "STALE" and final == AUDIT_CONNECTED:
        limitations.append("snapshot_stale_connected_not_fresh_certainty")
        # On garde CONNECTED (observation dans le snapshot) mais certainty STALE au rapport
    if certainty != "HIGH" and final == AUDIT_CONNECTED:
        limitations.append("certainty_not_high")

    # Conflits DOC attachés (ex. hermes) visibles via qualifiers
    quals = list(cap.get("qualifiers") or [])

    return _diag(
        subject=cid,
        kind="capability",
        audit_status=final,
        reason=reason,
        dependency_at_fault=dependency_at_fault,
        evidence=list(cap.get("evidence") or []),
        provenance=cap.get("provenance") or PROVENANCE_UNKNOWN,
        snapshot_status=cap.get("status"),
        qualifiers=quals,
        snapshot_freshness=freshness,
        certainty=certainty,
        stale=bool(cap.get("stale")),
        observed_at=cap.get("observed_at"),
        limitations=sorted(set(limitations)),
        chain=chain,
        chain_walk=chain_walk,
        connections_related=related_conns,
    )


def _ecosystem_component_diagnostics(
    snap: dict[str, Any],
    *,
    freshness: str,
    certainty: str,
) -> list[dict[str, Any]]:
    """Diagnostics composants runtime non-CONNECTED (écosystème dégradé)."""
    out: list[dict[str, Any]] = []
    for family, kind in (
        ("devices", "device"),
        ("agents", "agent"),
        ("services", "service"),
        ("llms", "llm"),
        ("machines", "machine"),
    ):
        for entry in snap.get(family) or []:
            if not isinstance(entry, dict):
                continue
            a_status, reason = map_snapshot_status_to_audit(entry)
            # Ne pas noyer le rapport avec tous les CONFIGURED → seulement signaux utiles
            if a_status == AUDIT_CONNECTED:
                continue
            if a_status == AUDIT_UNKNOWN and entry.get("status") in ("CONFIGURED", "PLANNED", "DISCOVERED"):
                # Machines DOC UNKNOWN / services CONFIGURED : inclus seulement si OFFLINE/DEGRADED/UNCONFIGURED
                # ou conflit, sinon skip pour lisibilité — sauf machines en conflit
                if not (entry.get("conflict") or "CONFLICT" in (entry.get("qualifiers") or [])):
                    if family == "machines" and entry.get("status") == "UNKNOWN":
                        continue
                    if entry.get("status") in ("CONFIGURED", "PLANNED", "DISCOVERED"):
                        continue
            if a_status not in (
                AUDIT_DEGRADED,
                AUDIT_OFFLINE,
                AUDIT_UNCONFIGURED,
                AUDIT_MISSING,
                AUDIT_UNKNOWN,
            ):
                continue
            # Filtre : UNKNOWN machines DOC sans conflit déjà skip
            if family == "services" and entry.get("status") == "CONFIGURED":
                continue
            out.append(
                _diag(
                    subject=entry.get("id"),
                    kind=kind,
                    audit_status=a_status,
                    reason=reason,
                    dependency_at_fault=None,
                    evidence=list(entry.get("evidence") or []),
                    provenance=entry.get("provenance"),
                    snapshot_status=entry.get("status"),
                    qualifiers=list(entry.get("qualifiers") or []),
                    snapshot_freshness=freshness,
                    certainty=certainty,
                    stale=bool(entry.get("stale")),
                    observed_at=entry.get("observed_at"),
                    limitations=list(entry.get("limitations") or []),
                )
            )
    return out


def _ecosystem_summary(diagnostics: list[dict[str, Any]]) -> dict[str, Any]:
    buckets: dict[str, list[str]] = {
        AUDIT_CONNECTED: [],
        AUDIT_DEGRADED: [],
        AUDIT_OFFLINE: [],
        AUDIT_MISSING: [],
        AUDIT_UNCONFIGURED: [],
        AUDIT_UNKNOWN: [],
    }
    for d in diagnostics:
        st = d.get("audit_status")
        sub = d.get("subject")
        if st in buckets and sub is not None:
            buckets[st].append(str(sub))
    return {
        "counts": {k: len(v) for k, v in buckets.items()},
        "by_status": buckets,
    }
