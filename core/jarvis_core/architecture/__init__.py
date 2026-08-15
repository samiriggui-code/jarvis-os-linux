"""Architecture Awareness — snapshot (D1) · audit (D3) · explain (D2) · llm_payload (D2.1) · llm_live (D2.2).

Voir docs/architecture/JARVIS-Architecture-Awareness.md (B′).
"""
from __future__ import annotations

from .code_map import CODE_MAP_SCHEMA_VERSION, code_map
from .audit import (
    AUDIT_CONNECTED,
    AUDIT_DEGRADED,
    AUDIT_MISSING,
    AUDIT_OFFLINE,
    AUDIT_SCHEMA_VERSION,
    AUDIT_UNCONFIGURED,
    AUDIT_UNKNOWN,
    audit,
    map_snapshot_status_to_audit,
)
from .explain import (
    ARCHITECTURE_WALKTHROUGH_V1,
    EXPLAIN_SCHEMA_VERSION,
    build_explain_llm_context,
    classify_intent,
    explain,
    validate_llm_explanation,
)
from .llm_live import explain_live, prompt_from_bound_payload
from .llm_payload import LLM_BOUND_SCHEMA_VERSION, build_llm_bound_payload
from .schema import (
    SCHEMA_VERSION,
    assert_available_invariant,
    enforce_available_or_downgrade,
    redact_tree,
    snapshot_contains_secret,
)
from .snapshot import snapshot

__all__ = [
    "ARCHITECTURE_WALKTHROUGH_V1",
    "AUDIT_CONNECTED",
    "AUDIT_DEGRADED",
    "AUDIT_MISSING",
    "AUDIT_OFFLINE",
    "AUDIT_SCHEMA_VERSION",
    "AUDIT_UNCONFIGURED",
    "AUDIT_UNKNOWN",
    "CODE_MAP_SCHEMA_VERSION",
    "EXPLAIN_SCHEMA_VERSION",
    "LLM_BOUND_SCHEMA_VERSION",
    "SCHEMA_VERSION",
    "assert_available_invariant",
    "audit",
    "build_explain_llm_context",
    "build_llm_bound_payload",
    "classify_intent",
    "code_map",
    "enforce_available_or_downgrade",
    "explain",
    "explain_live",
    "map_snapshot_status_to_audit",
    "prompt_from_bound_payload",
    "redact_tree",
    "snapshot",
    "snapshot_contains_secret",
    "validate_llm_explanation",
]
