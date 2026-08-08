"""Synchronisation Mission Control DEV ↔ kanban Hermes (P1)."""
from __future__ import annotations

import logging
from typing import Any

from ..hermes.bridge import HermesRefused, HermesUnavailable
from ..policy import Decision

logger = logging.getLogger("jarvis.core.mission_dev")


async def sync_project_card(
    bridge: Any,
    *,
    role: str | None,
    project_name: str,
    project_id: str,
    mission_dev_id: str,
) -> tuple[bool, str]:
    """Demande à Hermes de créer ou mettre à jour la carte kanban du projet.

    Utilise le toolset ``skills`` (boucle agent Hermes, outils ``kanban_*``).
    Échec non bloquant : le runner Mission DEV continue en local.
    """
    if not getattr(bridge, "configured", False):
        return False, "JARVIS_HERMES_KEY absente"

    from ..capabilities import CAPABILITIES

    cap = CAPABILITIES.get("outils")
    if cap is None:
        return False, "capacité agent.tools absente"

    prompt = (
        f"Mission Control DEV — synchronise le kanban pour le projet "
        f"«{project_name}» (project_id={project_id}, mission_dev_id={mission_dev_id}). "
        "Utilise kanban_create ou kanban_show pour créer ou afficher la carte projet. "
        "Réponds en une phrase : id carte ou statut."
    )
    decision = Decision(allowed=True, needs_confirmation=False)

    try:
        reply = await bridge.ask(cap, prompt, role=role, decision=decision)
    except HermesRefused as exc:
        logger.info("kanban refusé · %s", exc)
        return False, str(exc)[:120]
    except HermesUnavailable as exc:
        logger.info("kanban indisponible · %s", exc)
        return False, str(exc)[:120]

    text = (reply.text or "").strip()
    if not text:
        return False, "réponse Hermes vide"
    return True, text[:200]
