"""
Verification pipeline Core (§7 cahier / Memory V2 M2).

PROPOSITION → ACTION_DEMANDED → ACTION_EXECUTED
  → RESULT_OBSERVED → RESULT_VALIDATED  ← seul gate Memory mission_result

Déterministe : pas de LLM juge. L'observation est fournie par un callable
indépendant (tests, remote_exec, healthcheck…) — jamais le claim agent seul.

Memory est un *effet de bord* après validation : un reject Memory ne
retransforme pas une mission validée en échec (MEMORY_STORE_REJECTED).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

logger = logging.getLogger("jarvis.verification")

EmitFn = Callable[[str, dict[str, Any]], None]
ObserverFn = Callable[[], "Observation"]

# Stages (ordre canonique)
PROPOSITION = "PROPOSITION"
ACTION_DEMANDED = "ACTION_DEMANDED"
ACTION_EXECUTED = "ACTION_EXECUTED"
RESULT_OBSERVED = "RESULT_OBSERVED"
RESULT_VALIDATED = "RESULT_VALIDATED"
RESULT_DISPUTED = "RESULT_DISPUTED"
RESULT_FAILED = "RESULT_FAILED"
MEMORY_STORE_REJECTED = "MEMORY_STORE_REJECTED"

VALIDATOR_ID = "core.verify"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def mission_result_memory_id(mission_id: str) -> str:
    """Identifiant stable → upsert idempotent (1 mission = 1 record)."""
    mid = (mission_id or "").strip()
    if not mid:
        raise ValueError("mission_id requis pour idempotence Memory")
    return f"mr:{mid}"


@dataclass
class Observation:
    """Preuve indépendante du claim agent/LLM/executor."""

    observed: str
    success: bool
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class VerificationRequest:
    mission_id: str
    user_id: str
    intent: str
    proposition: str
    action_demanded: str
    claimed_result: str
    claimed_success: bool
    """True si l'exécutant *affirme* le succès — insuffisant sans Observation."""

    observe: ObserverFn | Observation
    """Source indépendante. Callable rejouable ; Observation figée pour smoke."""

    device_id: str | None = None
    wing: str | None = None
    room: str | None = "missions"
    title: str | None = None
    importance: str = "high"
    tags: list[str] | None = None


@dataclass
class VerificationOutcome:
    mission_id: str
    stage: str
    outcome: str  # validated | disputed | failed | incomplete
    validated: bool
    observed: str | None = None
    evidence: dict[str, Any] | None = None
    memory_record_id: str | None = None
    memory_status: str = "skipped"  # stored | rejected | skipped
    memory_reject: dict[str, Any] | None = None
    history: list[str] = field(default_factory=list)
    claimed_success: bool = False
    observation_success: bool | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "mission_id": self.mission_id,
            "stage": self.stage,
            "outcome": self.outcome,
            "validated": self.validated,
            "observed": self.observed,
            "evidence": self.evidence,
            "memory_record_id": self.memory_record_id,
            "memory_status": self.memory_status,
            "memory_reject": self.memory_reject,
            "history": list(self.history),
            "claimed_success": self.claimed_success,
            "observation_success": self.observation_success,
        }


