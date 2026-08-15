"""Architecture Awareness D2 — architecture.explain()

Pipeline :
  ArchitectureSnapshot → architecture.audit() → Explain → (optionnel LLM borné) → réponse

Le LLM n'est PAS une source de vérité. Il ne reçoit que ``llm_bound_payload``.
Déterministe par défaut. ``llm_formatter`` = branchement caller (tests / futur) ;
aucun appel réseau interne, aucun Memory/Hermes tool, aucun probe.
"""
from __future__ import annotations

import copy
import json
import re
from typing import Any, Callable, Literal

from .audit import AUDIT_CONNECTED, audit
from .schema import SCHEMA_VERSION, redact_tree, snapshot_contains_secret

EXPLAIN_SCHEMA_VERSION = "1.0.0"

Intent = Literal[
    "how_you_work",
    "hermes_host",
    "devices_connected",
    "llms_available",
    "capability_unavailable",
    "action_path",
    "action_outcome",
    "what_is_missing",
    "unknown_subject",
    "generic",
]

# USER → interface → CORE → Policy → Intent → Hermes/Skill/Device/Tool
#   → Execution → Observation → Verification → Memory/HUD/Voice
ARCHITECTURE_WALKTHROUGH_V1: list[dict[str, str]] = [
    {"step": "1", "layer": "user", "summary": "USER — demande / utterance."},
    {"step": "2", "layer": "interface", "summary": "Interface — HUD, voix (voicebox) ou agent Windows."},
    {"step": "3", "layer": "core", "summary": "CORE — orchestration ; autorité vérité ops."},
    {"step": "4", "layer": "policy", "summary": "Policy — autorise ou refuse avant exécution."},
    {"step": "5", "layer": "intent", "summary": "Intent — capacité / routage sémantique."},
    {
        "step": "6",
        "layer": "hermes_skill_device_tool",
        "summary": "Hermes / Skill / Device / Tool — délégation selon Owner.",
    },
    {"step": "7", "layer": "execution", "summary": "Execution — action proposée réalisée."},
    {
        "step": "8",
        "layer": "observation",
        "summary": "Observation — état écosystème (Architecture Snapshot/Audit).",
    },
    {
        "step": "9",
        "layer": "verification",
        "summary": "Verification — preuve d'ACTION (≠ Architecture Awareness).",
    },
    {
        "step": "10",
        "layer": "memory_hud_voice",
        "summary": "Memory / HUD / Voice — projection & mémoire ; jamais vérité architecture live.",
    },
]

_LLM_FORMATTER = Callable[[dict[str, Any]], str]


