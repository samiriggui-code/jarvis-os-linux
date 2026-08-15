"""Memory Policy — admission avant store. ≠ Policy Engine d'exécution."""
from __future__ import annotations

import re
from typing import Any

from .types import (
    KINDS,
    IMPORTANCES,
    MemoryDraft,
    MemoryEvidence,
    Rejected,
)

# Motifs secrets / credentials — refus d'admission (pas d'exécution).
_SECRET_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bsk-[a-zA-Z0-9]{16,}\b"),
    re.compile(r"\b(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*\S+", re.I),
    re.compile(r"\bbearer\s+[a-zA-Z0-9._\-]{16,}\b", re.I),
    re.compile(r"\b(password|passwd|pwd)\s*[:=]\s*\S+", re.I),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(xox[baprs]-|ghp_|gho_|github_pat_)[a-zA-Z0-9_\-]{10,}\b"),
)

# Writers autorisés par kind (Hermes n'écrit mission_result / forget hors API).
_WRITERS_BY_KIND: dict[str, frozenset[str]] = {
    "note": frozenset({"user", "core", "hermes", "system"}),
    "preference": frozenset({"user", "core", "system"}),
    "decision": frozenset({"user", "core", "system"}),
    "project_context": frozenset({"user", "core", "system"}),
    "relation": frozenset({"user", "core", "system"}),
    "conversation": frozenset({"user", "core", "system"}),
    "mission_result": frozenset({"verification", "core"}),
    "event": frozenset({"alert", "core", "system"}),
}


class MemoryPolicy:
    """Filtre d'admission. Ne donne jamais d'autorisation d'exécution."""

    def admit(self, draft: MemoryDraft) -> Rejected | None:
        content = (draft.content or "").strip()
        if not content:
            return Rejected("empty_content", "content requis")

        kind = (draft.kind or "").strip()
        if kind not in KINDS:
            return Rejected("denied_kind", f"kind inconnu: {kind!r}")

        importance = (draft.importance or "normal").strip()
        if importance not in IMPORTANCES:
            return Rejected("policy", f"importance invalide: {importance!r}")

        writer = (draft.writer or "user").strip()
        allowed = _WRITERS_BY_KIND.get(kind, frozenset())
        if writer not in allowed:
            return Rejected(
                "denied_kind",
                f"writer {writer!r} ne peut pas store kind={kind!r}",
            )

        if kind == "mission_result":
            rej = self._require_validated_evidence(draft.evidence)
            if rej:
                return rej

        if kind == "event" and importance not in ("high", "critical"):
            return Rejected(
                "policy",
                "event n'est admis qu'en importance high|critical",
            )

        if (
            self._looks_like_secret(content)
            or self._looks_like_secret(draft.title or "")
            or self._looks_like_secret(draft.summary or "")
        ):
            return Rejected("secret_detected", "contenu refuse (secret / credential)")

        if draft.tags:
            blob = " ".join(str(t) for t in draft.tags)
            if self._looks_like_secret(blob):
                return Rejected("secret_detected", "tag refuse (secret / credential)")

        return None

    def can_read(self, role: str | None) -> bool:
        """Aligné surfaces : child n'a pas memory.read."""
        r = (role or "user").strip().lower()
        return r not in ("child", "enfant")

    def can_hard_forget(self, role: str | None) -> bool:
        r = (role or "user").strip().lower()
        return r in ("admin", "owner", "system")

    def can_forget_as_writer(self, writer: str | None) -> bool:
        """Hermes ne hard/soft-delete pas directement."""
        w = (writer or "user").strip().lower()
        return w != "hermes"

    @staticmethod
    def _require_validated_evidence(evidence: MemoryEvidence | None) -> Rejected | None:
        if evidence is None:
            return Rejected("no_evidence", "mission_result exige evidence.validated=true")
        if not evidence.validated:
            return Rejected("no_evidence", "mission_result refuse sans evidence.validated=true")
        return None

    @staticmethod
    def _looks_like_secret(text: str) -> bool:
        if not text:
            return False
        return any(p.search(text) for p in _SECRET_PATTERNS)


def draft_from_mapping(raw: dict[str, Any], *, default_user_id: str = "local") -> MemoryDraft:
    """Helper smoke / callers dict."""
    from .types import MemoryEvidence, MemoryScope, MemorySource

    ev = MemoryEvidence.from_dict(raw.get("evidence"))
    return MemoryDraft(
        user_id=str(raw.get("user_id") or default_user_id),
        kind=str(raw.get("kind") or "note"),
        content=str(raw.get("content") or ""),
        title=(str(raw["title"]).strip() if raw.get("title") else None),
        summary=(str(raw["summary"]).strip() if raw.get("summary") else None),
        scope=MemoryScope.from_dict(raw.get("scope")),
        tags=list(raw["tags"]) if isinstance(raw.get("tags"), list) else None,
        source=MemorySource.from_dict(raw.get("source")) if raw.get("source") else None,
        evidence=ev,
        importance=str(raw.get("importance") or "normal"),
        ttl_days=raw.get("ttl_days") if isinstance(raw.get("ttl_days"), int) else None,
        writer=str(raw.get("writer") or "user"),
        id=str(raw["id"]) if raw.get("id") else None,
    )