class VerificationPipeline:
    """
    Orchestre les étapes et, uniquement si RESULT_VALIDATED,
    appelle MemoryAPI.store(kind=mission_result).
    """

    def __init__(
        self,
        *,
        memory_api: Any | None = None,
        emit: EmitFn | None = None,
        validator: str = VALIDATOR_ID,
    ) -> None:
        self._memory = memory_api
        self._emit = emit
        self._validator = validator

    def run(self, request: VerificationRequest) -> VerificationOutcome:
        history: list[str] = []
        mid = (request.mission_id or "").strip()
        if not mid:
            return VerificationOutcome(
                mission_id="",
                stage=RESULT_FAILED,
                outcome="failed",
                validated=False,
                history=[RESULT_FAILED],
                claimed_success=bool(request.claimed_success),
            )

        def step(name: str, payload: dict[str, Any] | None = None) -> None:
            history.append(name)
            body = {"mission_id": mid, "intent": request.intent, **(payload or {})}
            self._fire(name, body)

        step(PROPOSITION, {"proposition": request.proposition})
        step(ACTION_DEMANDED, {"action": request.action_demanded})
        step(
            ACTION_EXECUTED,
            {
                "claimed_result": request.claimed_result,
                "claimed_success": bool(request.claimed_success),
            },
        )

        # Mission affirmée en échec par l'exécutant → pas de succès Memory.
        if not request.claimed_success:
            step(RESULT_FAILED, {"reason": "claimed_success=false"})
            return VerificationOutcome(
                mission_id=mid,
                stage=RESULT_FAILED,
                outcome="failed",
                validated=False,
                history=history,
                claimed_success=False,
                observation_success=None,
                memory_status="skipped",
            )

        observation = self._collect_observation(request.observe)
        if observation is None:
            step(RESULT_FAILED, {"reason": "observation_unavailable"})
            return VerificationOutcome(
                mission_id=mid,
                stage=RESULT_FAILED,
                outcome="incomplete",
                validated=False,
                history=history,
                claimed_success=True,
                observation_success=None,
                memory_status="skipped",
            )

        step(
            RESULT_OBSERVED,
            {
                "observed": observation.observed,
                "observation_success": observation.success,
            },
        )

        # Gate : claim succès + observation indépendante succès.
        if not observation.success:
            step(
                RESULT_DISPUTED,
                {
                    "reason": "claimed_success but observation.success=false",
                    "observed": observation.observed,
                },
            )
            return VerificationOutcome(
                mission_id=mid,
                stage=RESULT_DISPUTED,
                outcome="disputed",
                validated=False,
                observed=observation.observed,
                history=history,
                claimed_success=True,
                observation_success=False,
                memory_status="skipped",
            )

        at = _utc_now()
        details = dict(observation.details or {})
        # reviews[] réservé aux futurs LLM reviewers — jamais autorité de validation.
        reviews = list(details.get("reviews") or []) if isinstance(details.get("reviews"), list) else []
        evidence = {
            "observed": observation.observed,
            "validated": True,
            "validator": self._validator,
            "at": at,
            "details": {k: v for k, v in details.items() if k != "reviews"},
            "reviews": reviews,
        }
        step(RESULT_VALIDATED, {"evidence": evidence})

        outcome = VerificationOutcome(
            mission_id=mid,
            stage=RESULT_VALIDATED,
            outcome="validated",
            validated=True,
            observed=observation.observed,
            evidence=evidence,
            history=history,
            claimed_success=True,
            observation_success=True,
            memory_status="skipped",
        )

        # Memory = effet après gate. Échec store ≠ échec mission.
        self._maybe_store_memory(request, outcome, at)
        return outcome

    def _maybe_store_memory(
        self,
        request: VerificationRequest,
        outcome: VerificationOutcome,
        at: str,
    ) -> None:
        if self._memory is None:
            return
        if not outcome.validated or not outcome.evidence:
            return

        from .memory import (
            MemoryDraft,
            MemoryEvidence,
            MemoryRecord,
            MemoryScope,
            MemorySource,
            Rejected,
        )

        mid = request.mission_id
        record_id = mission_result_memory_id(mid)
        content = self._verbatim_content(request, outcome, at)
        title = (request.title or "").strip() or f"Mission {request.intent}"
        draft = MemoryDraft(
            user_id=request.user_id,
            kind="mission_result",
            content=content,
            title=title[:120],
            scope=MemoryScope(
                wing=request.wing,
                room=request.room or "missions",
                device_id=request.device_id,
                mission_id=mid,
            ),
            tags=list(request.tags or ["mission", request.intent])[:8],
            source=MemorySource(type="verification", ref=f"mission:{mid}"),
            evidence=MemoryEvidence(
                observed=str(outcome.evidence.get("observed") or ""),
                validated=True,
                validator=str(outcome.evidence.get("validator") or self._validator),
                at=str(outcome.evidence.get("at") or at),
                details=dict(outcome.evidence.get("details") or {}),
                reviews=list(outcome.evidence.get("reviews") or []),
            ),
            importance=request.importance or "high",
            writer="verification",
            id=record_id,
        )
        try:
            result = self._memory.store(draft)
        except Exception as exc:  # noqa: BLE001 — jamais casser la validation
            logger.exception("memory store failed after RESULT_VALIDATED · mission=%s", mid)
            outcome.memory_status = "rejected"
            outcome.memory_reject = {"code": "store_exception", "reason": str(exc)}
            self._fire(
                MEMORY_STORE_REJECTED,
                {"mission_id": mid, "code": "store_exception", "reason": str(exc)},
            )
            return

        if isinstance(result, Rejected):
            outcome.memory_status = "rejected"
            outcome.memory_reject = result.to_dict()
            self._fire(
                MEMORY_STORE_REJECTED,
                {
                    "mission_id": mid,
                    "code": result.code,
                    "reason": result.reason,
                    "kind": "mission_result",
                },
            )
            logger.warning(
                "MEMORY_STORE_REJECTED après RESULT_VALIDATED · mission=%s · %s",
                mid,
                result.code,
            )
            return

        assert isinstance(result, MemoryRecord)
        outcome.memory_status = "stored"
        outcome.memory_record_id = result.id

    @staticmethod
    def _verbatim_content(
        request: VerificationRequest,
        outcome: VerificationOutcome,
        at: str,
    ) -> str:
        lines = [
            f"{at} · mission={request.mission_id}",
            f"intent={request.intent}",
        ]
        if request.device_id:
            lines.append(f"device_id={request.device_id}")
        lines.append(f"action={request.action_demanded}")
        lines.append(f"observed: {outcome.observed or ''}")
        lines.append("validated: true")
        return "\n".join(lines)

    @staticmethod
    def _collect_observation(
        observe: ObserverFn | Observation,
    ) -> Observation | None:
        try:
            if isinstance(observe, Observation):
                obs = observe
            else:
                obs = observe()
        except Exception as exc:  # noqa: BLE001
            logger.warning("observation unavailable: %s", exc)
            return None
        if obs is None:
            return None
        if not isinstance(obs, Observation):
            return None
        if not (obs.observed or "").strip():
            return None
        return obs

    def _fire(self, kind: str, payload: dict[str, Any]) -> None:
        if self._emit is None:
            return
        try:
            self._emit(kind, payload)
        except Exception:  # noqa: BLE001
            logger.exception("verification emit failed · kind=%s", kind)