def explain(
    snapshot: dict[str, Any],
    question: str,
    *,
    subject: str | None = None,
    audit_report: dict[str, Any] | None = None,
    llm_formatter: _LLM_FORMATTER | None = None,
    hermes_history: list[Any] | None = None,
    memory_hints: Any | None = None,
) -> dict[str, Any]:
    """
    Explique l'architecture / l'état à partir du snapshot (+ audit).

    ``hermes_history`` / ``memory_hints`` : acceptés pour prouver l'isolation —
    **ignorés** pour les faits (jamais injectés dans ``llm_bound_payload``).

    ``llm_formatter`` : optionnel. Reçoit uniquement ``llm_bound_payload``.
    Sortie LLM validée ; violation → fallback template déterministe.
    """
    if not isinstance(snapshot, dict):
        raise TypeError("architecture.explain() requires an ArchitectureSnapshot dict")

    snap = copy.deepcopy(snapshot)
    snap = redact_tree(snap)

    snap_id = str(snap.get("snapshot_id") or "")
    ts = snap.get("timestamp") or snap.get("as_of")
    as_of = snap.get("as_of") or ts

    q = (question or "").strip()
    intent = classify_intent(q, subject)
    subj = subject or _extract_subject(q, intent)

    report_audit = (
        audit_report if audit_report is not None else audit(snap, capability_id=_cap_filter(intent, subj))
    )

    facts: list[dict[str, Any]] = []
    uncertainty: list[str] = []
    limitations: list[str] = list(snap.get("limitations") or [])
    limitations.extend(list(report_audit.get("limitations") or []))
    limitations.append("d2_explain_bound_to_snapshot_and_audit_only")
    limitations.append("d2_no_memory_recall")
    limitations.append("d2_no_hermes_ecosystem_tools")
    limitations.append("d2_no_implicit_network_probes")

    hermes_history_ignored = hermes_history is not None
    memory_hints_ignored = memory_hints is not None
    if hermes_history_ignored:
        limitations.append("hermes_history_ignored_for_architecture_truth")
    if memory_hints_ignored:
        limitations.append("memory_hints_ignored_for_architecture_truth")

    conflicts = list(report_audit.get("conflicts") or [])
    if not conflicts:
        conflicts = _conflicts_from_snapshot(snap)

    facts.append(
        {
            "id": "meta.snapshot",
            "text": f"Explication bornée au snapshot_id={snap_id} as_of={as_of} freshness={snap.get('freshness')}",
            "source": "snapshot.meta",
            "snapshot_id": snap_id,
            "timestamp": ts,
            "provenance": "CODE",
            "evidence": [{"kind": "snapshot_identity", "snapshot_id": snap_id, "timestamp": ts}],
        }
    )
    facts.append(
        {
            "id": "meta.audit",
            "text": (
                f"Diagnostics issus de architecture.audit "
                f"(audit_id={report_audit.get('audit_id')}, certainty={report_audit.get('certainty')})"
            ),
            "source": "audit.meta",
            "provenance": "CODE",
            "evidence": [{"kind": "audit_id", "audit_id": report_audit.get("audit_id")}],
        }
    )

    if snap.get("freshness") == "STALE":
        uncertainty.append("snapshot_stale_certainty_limited")
    if report_audit.get("certainty") != "HIGH":
        uncertainty.append(f"audit_certainty_{report_audit.get('certainty')}")

    explanation_template = _dispatch(
        intent=intent,
        question=q,
        subject=subj,
        snap=snap,
        audit_report=report_audit,
        facts=facts,
        uncertainty=uncertainty,
        limitations=limitations,
        conflicts=conflicts,
    )

    llm_bound = build_explain_llm_context(
        snap_id=snap_id,
        timestamp=ts,
        as_of=as_of,
        intent=intent,
        subject=subj,
        question=q,
        facts=facts,
        uncertainty=uncertainty,
        limitations=sorted(set(limitations)),
        conflicts=conflicts,
        explanation_draft=explanation_template,
        freshness=snap.get("freshness"),
        audit_certainty=report_audit.get("certainty"),
        snapshot_excerpt=_snapshot_excerpt_for_llm(snap),
        qualifiers=_collect_qualifiers(snap, report_audit),
        evidence_index=_collect_evidence(snap, facts),
        # Ancre D2.1 (snapshot+audit purs) — le LLM futur doit prioriser ceci
        anchor=None,  # rempli juste après
    )
    # Remplir l'ancre D2.1 sans créer de dépendance circulaire au niveau import
    from .llm_payload import build_llm_bound_payload as _build_d21_anchor

    llm_bound["anchor"] = _build_d21_anchor(snap, report_audit)
    llm_bound["contract"] = "D2.1+explain"

    if "hermes_history" in llm_bound or "memory_hints" in llm_bound:
        raise RuntimeError("isolation breach: history/memory leaked into llm_bound_payload")

    llm_used = False
    llm_rejected = False
    llm_violations: list[str] = []
    explanation = explanation_template

    if llm_formatter is not None:
        raw_llm = str(llm_formatter(llm_bound) or "")
        ok, llm_violations = validate_llm_explanation(raw_llm, snap, llm_bound)
        if ok:
            explanation = raw_llm
            llm_used = True
            limitations.append("d2_llm_formatter_accepted")
        else:
            llm_rejected = True
            explanation = explanation_template
            limitations.append("d2_llm_output_rejected_anti_hallucination")
            for v in llm_violations:
                uncertainty.append(f"llm_violation:{v}")

    out = {
        "schema_version": EXPLAIN_SCHEMA_VERSION,
        "snapshot_schema_version": snap.get("schema_version") or SCHEMA_VERSION,
        "snapshot_id": snap_id or None,
        "timestamp": ts,
        "as_of": as_of,
        "subject": subj,
        "intent": intent,
        "question": q,
        "facts": facts,
        "uncertainty": sorted(set(uncertainty)),
        "limitations": sorted(set(limitations)),
        "conflicts": conflicts,
        "explanation": explanation,
        "explanation_template": explanation_template,
        "llm_bound_payload": llm_bound,
        "meta": {
            "deterministic": not llm_used,
            "llm_used": llm_used,
            "llm_rejected": llm_rejected,
            "llm_violations": llm_violations,
            "network_probes": False,
            "memory_recall": False,
            "hermes_tools": False,
            "hermes_history_ignored": hermes_history_ignored,
            "memory_hints_ignored": memory_hints_ignored,
            "memory_writes": False,
            "verification_writes": False,
            "mutations": False,
            "sources": ["ArchitectureSnapshot", "architecture.audit"],
            "pipeline": "snapshot→audit→explain→(optional_bounded_llm)",
        },
    }
    out = redact_tree(out)
    if snapshot_contains_secret(out):
        out["explanation"] = (
            "Je ne peux pas exposer ce détail : le payload d'explication contenait "
            "une donnée sensible et a été bloqué (redaction)."
        )
        out["limitations"] = sorted(
            set(list(out.get("limitations") or []) + ["secret_blocked_in_explain"])
        )
        out["llm_bound_payload"] = redact_tree(llm_bound)
    return out


