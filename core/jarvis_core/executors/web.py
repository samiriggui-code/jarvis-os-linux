"""Core executors — recherche web (`web.search`), FAST V1.

Remplace le toolset web de Hermes, retiré le 2026-08-17 sans exécutant —
JARVIS répondait honnêtement « pas d'outil de recherche », un vrai manque
produit, pas un bug d'affichage. Voir `providers.py::AIProviderManager.web_search`
pour la politique FAST (1 recherche, 1 appel LLM, budget dur 10s, aucune
boucle agentique — feu vert Samir 2026-08-17).
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


class WebExecutorsMixin:

    async def _execute_web_search(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..surfaces.publisher import publish_result_surface

        uid = self._session_user_id() or "local"
        query = str(payload.get("prompt") or "").strip()
        if not query:
            return {"ok": False, "reason": "requête vide"}

        result = await self.providers.web_search(query)
        meta = result.get("metadata") or {}

        # Observabilité — mode/provider/fallback/latence/coût/succès, un
        # évènement par recherche (feu vert Samir : "je veux pouvoir mesurer
        # le comportement réel").
        logger.info(
            "web.search OBS · mode=%s provider=%s fallback=%s searches=%s "
            "latency_ms=%s cost=%.4f$ success=%s · « %s »",
            result.get("mode"), result.get("provider"), meta.get("fallback_used"),
            meta.get("searches_used"), meta.get("latency_ms"), meta.get("cost_estimate_usd") or 0.0,
            meta.get("success"), query[:60],
        )

        if not meta.get("success"):
            await self.say(
                "device_unreachable",
                bindings={"device": "recherche web"},
                fallback_text=result.get("speech") or "Je n'ai pas pu faire la recherche, désolé.",
                user_id=uid,
            )
            return {"ok": False, "reason": "toutes les recherches ont échoué", "metadata": meta}

        speech = result.get("speech") or "(pas de résultat)"
        items = [
            f"{r.get('title') or r.get('url')} — {r.get('url')}"
            for r in (result.get("results") or [])
        ]

        await publish_result_surface(
            self,
            "reach",
            title="Recherche",
            body=speech,
            source=f"web.search · {result.get('provider')}",
            items=items,
        )
        ev = await self.speak(speech, user_id=uid)
        await self.broadcast(ev)
        return {"ok": True, "result": result}
