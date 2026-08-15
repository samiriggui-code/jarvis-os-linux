"""Capability-aware semantic routing — chantier « Orchestration conversationnelle V1 ».

Insère UNE couche entre `capabilities.match_intent()` (déterministe, inchangé)
et le chat libre OpenRouter (inchangé) : quand aucun trigger exact ne matche,
on ne tombe plus directement en conversation générique — on regarde d'abord
si une capacité JARVIS RÉELLEMENT disponible maintenant répond à la demande.

Ce module ne devient jamais un second orchestrateur :

  * **Phase 1** (`build_candidates`) — lecture seule de l'état runtime déjà
    tenu ailleurs (`DeviceRegistry`, `HomeAssistantAdapter.configured`,
    `HermesBridge.configured`, `Capability.available`, `toolsets_for`).
    Aucun nouvel état n'est créé ici, aucun appel réseau (`health()` /
    `toolsets()` restent des coûts par phrase que ce module refuse de payer).
  * **Phase 2** (`resolve_semantic_route`) — un LLM choisit UNIQUEMENT parmi
    les candidats produits par la Phase 1. `parse_routing_decision` rejette
    tout `capability` hors de cette liste : un nom halluciné retombe sur
    `action="chat"`, jamais sur une exécution.
  * **Phase 3** n'existe pas ici : `ws/handlers/chat.py` route la décision
    vers `_open_intent`, le chemin qu'un trigger exact emprunte déjà (Policy
    → routing → executor → Verification inchangés).

Une décision de ce module est une PROPOSITION, jamais une observation — voir
`verification_hooks.py` (« CLAIM ≠ OBSERVATION »). Que le resolver ait choisi
`devices.metrics` ne prouve rien ; seul le résultat de l'executor compte,
exactement comme pour un trigger `match_intent()` classique.
"""
from __future__ import annotations

import json
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import Enum
from typing import Any

from .capabilities import Capability, Owner, allows, for_intent, toolsets_for

logger = logging.getLogger("jarvis.capability_routing")

# Capacités éligibles au routage sémantique — liste courte et volontaire.
#
# Exclues à dessein : tout ce qui est EXECUTE/ADMIN/VPS (terminal, docker,
# storage, crons, outils/agent.tools, files, vps.*, pi.terminal, core.cursor,
# device.app_launch). La Policy les protégerait de toute façon (« le routage
# sémantique n'accorde aucun droit supplémentaire »), mais ne pas même les
# PROPOSER à un classifieur probabiliste réduit la surface d'erreur : V1 =
# router une question de lecture (ou une action HOME que Policy confirme déjà
# systématiquement) vers une capacité existante — pas ouvrir un terminal
# parce qu'un LLM a mal compris une phrase.
SEMANTIC_ROUTABLE_INTENTS: tuple[str, ...] = (
    "devices.metrics",
    "devices.software",
    "devices.list",
    "devices.topology",
    "system.capabilities",
    "system.introspect",
    "web.search",
    "architecture.explain",
    "home.control",
    "core.mission_dev",
    # Ajouté (2026-08-15, post-incident) : absent de la liste initiale, le
    # resolver n'avait donc JAMAIS l'option de choisir la carte visuelle pour
    # une demande du type « montre-moi ton fonctionnement » — seul le texte
    # (`architecture.explain`) lui était proposé, qu'il choisissait par
    # défaut malgré sa propre note « chat only ». Absence de candidat, pas un
    # mauvais jugement du LLM.
    "core.neural_map",
)

# Plancher de confiance pour AGIR — plus haut que celui de `composer.py`
# (0.45) : une composition ratée affiche une mauvaise surface, une capacité
# mal choisie ICI peut déclencher une action réelle (HOME notamment).
MIN_ROUTING_CONFIDENCE = 0.6


class CapabilityState(str, Enum):
    """État runtime d'une capacité — seulement les états que ce module doit
    distinguer, pas un vocabulaire générique pré-construit sans usage."""

    AVAILABLE = "available"
    OFFLINE = "offline"
    UNCONFIGURED = "unconfigured"
    DENIED = "denied"


@dataclass(frozen=True)
class RoutingCandidate:
    """Ce que le resolver a le droit de connaître sur une capacité — jamais
    plus que `composer.py::_catalog_for_prompt` n'en donne pour l'UI."""

    intent: str
    app_id: str
    note: str
    operation: str
    risk: str


@dataclass(frozen=True)
class RoutingDecision:
    action: str  # "use_capability" | "chat"
    capability: str | None
    confidence: float
    reason: str


def _device_agent_online(orch: Any) -> bool:
    devices = getattr(orch, "devices", None)
    if devices is None:
        return False
    return any(
        d.runtime_kind in ("windows_agent", "fake_agent") for d in devices.iter_online()
    )