def classify_intent(question: str, subject: str | None = None) -> Intent:
    q = (question or "").lower()
    if _match(
        q,
        r"(?:a|as|est-ce\s+que).*(?:fonctionné|marché|réussi|succeeded|worked)|"
        r"(?:did|has).*(?:work|succeed)|preuve\s+(?:d['’])?action|result_validated",
    ):
        return "action_outcome"
    if _match(q, r"comment\s+(?:tu\s+)?fonctionnes|how\s+do\s+you\s+work|architecture\s+générale|comment\s+ça\s+marche"):
        return "how_you_work"
    if _match(q, r"hermes|où\s+tourne|where\s+(?:does\s+)?hermes"):
        return "hermes_host"
    if _match(
        q,
        r"appareils?.*(?:connect|disponib|en\s+ligne)|devices?.*(?:connect|available|online)|quels?\s+devices?",
    ):
        return "devices_connected"
    if _match(q, r"\bllms?\b|modèles?\s+(?:dispo|available)|quels?\s+llm|language\s+model"):
        return "llms_available"
    if _match(q, r"pourquoi.+(?:indispo|unavailable|ne\s+fonctionne|marche\s+pas)|why.+(?:unavailable|not\s+work)"):
        return "capability_unavailable"
    if _match(q, r"comment\s+passe|par\s+où\s+passe|parcours|action\s+dans|path\s+through|routing"):
        return "action_path"
    if _match(q, r"qu['’]est-ce\s+qui\s+manque|what(?:'s|\s+is)\s+missing|manque\s+pour"):
        return "what_is_missing"
    if _match(q, r"ghost\s+agent|ajouter\s+(?:un\s+)?agent|add\s+(?:an?\s+)?agent"):
        return "unknown_subject"
    if subject and _looks_like_unknown_entity(subject, None):
        return "unknown_subject"
    return "generic"


def build_explain_llm_context(**kwargs: Any) -> dict[str, Any]:
    """
    Contexte Explain (D2) pour un éventuel LLM — question/facts/template.

    Ancre pure snapshot+audit : ``llm_payload.build_llm_bound_payload(snapshot, audit)`` (D2.1).
    """
    snap_id = kwargs.get("snap_id")
    ts = kwargs.get("timestamp")
    if not snap_id or not ts:
        raise ValueError("explain llm context requires snapshot_id and timestamp")
    return {
        "instruction": (
            "Tu n'as aucune connaissance d'architecture comme vérité. "
            "Priorise anchor (contrat D2.1) puis facts[]. "
            "Ne résous pas les conflicts[]. "
            "Ne transforme jamais UNKNOWN/CONFIGURED en AVAILABLE. "
            "AVAILABLE ne peut être affirmé que s'il figure déjà dans les facts avec provenance OBSERVED. "
            "Device ONLINE ≠ succès d'action (Verification). "
            "Si un sujet est absent, dis qu'il est inconnu du snapshot. "
            "N'utilise ni mémoire conversationnelle, ni historique Hermes, ni connaissances externes."
        ),
        "snapshot_id": snap_id,
        "timestamp": ts,
        "as_of": kwargs.get("as_of"),
        "freshness": kwargs.get("freshness"),
        "audit_certainty": kwargs.get("audit_certainty"),
        "intent": kwargs.get("intent"),
        "subject": kwargs.get("subject"),
        "question": kwargs.get("question"),
        "facts": kwargs.get("facts"),
        "uncertainty": kwargs.get("uncertainty"),
        "limitations": kwargs.get("limitations"),
        "conflicts": kwargs.get("conflicts"),
        "qualifiers": kwargs.get("qualifiers"),
        "evidence": kwargs.get("evidence_index"),
        "snapshot_excerpt": kwargs.get("snapshot_excerpt"),
        "explanation_template": kwargs.get("explanation_draft"),
        "walkthrough_version": "ARCHITECTURE_WALKTHROUGH_V1",
        "anchor": kwargs.get("anchor"),
        "contract": kwargs.get("contract") or "D2.explain",
    }


