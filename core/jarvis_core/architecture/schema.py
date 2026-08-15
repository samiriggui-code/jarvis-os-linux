"""Architecture Awareness D1 — constantes, invariant AVAILABLE, redaction."""
from __future__ import annotations

import copy
import re
from typing import Any

SCHEMA_VERSION = "1.0.0"

PROVENANCE_DOC = "DOC"
PROVENANCE_CODE = "CODE"
PROVENANCE_OBSERVED = "OBSERVED"
PROVENANCE_UNKNOWN = "UNKNOWN"

# TTL familles (secondes) — B′
TTL_DEVICES_S = 120.0
TTL_SUPERVISOR_S = 30.0
TTL_PROBE_STORE_S = 120.0

# Motifs secrets — alignés MemoryPolicy (ne pas importer Memory pour rester découplé).
_SECRET_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bsk-[a-zA-Z0-9]{16,}\b"),
    re.compile(r"\b(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*\S+", re.I),
    re.compile(r"\bbearer\s+[a-zA-Z0-9._\-]{16,}\b", re.I),
    re.compile(r"\b(password|passwd|pwd)\s*[:=]\s*\S+", re.I),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(xox[baprs]-|ghp_|gho_|github_pat_)[a-zA-Z0-9_\-]{10,}\b"),
    re.compile(r"\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),  # JWT-ish
)

_REDACTED = "[REDACTED]"


def assert_available_invariant(entry: dict[str, Any]) -> bool:
    """
    True si entry est un AVAILABLE valide.
    False sinon (y compris si status != AVAILABLE).
    """
    if entry.get("status") != "AVAILABLE":
        return True  # invariant ne s'applique qu'à AVAILABLE
    if entry.get("provenance") != PROVENANCE_OBSERVED:
        return False
    evidence = entry.get("evidence")
    if not isinstance(evidence, list) or len(evidence) == 0:
        return False
    if entry.get("stale") is True:
        return False
    return True


def enforce_available_or_downgrade(entry: dict[str, Any]) -> dict[str, Any]:
    """Si status=AVAILABLE mais invariant cassé → UNKNOWN (jamais mentir)."""
    if entry.get("status") != "AVAILABLE":
        return entry
    if assert_available_invariant(entry):
        return entry
    out = dict(entry)
    out["status"] = "UNKNOWN"
    quals = list(out.get("qualifiers") or [])
    if "INVALID_AVAILABLE_DOWNGRADED" not in quals:
        quals.append("INVALID_AVAILABLE_DOWNGRADED")
    out["qualifiers"] = quals
    lim = list(out.get("limitations") or [])
    lim.append("available_invariant_failed")
    out["limitations"] = lim
    return out


def looks_like_secret(text: str) -> bool:
    if not text:
        return False
    return any(p.search(text) for p in _SECRET_PATTERNS)


def redact_value(value: Any) -> Any:
    if isinstance(value, str):
        if looks_like_secret(value):
            return _REDACTED
        # Strip common secret query params
        if "token=" in value.lower() or "api_key=" in value.lower() or "key=" in value.lower():
            return re.sub(
                r"(?i)(token|api_key|key|password|secret)=([^&\s]+)",
                r"\1=[REDACTED]",
                value,
            )
        return value
    if isinstance(value, dict):
        return redact_tree(value)
    if isinstance(value, list):
        return [redact_value(v) for v in value]
    return value


def redact_tree(obj: Any) -> Any:
    """Deep copy + redact secrets. Ne mute pas l'entrée."""
    data = copy.deepcopy(obj)
    return _redact_walk(data)


def _redact_walk(node: Any) -> Any:
    if isinstance(node, dict):
        out: dict[str, Any] = {}
        for k, v in node.items():
            kl = str(k).lower()
            if kl in (
                "token",
                "password",
                "passwd",
                "secret",
                "api_key",
                "apikey",
                "authorization",
                "private_key",
                "access_token",
                "refresh_token",
                "jarvis_hermes_key",
                "openrouter_api_key",
                "elevenlabs_api_key",
            ):
                out[k] = _REDACTED
            else:
                out[k] = _redact_walk(v)
        return out
    if isinstance(node, list):
        return [_redact_walk(v) for v in node]
    if isinstance(node, str):
        return redact_value(node)
    return node


def snapshot_contains_secret(snapshot: dict[str, Any]) -> bool:
    """True si une chaîne non redactée matche un motif secret."""

    def walk(n: Any) -> bool:
        if isinstance(n, str):
            if n == _REDACTED:
                return False
            return looks_like_secret(n)
        if isinstance(n, dict):
            return any(walk(v) for v in n.values())
        if isinstance(n, list):
            return any(walk(v) for v in n)
        return False

    return walk(snapshot)