def _device_has_metrics(orch: Any) -> bool:
    devices = getattr(orch, "devices", None)
    if devices is None:
        return False
    for dev in devices.iter_online():
        if dev.runtime_kind not in ("windows_agent", "fake_agent"):
            continue
        if dev.capabilities.get("system.metrics") is not None:
            return True
    return False


def runtime_state(cap: Capability, orch: Any, role: str | None) -> CapabilityState:
    """Disponibilité MAINTENANT — le catalogue statique seul ne suffit pas
    (`capabilities.py` ne suit aucun état online/offline réel, voir son
    en-tête). Jamais d'appel réseau : uniquement des lectures d'état déjà
    tenu ailleurs (registre en mémoire, flags de config)."""
    if not allows(cap, role):
        return CapabilityState.DENIED

    if cap.owner is Owner.HERMES:
        if not cap.available:
            return CapabilityState.UNCONFIGURED
        if cap.toolset not in toolsets_for(role):
            # Le rôle n'a pas ce toolset délégable — `HermesBridge.ask()`
            # refuserait de toute façon (`toolsets_for`). Ne pas proposer une
            # capacité que Policy/Hermes rejetteraient à coup sûr.
            return CapabilityState.DENIED
        hermes = getattr(orch, "hermes", None)
        if hermes is None or not getattr(hermes, "configured", False):
            return CapabilityState.UNCONFIGURED
        return CapabilityState.AVAILABLE

    if cap.owner is Owner.DEVICE:
        if not cap.available:
            return CapabilityState.UNCONFIGURED
        return (
            CapabilityState.AVAILABLE
            if _device_agent_online(orch)
            else CapabilityState.OFFLINE
        )

    # Owner.CORE — toujours « disponible » pour `Capability.available`, mais
    # certaines intentions dépendent en réalité d'un état runtime précis que
    # le dataclass statique ne connaît pas.
    if cap.intent == "devices.metrics":
        return (
            CapabilityState.AVAILABLE
            if _device_has_metrics(orch)
            else CapabilityState.OFFLINE
        )
    if cap.intent == "devices.software":
        return (
            CapabilityState.AVAILABLE
            if _device_agent_online(orch)
            else CapabilityState.OFFLINE
        )
    if cap.intent == "home.control":
        hass = getattr(orch, "hass", None)
        return (
            CapabilityState.AVAILABLE
            if (hass is not None and getattr(hass, "configured", False))
            else CapabilityState.UNCONFIGURED
        )
    return CapabilityState.AVAILABLE


def build_candidates(orch: Any, role: str | None) -> list[RoutingCandidate]:
    """Phase 1 — inventaire runtime borné à `SEMANTIC_ROUTABLE_INTENTS`. Une
    capacité `OFFLINE` / `UNCONFIGURED` / `DENIED` n'atteint jamais la liste
    : le LLM ne peut donc structurellement pas la choisir (pas seulement « on
    lui a demandé de ne pas »)."""
    out: list[RoutingCandidate] = []
    for intent in SEMANTIC_ROUTABLE_INTENTS:
        cap = for_intent(intent)
        if cap is None:
            # Le catalogue a dérivé (intent renommé/retiré depuis) — jamais
            # une capacité fantôme ne devient candidate.
            logger.warning("capability_routing · intent absent du catalogue : %s", intent)
            continue
        if runtime_state(cap, orch, role) is not CapabilityState.AVAILABLE:
            continue
        out.append(
            RoutingCandidate(
                intent=cap.intent,
                app_id=cap.app_id,
                note=cap.note,
                operation=cap.operation.value,
                risk=cap.risk.name,
            )
        )
    return out


def build_routing_prompt(text: str, candidates: list[RoutingCandidate]) -> str:
    listed = [
        {
            "intent": c.intent,
            "description": c.note,
            "operation": c.operation,
            "risk": c.risk,
        }
        for c in candidates
    ]
    return f"""Une phrase utilisateur arrive à JARVIS. Aucune commande exacte ne l'a
reconnue. Détermine si une capacité JARVIS réellement disponible MAINTENANT y
répond, ou si c'est une conversation ordinaire.

Phrase : {text!r}

Capacités disponibles maintenant — tu ne peux choisir QUE parmi celles-ci,
jamais un autre nom, jamais en inventer une :
{json.dumps(listed, ensure_ascii=False, indent=1)}

Règles absolues :
- operation="read" répond à une question d'observation, de diagnostic, de liste.
- operation="write" déclenche une action réelle (ex. allumer/éteindre un
  appareil). Ne choisis une capacité "write" QUE si la phrase demande
  explicitement cette action. Une question d'observation (« est-ce que tout
  va bien », « regarde si… ») n'est PAS une demande d'action — si aucune
  capacité de lecture ne correspond, réponds "chat", ne force jamais une
  capacité "write" approximative.
- Si la phrase demande de MONTRER/AFFICHER/VISUALISER quelque chose,
  préfère une capacité dont la description mentionne une surface visuelle
  (HUD, carte, écran) plutôt qu'une capacité qui répond uniquement en texte
  — même si cette dernière semble thématiquement proche.
- Si aucune capacité ne correspond vraiment, réponds action="chat". Mieux
  vaut une conversation qu'une capacité mal choisie.
- confidence reflète ta certitude réelle, entre 0.0 et 1.0.

Réponds UNIQUEMENT par un objet JSON, sans texte autour, de cette forme :
{{"action": "use_capability", "capability": "<intent exact>", "confidence": 0.0, "reason": "…"}}
ou :
{{"action": "chat", "capability": null, "confidence": 0.0, "reason": "…"}}"""