def validate_llm_explanation(
    text: str,
    snap: dict[str, Any],
    bound: dict[str, Any],
) -> tuple[bool, list[str]]:
    """Gardes post-LLM : rejette invention / promotion / résolution arbitraire de conflits."""
    violations: list[str] = []
    if not text or not str(text).strip():
        return False, ["empty_llm_output"]
    t = str(text)
    tl = t.lower()

    # Secrets
    if snapshot_contains_secret({"t": t}):
        violations.append("secret_in_llm_output")

    # Conflit Hermes : ne pas trancher NUC ou VPS sans mentionner le conflit
    hermes_conflict = any(
        c.get("subject") == "hermes.host" and c.get("conflict") for c in (bound.get("conflicts") or [])
    )
    if hermes_conflict:
        claims_one_host = bool(
            re.search(
                r"hermes\s+(tourne|runs?|est)\s+(uniquement\s+)?(sur\s+)?(le\s+)?(nuc|vps)\b",
                tl,
            )
            or re.search(r"\bhermes\s+is\s+on\s+the\s+(nuc|vps)\b", tl)
        )
        mentions_conflict = "conflit" in tl or "conflict" in tl
        if claims_one_host and not mentions_conflict:
            violations.append("hermes_conflict_arbitrarily_resolved")
        if re.search(r"hermes.*(seulement|only).*(nuc|vps)", tl) and not mentions_conflict:
            violations.append("hermes_conflict_arbitrarily_resolved")

    # Invention Ghost / agent absent
    if re.search(r"ghost\s+agent", tl):
        if re.search(r"(connecté|connected|available|opérationnel|online)", tl):
            if not _entity_in_snapshot("Ghost Agent", snap) and not _entity_in_snapshot("ghost", snap):
                violations.append("invented_ghost_agent_as_present")

    # Promotion UNKNOWN/CONFIGURED → AVAILABLE dans le texte
    for family in ("devices", "llms", "providers", "services", "capabilities"):
        for e in snap.get(family) or []:
            if not isinstance(e, dict):
                continue
            eid = str(e.get("id") or "")
            st = e.get("status")
            if not eid or st not in ("UNKNOWN", "CONFIGURED", "PLANNED", "DISCOVERED"):
                continue
            # « eid ... AVAILABLE » or « AVAILABLE ... eid »
            pat = re.compile(
                rf"{re.escape(eid)}.{{0,40}}available|{re.escape(eid)}.{{0,40}}disponible",
                re.I,
            )
            if pat.search(t) and "pas traité comme available" not in tl and "≠ available" not in tl:
                # Allow negation forms
                if not re.search(rf"{re.escape(eid)}.{{0,60}}(pas|not|ne ).{{0,20}}(available|disponible)", tl):
                    violations.append(f"promoted_{st}_to_available:{eid}")

    # Action success claim from architecture alone
    if bound.get("intent") == "action_outcome":
        if re.search(r"netflix.+(a fonctionné|succeeded|a réussi|a marché)", tl):
            if "verification" not in tl and "result_validated" not in tl:
                violations.append("action_success_claimed_without_verification")

    return (len(violations) == 0), violations


def _snapshot_excerpt_for_llm(snap: dict[str, Any]) -> dict[str, Any]:
    """Sous-ensemble redacté pour le LLM — ids/status/provenance/qualifiers seulement."""

    def slim(entries: list[Any]) -> list[dict[str, Any]]:
        out = []
        for e in entries or []:
            if not isinstance(e, dict):
                continue
            out.append(
                {
                    "id": e.get("id"),
                    "status": e.get("status"),
                    "provenance": e.get("provenance"),
                    "qualifiers": list(e.get("qualifiers") or []),
                    "stale": e.get("stale"),
                    "conflict": e.get("conflict"),
                    "resolved_by": e.get("resolved_by"),
                    "evidence_count": len(e.get("evidence") or []) if isinstance(e.get("evidence"), list) else 0,
                }
            )
        return out

    return {
        "devices": slim(snap.get("devices") or []),
        "agents": slim(snap.get("agents") or []),
        "services": slim(snap.get("services") or []),
        "llms": slim(snap.get("llms") or []),
        "providers": slim(snap.get("providers") or []),
        "capabilities": slim(snap.get("capabilities") or []),
        "machines": slim(snap.get("machines") or []),
    }


