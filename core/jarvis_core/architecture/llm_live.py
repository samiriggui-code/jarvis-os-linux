"""Architecture Awareness D2.2 — LLM live borné au contrat D2.1.

Pipeline :
  snapshot → audit → explain() → llm_bound_payload
    → AI Provider Manager (complete)
    → validate_llm_explanation
    → réponse (ou fallback template)

Le LLM n'est pas une source de vérité. Il ne reçoit que le payload borné.
Aucun Hermes, voix, HUD, HA, probe, Memory write, Verification write.
"""
from __future__ import annotations

import copy
import json
import logging
from typing import Any, Awaitable, Callable, Mapping

from .explain import explain, validate_llm_explanation
from .schema import redact_tree, snapshot_contains_secret

logger = logging.getLogger("jarvis.architecture.llm_live")

CompleteFn = Callable[..., Awaitable[str]]


def prompt_from_bound_payload(bound: Mapping[str, Any]) -> str:
    """Formate le payload explain (ancre D2.1 incluse) en prompt unique.

    Rien d'autre n'est ajouté : pas d'historique, pas de Memory, pas de docs.
    """
    if not isinstance(bound, Mapping):
        raise TypeError("bound payload must be a mapping")
    safe = redact_tree(copy.deepcopy(dict(bound)))
    if snapshot_contains_secret(safe):
        raise RuntimeError("bound payload contained unredacted secret — D2.2 prompt blocked")
    instruction = str(safe.get("instruction") or "").strip()
    body = json.dumps(safe, ensure_ascii=False, sort_keys=True)
    parts = []
    if instruction:
        parts.append(instruction)
    parts.append(
        "Voici le payload d'architecture (seule source autorisée). "
        "Réponds en français, concis, sans inventer de composants absents, "
        "sans résoudre les conflicts[], sans promouvoir UNKNOWN/CONFIGURED en AVAILABLE."
    )
    parts.append(body)
    return "\n\n".join(parts)


async def explain_live(
    snapshot: dict[str, Any],
    question: str,
    *,
    complete: CompleteFn | None = None,
    skip_llm: bool = False,
    subject: str | None = None,
    audit_report: dict[str, Any] | None = None,
    hermes_history: list[Any] | None = None,
    memory_hints: Any | None = None,
) -> dict[str, Any]:
    """
    D2.2 : explain déterministe + LLM Provider Manager + garde anti-hallucination.

    ``complete`` : injectable (smokes). Signature ``async (prompt: str) -> str``.
    Si absent : ``AIProviderManager.complete``. Mode SYSTEM → pas d'appel, template.

    ``llm_formatter`` n'est pas exposé ici — D2.2 possède le branchement.
    """
    draft = explain(
        snapshot,
        question,
        subject=subject,
        audit_report=audit_report,
        llm_formatter=None,
        hermes_history=hermes_history,
        memory_hints=memory_hints,
    )
    bound = draft.get("llm_bound_payload") or {}
    template = str(draft.get("explanation_template") or draft.get("explanation") or "")

    limitations = list(draft.get("limitations") or [])
    limitations.append("d2_2_llm_live_bound_to_d21_payload")
    uncertainty = list(draft.get("uncertainty") or [])
    meta = dict(draft.get("meta") or {})
    meta["pipeline"] = "snapshot→audit→explain→llm_bound_payload→provider→validate"
    meta["contract"] = "D2.2"
    meta["llm_live"] = True
    meta["llm_used"] = False
    meta["llm_rejected"] = False
    meta["llm_skipped"] = False
    meta["llm_error"] = False
    meta["llm_violations"] = []

    provider_mode = None
    complete_fn = complete
    if complete_fn is None and not skip_llm:
        complete_fn, provider_mode = _default_complete()
        meta["provider_mode"] = provider_mode
        if provider_mode == "system":
            skip_llm = True
            limitations.append("d2_2_llm_skipped_system_mode")
    elif complete_fn is not None:
        meta["provider_mode"] = "injected"
    else:
        meta["provider_mode"] = "skipped"

    if skip_llm:
        meta["llm_skipped"] = True
        limitations.append("d2_2_llm_not_called")
        draft["limitations"] = sorted(set(limitations))
        draft["meta"] = meta
        draft["explanation"] = template
        return redact_tree(draft)

    try:
        prompt = prompt_from_bound_payload(bound)
    except Exception as exc:  # noqa: BLE001
        logger.warning("D2.2 prompt blocked: %s", exc)
        meta["llm_error"] = True
        meta["llm_error_detail"] = "prompt_blocked"
        limitations.append("d2_2_prompt_blocked")
        uncertainty.append("d2_2_prompt_blocked")
        draft["limitations"] = sorted(set(limitations))
        draft["uncertainty"] = sorted(set(uncertainty))
        draft["meta"] = meta
        draft["explanation"] = template
        return redact_tree(draft)

    try:
        raw = await complete_fn(prompt)
        raw = str(raw or "")
        try:
            from jarvis_core.providers import strip_reasoning

            raw = strip_reasoning(raw)
        except Exception:  # noqa: BLE001
            raw = raw.strip()
    except Exception as exc:  # noqa: BLE001
        logger.warning("D2.2 LLM complete failed: %s", exc)
        meta["llm_error"] = True
        meta["llm_error_detail"] = type(exc).__name__
        limitations.append("d2_2_llm_error_fallback_template")
        uncertainty.append("d2_2_llm_error")
        draft["limitations"] = sorted(set(limitations))
        draft["uncertainty"] = sorted(set(uncertainty))
        draft["meta"] = meta
        draft["explanation"] = template
        return redact_tree(draft)

    ok, violations = validate_llm_explanation(raw, snapshot, bound)
    meta["llm_violations"] = list(violations)
    if ok:
        draft["explanation"] = raw
        meta["llm_used"] = True
        meta["deterministic"] = False
        limitations.append("d2_2_llm_accepted")
    else:
        draft["explanation"] = template
        meta["llm_rejected"] = True
        meta["llm_used"] = False
        meta["deterministic"] = True
        limitations.append("d2_2_llm_output_rejected_anti_hallucination")
        for v in violations:
            uncertainty.append(f"llm_violation:{v}")

    draft["limitations"] = sorted(set(limitations))
    draft["uncertainty"] = sorted(set(uncertainty))
    draft["meta"] = meta
    out = redact_tree(draft)
    if snapshot_contains_secret(out):
        out["explanation"] = template
        out["meta"]["llm_rejected"] = True
        out["meta"]["llm_used"] = False
        out["limitations"] = sorted(
            set(list(out.get("limitations") or []) + ["secret_blocked_in_explain_live"])
        )
    return out


def _default_complete(
    *,
    user_role: str | None = None,
    language: str = "fr",
) -> tuple[CompleteFn | None, str]:
    """Branchement Provider Manager — pas d'appel direct OpenRouter/Ollama."""
    from jarvis_core.personality import (
        LLMCallMode,
        PersonalityRequest,
        SpeakerEntity,
        resolve_personality,
    )
    from jarvis_core.providers import AIProviderManager

    manager = AIProviderManager()
    mode = manager.current_mode()
    lang: str = language if language in ("fr", "en") else "fr"
    personality = resolve_personality(
        PersonalityRequest(
            speaker=SpeakerEntity.JARVIS,
            user_role=user_role,
            language=lang,  # type: ignore[arg-type]
            context=LLMCallMode.ARCHITECTURE,
        )
    )

    async def _complete(prompt: str) -> str:
        return await manager.complete(
            prompt,
            call_mode=LLMCallMode.ARCHITECTURE,
            personality=personality,
        )

    return _complete, mode