class RoutingRejected(RuntimeError):
    """Réponse resolver illisible/invalide — jamais fatale pour l'appelant."""


def parse_routing_decision(raw: Any, candidates: list[RoutingCandidate]) -> RoutingDecision:
    """Extrait la décision JSON d'une réponse LLM. Tolérant sur la forme
    (```json, texte autour), strict sur le fond — même patron que
    `composer.parse_proposal`."""
    if not isinstance(raw, str) or not raw.strip():
        raise RoutingRejected("réponse vide du resolver")

    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise RoutingRejected(f"aucun JSON dans la réponse : {raw[:120]!r}") from None
        try:
            parsed = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise RoutingRejected(f"JSON illisible : {exc}") from exc

    if not isinstance(parsed, dict):
        raise RoutingRejected("la réponse doit être un objet JSON")

    action = str(parsed.get("action") or "").strip()
    if action not in ("use_capability", "chat"):
        raise RoutingRejected(f"action inconnue : {action!r}")

    confidence_raw = parsed.get("confidence")
    try:
        confidence = float(confidence_raw)
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    reason = str(parsed.get("reason") or "")[:300]

    if action == "chat":
        return RoutingDecision(action="chat", capability=None, confidence=confidence, reason=reason)

    capability = str(parsed.get("capability") or "").strip()
    allowed_intents = {c.intent for c in candidates}
    if capability not in allowed_intents:
        # Le LLM a nommé une capacité hors de la liste fournie — refusée,
        # jamais exécutée. C'est la garde qui rend « LE LLM NE PEUT CHOISIR
        # QUE PARMI LES CAPABILITIES FOURNIES » vraie dans le code, pas
        # seulement dans le prompt.
        return RoutingDecision(
            action="chat",
            capability=None,
            confidence=0.0,
            reason=f"capacité hors liste rejetée : {capability!r}",
        )

    return RoutingDecision(
        action="use_capability", capability=capability, confidence=confidence, reason=reason
    )


CompleteFn = Callable[[str], Awaitable[str]]


def _default_complete(orch: Any) -> CompleteFn:
    async def _complete(prompt: str) -> str:
        from .personality import LLMCallMode

        return await orch.providers.complete(prompt, call_mode=LLMCallMode.STRUCTURED)

    return _complete


async def resolve_semantic_route(
    text: str,
    *,
    orch: Any,
    role: str | None,
    complete_fn: CompleteFn | None = None,
) -> RoutingDecision:
    """Phase 2 — borné aux candidats de la Phase 1. Ne lève jamais : toute
    panne (LLM indisponible, réponse illisible, capacité inventée, confiance
    basse) replie sur `action="chat"` — jamais un blocage, jamais une
    exécution hasardeuse. `complete_fn` s'injecte pour les smokes (jamais
    d'appel OpenRouter payant dans un test)."""
    candidates = build_candidates(orch, role)
    if not candidates:
        return RoutingDecision(
            action="chat",
            capability=None,
            confidence=1.0,
            reason="aucune capacité disponible maintenant",
        )

    complete = complete_fn or _default_complete(orch)
    prompt = build_routing_prompt(text, candidates)

    try:
        raw = await complete(prompt)
    except Exception as exc:  # noqa: BLE001
        logger.warning("capability_routing · resolver indisponible : %s", exc)
        return RoutingDecision(
            action="chat", capability=None, confidence=0.0, reason=f"resolver indisponible : {exc}"
        )

    try:
        decision = parse_routing_decision(raw, candidates)
    except RoutingRejected as exc:
        logger.info("capability_routing · réponse rejetée : %s", exc)
        return RoutingDecision(action="chat", capability=None, confidence=0.0, reason=str(exc))

    if decision.action == "use_capability" and decision.confidence < MIN_ROUTING_CONFIDENCE:
        return RoutingDecision(
            action="chat",
            capability=None,
            confidence=decision.confidence,
            reason=(
                f"confiance {decision.confidence:.2f} sous le plancher "
                f"{MIN_ROUTING_CONFIDENCE:.2f} — {decision.reason}"
            ),
        )

    logger.info(
        "capability_routing · « %s » → %s (confiance=%.2f)",
        text[:48],
        decision.capability if decision.action == "use_capability" else "chat",
        decision.confidence,
    )
    return decision
