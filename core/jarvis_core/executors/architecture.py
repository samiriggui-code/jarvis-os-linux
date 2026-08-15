"""Core executor — Architecture Awareness (intent architecture.explain).

Pas de HUD, voix, WS, Hermes, HA. Retourne le rapport explain_live.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


class ArchitectureExecutorsMixin:

    async def _execute_architecture_explain(self, payload: dict[str, Any]) -> dict[str, Any]:
        """snapshot IN_MEMORY → explain_live → dict. Aucune surface / TTS."""
        from ..architecture import explain_live, snapshot

        question = str(payload.get("prompt") or payload.get("question") or "").strip()
        if not question:
            question = "Comment fonctionnes-tu ?"

        subject_raw = payload.get("subject")
        subject = str(subject_raw).strip() if subject_raw else None
        skip_llm = bool(payload.get("skip_llm"))

        snap = snapshot(
            devices_registry=getattr(self, "devices", None),
            supervisor=getattr(self, "supervisor", None),
        )
        report = await explain_live(
            snap,
            question,
            skip_llm=skip_llm,
            subject=subject,
        )
        return {
            "ok": True,
            "intent": "architecture.explain",
            "question": question,
            "snapshot_id": report.get("snapshot_id"),
            "explanation": report.get("explanation"),
            "intent_classified": report.get("intent"),
            "meta": report.get("meta"),
            "limitations": report.get("limitations"),
            "uncertainty": report.get("uncertainty"),
            "conflicts": report.get("conflicts"),
        }
