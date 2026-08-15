"""Personality Resolver — QUI parle, à qui, dans quel contexte, avec quel registre."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from ..locale import Lang
from . import principles as P
from .types import HumorLevel, LLMCallMode, SpeakerEntity, TechnicalLevel

Role = Literal["admin", "user", "child", "guest"]


@dataclass(frozen=True)
class PersonalityRequest:
    speaker: SpeakerEntity = SpeakerEntity.JARVIS
    user_role: str | None = None
    language: Lang = "fr"
    context: LLMCallMode = LLMCallMode.NARRATIVE
    severity: str = "normal"
    address: str | None = None
    title: str | None = None
    user_name: str | None = None


@dataclass(frozen=True)
class PersonalityResolution:
    apply_narrative: bool
    humor: HumorLevel
    register: str
    technical_level: TechnicalLevel
    system_instructions: str
    voice_personality: bool
    voice_instruct: str | None
    speaker_entity: SpeakerEntity
    child_safe: bool


def _normalize_role(role: str | None) -> Role | None:
    if not role:
        return None
    r = role.strip().lower()
    if r in ("admin", "user", "child", "guest"):
        return r  # type: ignore[return-value]
    return None


def _humor_for(context: LLMCallMode, severity: str, role: Role | None) -> HumorLevel:
    sev = (severity or "normal").lower()
    if sev in ("critical", "high", "alert"):
        return HumorLevel.OFF
    if context in (LLMCallMode.ALERT, LLMCallMode.DIAGNOSTIC):
        return HumorLevel.OFF
    if role == "child":
        return HumorLevel.SUBTLE
    if context in (LLMCallMode.NARRATIVE, LLMCallMode.ARCHITECTURE, LLMCallMode.HOME):
        return HumorLevel.SUBTLE
    return HumorLevel.OFF


def _technical_level(context: LLMCallMode, role: Role | None) -> TechnicalLevel:
    if role == "child":
        return TechnicalLevel.SIMPLE
    if context == LLMCallMode.ARCHITECTURE:
        return TechnicalLevel.ADVANCED
    if context == LLMCallMode.DIAGNOSTIC:
        return TechnicalLevel.NORMAL
    return TechnicalLevel.NORMAL


def resolve_personality(req: PersonalityRequest) -> PersonalityResolution:
    """Résolution pure — déterministe, testable sans LLM."""
    role = _normalize_role(req.user_role)
    child_safe = role == "child"

    if req.context in (LLMCallMode.COMPOSER, LLMCallMode.STRUCTURED):
        return PersonalityResolution(
            apply_narrative=False,
            humor=HumorLevel.OFF,
            register="structured",
            technical_level=TechnicalLevel.NORMAL,
            system_instructions=P.COMPOSER_SYSTEM,
            voice_personality=False,
            voice_instruct=None,
            speaker_entity=req.speaker,
            child_safe=child_safe,
        )

    humor = _humor_for(req.context, req.severity, role)
    tech = _technical_level(req.context, role)

    parts: list[str] = [P.JARVIS_IDENTITY_CORE]

    if req.speaker == SpeakerEntity.JARVIS:
        parts.append(P.MAJORDOME_RULES)
    elif req.speaker == SpeakerEntity.HERMES:
        parts.append(
            "Tu es Hermes, agent d'analyse et d'investigation du foyer JARVIS. "
            "Posée, structurée, prudente. JARVIS reste l'orchestrateur visible."
        )
    elif req.speaker == SpeakerEntity.CLAUDE:
        parts.append(P.CLAUDE_RULES)
    elif req.speaker == SpeakerEntity.CURSOR:
        parts.append(P.CURSOR_RULES)

    if child_safe:
        parts.append(P.CHILD_RULES)
        if req.user_name:
            parts.append(f"Prénom de l'enfant : {req.user_name}.")
    elif role in ("admin", "user") and req.title:
        parts.append(
            f"Adresse l'utilisateur par « {req.title} » avec parcimonie, "
            f"jamais le prénom en salutation formelle."
        )
    elif req.address == "tu":
        parts.append("Tutoiement naturel.")

    if req.context == LLMCallMode.ARCHITECTURE:
        parts.append(P.ARCHITECTURE_PRESENTATION)
    elif req.context == LLMCallMode.DIAGNOSTIC:
        parts.append(P.DIAGNOSTIC_RULES)
    elif req.context == LLMCallMode.ALERT:
        parts.append(P.ALERT_RULES)
    elif req.context == LLMCallMode.HOME:
        parts.append(P.HOME_RULES)

    if humor == HumorLevel.OFF:
        parts.append(P.HUMOR_RULES_OFF)
    else:
        parts.append(P.HUMOR_RULES_SUBTLE)

    if tech == TechnicalLevel.SIMPLE:
        parts.append("Niveau de langage : simple, oral, phrases courtes.")
    elif tech == TechnicalLevel.ADVANCED:
        parts.append(
            "Niveau technique : avancé autorisé si utile, reste pédagogique."
        )

    if req.language == "en":
        parts.append("Reply in English unless the user explicitly asked for French.")

    register = "child-safe" if child_safe else "majordome"
    if req.context == LLMCallMode.ALERT:
        register = "alert"
    elif req.context == LLMCallMode.DIAGNOSTIC:
        register = "factual"

    voice_instruct = None
    voice_personality = False
    if child_safe:
        voice_instruct = "Voix douce, chaleureuse, débit posé."
    elif humor == HumorLevel.SUBTLE and req.context == LLMCallMode.NARRATIVE:
        voice_personality = False  # hook voicebox prêt ; activer via voice_profile

    return PersonalityResolution(
        apply_narrative=True,
        humor=humor,
        register=register,
        technical_level=tech,
        system_instructions="\n".join(parts),
        voice_personality=voice_personality,
        voice_instruct=voice_instruct,
        speaker_entity=req.speaker,
        child_safe=child_safe,
    )


def build_system_message(
    resolution: PersonalityResolution,
    *,
    operator_instructions: str | None = None,
    env_override: str | None = None,
    legacy_fallback: str | None = None,
) -> str:
    """Message system final pour Provider Manager.

    Hiérarchie explicite (narrative) :
      1. PersonalityResolver → ``system_instructions``
      2. Instructions opérateur optionnelles (env ``JARVIS_OPERATOR_PROMPT`` ou
         legacy ``JARVIS_SYSTEM_PROMPT``) — **complètent**, ne remplacent pas.

    COMPOSER / STRUCTURED : pas de personnalité narrative ; opérateur en append seulement.
    """
    _ = legacy_fallback  # conservé pour compat signature ; identité déjà dans resolution
    operator = (operator_instructions or env_override or "").strip() or None
    if not resolution.apply_narrative:
        base = resolution.system_instructions
        if operator:
            return f"{base}\n\n[Instructions opérateur]\n{operator}"
        return base
    parts = [resolution.system_instructions]
    if operator:
        parts.append(
            "[Instructions opérateur — complètent le registre, ne le remplacent pas]\n"
            + operator
        )
    return "\n\n".join(parts)