def _collect_qualifiers(snap: dict[str, Any], audit_report: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for family in ("machines", "devices", "services", "capabilities", "llms"):
        for e in snap.get(family) or []:
            if isinstance(e, dict) and e.get("qualifiers"):
                out.append({"id": e.get("id"), "family": family, "qualifiers": list(e.get("qualifiers") or [])})
    return out


def _collect_evidence(snap: dict[str, Any], facts: list[dict[str, Any]]) -> list[Any]:
    ev: list[Any] = []
    for f in facts:
        if f.get("evidence"):
            ev.extend(f["evidence"] if isinstance(f["evidence"], list) else [f["evidence"]])
    for family in ("devices", "services", "llms", "capabilities"):
        for e in snap.get(family) or []:
            if isinstance(e, dict):
                for item in e.get("evidence") or []:
                    ev.append({"parent": e.get("id"), "item": item})
    return ev


def _match(q: str, pattern: str) -> bool:
    return re.search(pattern, q, re.I) is not None


def _extract_subject(question: str, intent: Intent) -> str | None:
    q = question or ""
    m = re.search(r"\b(media\.[\w.]+|apple_tv\.[\w.]+|[\w]+(?:\.[\w]+)+)\b", q)
    if m:
        return m.group(1)
    if intent in ("capability_unavailable", "what_is_missing", "action_outcome", "action_path"):
        if re.search(r"netflix", q, re.I):
            return "media.netflix.freebox"
        if re.search(r"apple\s*tv", q, re.I):
            return "apple_tv.control"
    if re.search(r"ghost", q, re.I):
        return "Ghost Agent"
    if intent == "hermes_host":
        return "hermes.host"
    return None


def _cap_filter(intent: Intent, subject: str | None) -> str | None:
    if intent in ("capability_unavailable", "what_is_missing", "action_path", "action_outcome") and subject:
        return subject
    return None


def _conflicts_from_snapshot(snap: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
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


def _dispatch(
    *,
    intent: Intent,
    question: str,
    subject: str | None,
    snap: dict[str, Any],
    audit_report: dict[str, Any],
    facts: list[dict[str, Any]],
    uncertainty: list[str],
    limitations: list[str],
    conflicts: list[dict[str, Any]],
) -> str:
    if intent == "how_you_work":
        return _explain_how_you_work(snap, facts, uncertainty)
    if intent == "hermes_host":
        return _explain_hermes(snap, conflicts, facts, uncertainty)
    if intent == "devices_connected":
        return _explain_devices(snap, facts, uncertainty, limitations)
    if intent == "llms_available":
        return _explain_llms(snap, facts, uncertainty, limitations)
    if intent == "capability_unavailable":
        return _explain_capability(subject, snap, audit_report, facts, uncertainty, limitations)
    if intent == "action_path":
        return _explain_action_path(subject, snap, audit_report, facts, uncertainty, limitations)
    if intent == "action_outcome":
        return _explain_action_outcome(subject, snap, audit_report, facts, uncertainty, limitations)
    if intent == "what_is_missing":
        return _explain_missing(subject, snap, audit_report, facts, uncertainty, limitations)
    if intent == "unknown_subject":
        return _explain_unknown_entity(subject or question, snap, facts, uncertainty, limitations)
    if subject:
        if _entity_in_snapshot(subject, snap):
            return _explain_capability(subject, snap, audit_report, facts, uncertainty, limitations)
        return _explain_unknown_entity(subject, snap, facts, uncertainty, limitations)
    return _explain_how_you_work(snap, facts, uncertainty)


def _explain_how_you_work(snap: dict[str, Any], facts: list[dict[str, Any]], uncertainty: list[str]) -> str:
    for step in ARCHITECTURE_WALKTHROUGH_V1:
        facts.append(
            {
                "id": f"walkthrough.{step['step']}",
                "text": f"[{step['layer']}] {step['summary']}",
                "source": "CODE:ARCHITECTURE_WALKTHROUGH_V1",
                "provenance": "CODE",
            }
        )
    facts.append(
        {
            "id": "walkthrough.live_bridge",
            "text": (
                f"État live attaché : freshness={snap.get('freshness')}, "
                f"{len(snap.get('devices') or [])} device(s), "
                f"{len(snap.get('services') or [])} service(s), "
                f"{len(snap.get('capabilities') or [])} capacit(s)."
            ),
            "source": "snapshot.counts",
        }
    )
    lines = [
        f"(snapshot_id={snap.get('snapshot_id')}, as_of={snap.get('as_of')})",
        "Fonctionnement architectural (parcours versionné CODE — pas une invention) :",
        "USER → interface → CORE → Policy → Intent → Hermes/Skill/Device/Tool "
        "→ Execution → Observation → Verification → Memory/HUD/Voice",
    ]
    for step in ARCHITECTURE_WALKTHROUGH_V1:
        lines.append(f"  {step['step']}. [{step['layer']}] {step['summary']}")
    lines.append(
        f"État observé dans ce snapshot : freshness={snap.get('freshness')}. "
        "Détails runtime uniquement depuis snapshot/audit."
    )
    if uncertainty:
        lines.append("Incertitudes : " + "; ".join(uncertainty))
    return "\n".join(lines)


def _explain_hermes(
    snap: dict[str, Any],
    conflicts: list[dict[str, Any]],
    facts: list[dict[str, Any]],
    uncertainty: list[str],
) -> str:
    hermes = next((c for c in conflicts if c.get("subject") == "hermes.host"), None)
    if hermes is None:
        for m in snap.get("machines") or []:
            if m.get("id") == "hermes.host":
                hermes = {
                    "subject": "hermes.host",
                    "conflict": m.get("conflict"),
                    "resolved_by": m.get("resolved_by"),
                    "claims": m.get("claims") or [],
                    "status": m.get("status"),
                }
                break

    lines = [f"(snapshot_id={snap.get('snapshot_id')}, as_of={snap.get('as_of')})"]

    if hermes and hermes.get("conflict"):
        claims = hermes.get("claims") or []
        for i, c in enumerate(claims):
            facts.append(
                {
                    "id": f"hermes.claim.{i}",
                    "text": f"Claim DOC {c.get('source')}: hermes_host={c.get('value')}",
                    "source": c.get("source"),
                    "provenance": c.get("provenance") or "DOC",
                }
            )
        facts.append(
            {
                "id": "hermes.conflict",
                "text": "Conflit documentaire non résolu (resolved_by=null) — ne pas choisir un hôte arbitrairement.",
                "source": "audit.conflicts",
            }
        )
        uncertainty.append("hermes_host_doc_conflict_unresolved")
        lines.append(
            "Je ne peux pas affirmer un hôte unique pour Hermes : les documents sont en conflit."
        )
        for c in claims:
            lines.append(f"  - Selon {c.get('source')}: {c.get('value')}")
        lines.append(
            f"resolved_by={hermes.get('resolved_by')!r}, status snapshot={hermes.get('status')}. "
            "Aucune observation runtime dans ce snapshot ne tranche le conflit DOC."
        )
    else:
        uncertainty.append("hermes_host_not_in_snapshot_conflicts")
        lines.append(
            "Hermes : pas assez d'information conflict-free dans ce snapshot pour localiser l'hôte. "
            "Je n'invente pas l'emplacement."
        )
    return "\n".join(lines)


def _explain_devices(
    snap: dict[str, Any],
    facts: list[dict[str, Any]],
    uncertainty: list[str],
    limitations: list[str],
) -> str:
    devices = list(snap.get("devices") or [])
    lines = [
        f"(snapshot_id={snap.get('snapshot_id')}, as_of={snap.get('as_of')})",
        "Appareils présents dans le snapshot (statuts non promus) :",
    ]
    if not devices:
        uncertainty.append("no_devices_in_snapshot")
        lines.append("  Aucun appareil listé dans ce snapshot.")
        limitations.append("devices_empty_in_snapshot")
        return "\n".join(lines)

    available = []
    other = []
    for d in devices:
        did = d.get("id")
        st = d.get("status")
        prov = d.get("provenance")
        facts.append(
            {
                "id": f"device.{did}",
                "text": f"device {did}: status={st}, provenance={prov}, stale={d.get('stale')}",
                "source": "snapshot.devices",
                "status": st,
                "provenance": prov,
                "evidence": list(d.get("evidence") or []),
                "qualifiers": list(d.get("qualifiers") or []),
            }
        )
        if st == "AVAILABLE" and prov == "OBSERVED" and not d.get("stale"):
            available.append(did)
            lines.append(f"  - {did}: AVAILABLE (OBSERVED)")
        else:
            other.append(did)
            lines.append(f"  - {did}: {st} (provenance={prov}) — pas traité comme AVAILABLE")

    if other:
        uncertainty.append("non_available_devices_must_not_be_called_available")
    lines.append(
        f"Résumé honnête : {len(available)} AVAILABLE observé(s), "
        f"{len(other)} non-AVAILABLE (CONFIGURED/UNKNOWN/OFFLINE/…). "
        "Je ne transforme pas CONFIGURED ni UNKNOWN en AVAILABLE."
    )
    return "\n".join(lines)


def _explain_llms(
    snap: dict[str, Any],
    facts: list[dict[str, Any]],
    uncertainty: list[str],
    limitations: list[str],
) -> str:
    llms = list(snap.get("llms") or [])
    providers = list(snap.get("providers") or [])
    lines = [
        f"(snapshot_id={snap.get('snapshot_id')}, as_of={snap.get('as_of')})",
        "LLM / providers dans le snapshot :",
    ]
    if not llms and not providers:
        uncertainty.append("no_llms_in_snapshot")
        lines.append("  Aucun LLM listé.")
        return "\n".join(lines)

    for p in providers:
        facts.append(
            {
                "id": f"provider.{p.get('id')}",
                "text": f"{p.get('id')}: status={p.get('status')}, provenance={p.get('provenance')}",
                "source": "snapshot.providers",
                "status": p.get("status"),
                "provenance": p.get("provenance"),
            }
        )
        lines.append(f"  - {p.get('id')}: {p.get('status')} (≠ AVAILABLE sauf OBSERVED)")

    for llm in llms:
        st = llm.get("status")
        facts.append(
            {
                "id": f"llm.{llm.get('id')}",
                "text": f"{llm.get('id')}: status={st}, provenance={llm.get('provenance')}",
                "source": "snapshot.llms",
                "status": st,
                "provenance": llm.get("provenance"),
            }
        )
        if st == "AVAILABLE" and llm.get("provenance") == "OBSERVED" and not llm.get("stale"):
            lines.append(f"  - {llm.get('id')}: AVAILABLE (OBSERVED)")
        else:
            lines.append(
                f"  - {llm.get('id')}: {st} — je ne le déclare pas « disponible » au sens AVAILABLE "
                f"(provenance={llm.get('provenance')})."
            )
            if st in ("CONFIGURED", "UNKNOWN"):
                uncertainty.append(f"llm_{st.lower()}_not_observed:{llm.get('id')}")
    limitations.append("configured_or_unknown_llm_is_not_available")
    return "\n".join(lines)


def _find_cap_diag(audit_report: dict[str, Any], subject: str | None) -> dict[str, Any] | None:
    if not subject:
        return None
    for d in audit_report.get("diagnostics") or []:
        if d.get("subject") == subject and d.get("kind") == "capability":
            return d
    for d in audit_report.get("diagnostics") or []:
        if d.get("subject") == subject:
            return d
    return None


def _find_cap_snap(snap: dict[str, Any], subject: str | None) -> dict[str, Any] | None:
    if not subject:
        return None
    for c in snap.get("capabilities") or []:
        if c.get("id") == subject or c.get("app_id") == subject:
            return c
    return None


def _explain_capability(
    subject: str | None,
    snap: dict[str, Any],
    audit_report: dict[str, Any],
    facts: list[dict[str, Any]],
    uncertainty: list[str],
    limitations: list[str],
) -> str:
    if not subject:
        uncertainty.append("no_subject_for_capability_question")
        return (
            f"(snapshot_id={snap.get('snapshot_id')}) "
            "Précisez la capacité : elle est absente de la question et je ne l'invente pas."
        )

    cap = _find_cap_snap(snap, subject)
    diag = _find_cap_diag(audit_report, subject)
    lines = [f"(snapshot_id={snap.get('snapshot_id')}, as_of={snap.get('as_of')}, subject={subject})"]

    if cap is None:
        return _explain_unknown_entity(subject, snap, facts, uncertainty, limitations)

    facts.append(
        {
            "id": f"cap.{subject}.snapshot",
            "text": f"status={cap.get('status')}, provenance={cap.get('provenance')}",
            "source": "snapshot.capabilities",
            "status": cap.get("status"),
            "provenance": cap.get("provenance"),
            "qualifiers": list(cap.get("qualifiers") or []),
            "evidence": list(cap.get("evidence") or []),
        }
    )
    lines.append(f"Dans le snapshot : status={cap.get('status')}, provenance={cap.get('provenance')}.")

    if diag:
        facts.append(
            {
                "id": f"cap.{subject}.audit",
                "text": (
                    f"audit_status={diag.get('audit_status')}, reason={diag.get('reason')}, "
                    f"dependency_at_fault={diag.get('dependency_at_fault')}"
                ),
                "source": "audit.diagnostics",
                "audit_status": diag.get("audit_status"),
            }
        )
        lines.append(f"Audit déterministe : {diag.get('audit_status')} — {diag.get('reason')}.")
        if diag.get("dependency_at_fault"):
            lines.append(f"Dépendance en cause : {diag.get('dependency_at_fault')}.")
        chain = diag.get("chain") or []
        walk = diag.get("chain_walk") or []
        if chain:
            lines.append("Chaîne depends_on : " + " → ".join(chain))
            facts.append(
                {
                    "id": f"cap.{subject}.chain",
                    "text": " → ".join(chain),
                    "source": "snapshot.depends_on",
                }
            )
        for step in walk:
            facts.append(
                {
                    "id": f"cap.{subject}.chain.{step.get('ref')}",
                    "text": (
                        f"{step.get('ref')}: found={step.get('found')}, "
                        f"snapshot_status={step.get('snapshot_status')}, "
                        f"audit_status={step.get('audit_status')}"
                    ),
                    "source": "audit.chain_walk",
                }
            )
            lines.append(
                f"  · {step.get('ref')}: {step.get('audit_status')} "
                f"(snapshot={step.get('snapshot_status')}, found={step.get('found')})"
            )
        for lim in diag.get("limitations") or []:
            limitations.append(str(lim))
            uncertainty.append(str(lim))
        if diag.get("audit_status") != AUDIT_CONNECTED:
            lines.append(
                "Je ne déclare pas cette capacité opérationnelle : l'audit ne renvoie pas CONNECTED."
            )
    return "\n".join(lines)


def _explain_action_path(
    subject: str | None,
    snap: dict[str, Any],
    audit_report: dict[str, Any],
    facts: list[dict[str, Any]],
    uncertainty: list[str],
    limitations: list[str],
) -> str:
    lines = [
        f"(snapshot_id={snap.get('snapshot_id')}, as_of={snap.get('as_of')})",
        "Parcours générique (CODE) :",
        "USER → interface → CORE → Policy → Intent → Hermes/Skill/Device/Tool "
        "→ Execution → Observation → Verification → Memory/HUD/Voice",
    ]
    for step in ARCHITECTURE_WALKTHROUGH_V1:
        facts.append(
            {
                "id": f"path.{step['step']}",
                "text": step["summary"],
                "source": "CODE:ARCHITECTURE_WALKTHROUGH_V1",
                "provenance": "CODE",
            }
        )
        lines.append(f"  {step['step']}. {step['summary']}")
    if subject:
        lines.append(f"Pour la capacité/sujet « {subject} » (état snapshot/audit) :")
        lines.append(_explain_capability(subject, snap, audit_report, facts, uncertainty, limitations))
    else:
        uncertainty.append("action_path_without_specific_capability")
        lines.append("Aucun sujet d'action précisé — parcours générique seulement.")
    return "\n".join(lines)


def _explain_action_outcome(
    subject: str | None,
    snap: dict[str, Any],
    audit_report: dict[str, Any],
    facts: list[dict[str, Any]],
    uncertainty: list[str],
    limitations: list[str],
) -> str:
    """Architecture ≠ preuve d'action — Verification only."""
    limitations.append("architecture_does_not_prove_action_success")
    limitations.append("verification_required_for_action_outcome")
    facts.append(
        {
            "id": "action_outcome.boundary",
            "text": (
                "Architecture Awareness décrit l'écosystème. "
                "Seul Verification (RESULT_VALIDATED) prouve qu'une action a réussi. "
                "Device ONLINE ≠ application opérationnelle / action réussie."
            ),
            "source": "CODE:D2_BOUNDARY",
            "provenance": "CODE",
        }
    )
    uncertainty.append("action_outcome_unknown_without_verification")
    lines = [
        f"(snapshot_id={snap.get('snapshot_id')}, as_of={snap.get('as_of')})",
        "Je ne peux pas conclure qu'une action a réussi à partir de l'Architecture Awareness seule.",
        "Un appareil ONLINE ou une capacité CONFIGURED ne prouve pas le succès d'exécution.",
        "La preuve d'ACTION relève de Verification (RESULT_VALIDATED), pas du snapshot.",
    ]
    if subject:
        lines.append("État écosystème (audit) pour contexte — pas une preuve d'action :")
        lines.append(_explain_capability(subject, snap, audit_report, facts, uncertainty, limitations))
    return "\n".join(lines)


def _explain_missing(
    subject: str | None,
    snap: dict[str, Any],
    audit_report: dict[str, Any],
    facts: list[dict[str, Any]],
    uncertainty: list[str],
    limitations: list[str],
) -> str:
    limitations.append("capability_propose_not_in_d2")
    base = _explain_capability(subject, snap, audit_report, facts, uncertainty, limitations)
    lines = [base, "Ce qui manque (d'après l'audit, pas une invention) :"]
    diag = _find_cap_diag(audit_report, subject) if subject else None
    if diag is None and subject and not _entity_in_snapshot(subject, snap):
        return _explain_unknown_entity(subject, snap, facts, uncertainty, limitations)
    if diag:
        fault = diag.get("dependency_at_fault")
        if fault:
            lines.append(f"  - Maillon bloquant : {fault}")
            facts.append(
                {
                    "id": "missing.fault",
                    "text": f"blocking dependency: {fault}",
                    "source": "audit.diagnostics",
                }
            )
        for step in diag.get("chain_walk") or []:
            if step.get("audit_status") != AUDIT_CONNECTED:
                lines.append(f"  - {step.get('ref')}: {step.get('audit_status')} ({step.get('reason')})")
        if diag.get("audit_status") == AUDIT_CONNECTED:
            lines.append("  - Audit CONNECTED : rien d'évident ne manque dans la chaîne observée.")
    else:
        uncertainty.append("missing_without_audit_diagnostic")
        lines.append("  - Pas de diagnostic de chaîne pour ce sujet dans l'audit.")
    lines.append("Note : capability.propose() n'est pas activé en D2 — pas de plan d'install inventé.")
    return "\n".join(lines)


def _entity_in_snapshot(subject: str, snap: dict[str, Any]) -> bool:
    sid = subject.strip()
    keys = []
    for family in ("machines", "devices", "agents", "services", "tools", "llms", "providers", "capabilities"):
        for e in snap.get(family) or []:
            if not isinstance(e, dict):
                continue
            keys.append(str(e.get("id") or ""))
            if e.get("app_id"):
                keys.append(str(e.get("app_id")))
            if e.get("device_id"):
                keys.append(str(e.get("device_id")))
    lowered = {k.lower() for k in keys if k}
    s = sid.lower().replace(" ", "_")
    if sid in keys or s in lowered or sid.lower() in lowered:
        return True
    if f"agent:{s}" in lowered or f"device:{s}" in lowered:
        return True
    return False


def _looks_like_unknown_entity(subject: str, snap: dict[str, Any] | None) -> bool:
    if snap is None:
        return True
    return not _entity_in_snapshot(subject, snap)


def _explain_unknown_entity(
    subject: str,
    snap: dict[str, Any],
    facts: list[dict[str, Any]],
    uncertainty: list[str],
    limitations: list[str],
) -> str:
    facts.append(
        {
            "id": "unknown.entity",
            "text": f"Sujet « {subject} » absent du snapshot — ne pas inventer.",
            "source": "explain.guard",
        }
    )
    uncertainty.append(f"subject_absent_from_snapshot:{subject}")
    limitations.append("no_invention_of_absent_components")
    return (
        f"(snapshot_id={snap.get('snapshot_id')}, as_of={snap.get('as_of')})\n"
        f"« {subject} » n'apparaît pas dans ce ArchitectureSnapshot. "
        "Je ne l'invente pas et je ne peux pas affirmer son existence ni son état. "
        "Réponse : inconnu / non observé dans le snapshot courant."
    )
