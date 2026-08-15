"""Contrats Memory V2 — indépendants du backend."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

MemoryKind = Literal[
    "preference",
    "decision",
    "mission_result",
    "event",
    "conversation",
    "project_context",
    "relation",
    "note",
]

Importance = Literal["low", "normal", "high", "critical"]

Writer = Literal["user", "core", "hermes", "verification", "alert", "system"]

RejectCode = Literal[
    "denied_kind",
    "no_evidence",
    "secret_detected",
    "quota",
    "policy",
    "denied_role",
    "empty_content",
]

KINDS: frozenset[str] = frozenset(
    {
        "preference",
        "decision",
        "mission_result",
        "event",
        "conversation",
        "project_context",
        "relation",
        "note",
    }
)

IMPORTANCES: frozenset[str] = frozenset({"low", "normal", "high", "critical"})


@dataclass
class MemoryScope:
    wing: str | None = None
    room: str | None = None
    device_id: str | None = None
    mission_id: str | None = None
    session_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}

    @classmethod
    def from_dict(cls, raw: Any) -> MemoryScope:
        if not isinstance(raw, dict):
            return cls()
        return cls(
            wing=_opt_str(raw.get("wing")),
            room=_opt_str(raw.get("room")),
            device_id=_opt_str(raw.get("device_id")),
            mission_id=_opt_str(raw.get("mission_id")),
            session_id=_opt_str(raw.get("session_id")),
        )


@dataclass
class MemoryEvidence:
    observed: str
    validated: bool
    validator: str = "core.verify"
    at: str | None = None
    # Extensible M2.1+ : details machine ; reviews[] = futurs LLM reviewers (jamais preuve seule).
    details: dict[str, Any] = field(default_factory=dict)
    reviews: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if d.get("at") is None:
            d.pop("at", None)
        if not d.get("details"):
            d.pop("details", None)
        if not d.get("reviews"):
            d.pop("reviews", None)
        return d

    @classmethod
    def from_dict(cls, raw: Any) -> MemoryEvidence | None:
        if not isinstance(raw, dict):
            return None
        observed = str(raw.get("observed") or "").strip()
        if not observed and raw.get("validated") is None:
            return None
        details = raw.get("details") if isinstance(raw.get("details"), dict) else {}
        reviews = raw.get("reviews") if isinstance(raw.get("reviews"), list) else []
        return cls(
            observed=observed or "(none)",
            validated=bool(raw.get("validated")),
            validator=str(raw.get("validator") or "core.verify"),
            at=_opt_str(raw.get("at")),
            details=dict(details),
            reviews=[r for r in reviews if isinstance(r, dict)],
        )


@dataclass
class MemorySource:
    type: str = "user"
    ref: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"type": self.type}
        if self.ref:
            d["ref"] = self.ref
        return d

    @classmethod
    def from_dict(cls, raw: Any) -> MemorySource:
        if not isinstance(raw, dict):
            return cls()
        return cls(type=str(raw.get("type") or "user"), ref=_opt_str(raw.get("ref")))


@dataclass
class MemoryRecord:
    id: str
    user_id: str
    kind: str
    content: str
    title: str | None = None
    summary: str | None = None
    scope: MemoryScope = field(default_factory=MemoryScope)
    tags: list[str] = field(default_factory=list)
    source: MemorySource = field(default_factory=MemorySource)
    evidence: MemoryEvidence | None = None
    created_at: str = ""
    updated_at: str = ""
    importance: str = "normal"
    ttl_days: int | None = None
    tombstone: bool = False
    synced: bool = True  # compat HUD V1

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "id": self.id,
            "user_id": self.user_id,
            "kind": self.kind,
            "content": self.content,
            "title": self.title,
            "summary": self.summary,
            "scope": self.scope.to_dict(),
            "tags": list(self.tags),
            "source": self.source.to_dict(),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "importance": self.importance,
            "ttl_days": self.ttl_days,
            "tombstone": self.tombstone,
            "synced": self.synced,
        }
        if self.evidence is not None:
            d["evidence"] = self.evidence.to_dict()
        return d

    def to_legacy_item(self) -> dict[str, Any]:
        """Forme attendue par le WS / MemoryPanel V1."""
        return {
            "id": self.id,
            "title": self.title or "Souvenir",
            "content": self.content,
            "tags": list(self.tags) or ["notes"],
            "synced": self.synced,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "kind": self.kind,
            "tombstone": self.tombstone,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any], *, default_user_id: str = "local") -> MemoryRecord:
        kind = str(raw.get("kind") or "note")
        if kind not in KINDS:
            kind = "note"
        importance = str(raw.get("importance") or "normal")
        if importance not in IMPORTANCES:
            importance = "normal"
        tags_raw = raw.get("tags")
        tags = [str(t).strip() for t in tags_raw if t and str(t).strip()][:8] if isinstance(tags_raw, list) else []
        return cls(
            id=str(raw.get("id") or ""),
            user_id=str(raw.get("user_id") or default_user_id),
            kind=kind,
            content=str(raw.get("content") or ""),
            title=_opt_str(raw.get("title")),
            summary=_opt_str(raw.get("summary")),
            scope=MemoryScope.from_dict(raw.get("scope")),
            tags=tags,
            source=MemorySource.from_dict(raw.get("source")),
            evidence=MemoryEvidence.from_dict(raw.get("evidence")),
            created_at=str(raw.get("created_at") or ""),
            updated_at=str(raw.get("updated_at") or ""),
            importance=importance,
            ttl_days=_opt_int(raw.get("ttl_days")),
            tombstone=bool(raw.get("tombstone")),
            synced=bool(raw.get("synced", True)),
        )


@dataclass
class MemoryDraft:
    user_id: str
    kind: str
    content: str
    title: str | None = None
    summary: str | None = None
    scope: MemoryScope | None = None
    tags: list[str] | None = None
    source: MemorySource | None = None
    evidence: MemoryEvidence | None = None
    importance: str = "normal"
    ttl_days: int | None = None
    writer: str = "user"
    id: str | None = None


@dataclass
class Rejected:
    code: str
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {"ok": False, "rejected": True, "code": self.code, "reason": self.reason}


@dataclass
class SearchHit:
    record: MemoryRecord
    score: float
    snippet: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "record": self.record.to_dict(),
            "score": self.score,
            "snippet": self.snippet,
        }


@dataclass
class ForgetResult:
    ok: bool
    denied: bool = False
    reason: str | None = None
    hard: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "denied": self.denied,
            "reason": self.reason,
            "hard": self.hard,
        }


def _opt_str(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _opt_int(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None
