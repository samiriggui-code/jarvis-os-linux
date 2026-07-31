"""AI Provider Manager — bascule local → distant → cloud (OpenRouter) → mode système."""

from __future__ import annotations

import json
import logging
import os
from enum import Enum
from urllib import error, request

logger = logging.getLogger("jarvis.providers")


class ProviderMode(str, Enum):
    LOCAL = "local"  # Ollama local
    REMOTE = "remote"  # ProLiant / VPS Ollama
    CLOUD = "cloud"  # OpenRouter / OpenAI / Claude
    SYSTEM = "system"  # Aucun LLM — fonctions programmées


def _ollama_base() -> str | None:
    raw = (
        os.environ.get("JARVIS_REMOTE_LLM_URL")
        or os.environ.get("OLLAMA_HOST")
        or os.environ.get("JARVIS_OLLAMA_URL")
        or ""
    ).strip().rstrip("/")
    if not raw:
        return None
    if not raw.startswith("http"):
        raw = f"http://{raw}"
    return raw


class AIProviderManager:
    def __init__(self) -> None:
        self._mode = self._detect()

    def _detect(self) -> ProviderMode:
        if os.environ.get("JARVIS_FORCE_SYSTEM") == "1":
            return ProviderMode.SYSTEM
        # Priorité doc : Ollama distant (ProLiant/VPS) > Ollama local > cloud
        if os.environ.get("JARVIS_REMOTE_LLM_URL"):
            return ProviderMode.REMOTE
        if os.environ.get("OLLAMA_HOST") or os.environ.get("JARVIS_OLLAMA_URL"):
            return ProviderMode.LOCAL
        if (
            os.environ.get("OPENROUTER_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get("ANTHROPIC_API_KEY")
        ):
            return ProviderMode.CLOUD
        return ProviderMode.SYSTEM

    def current_mode(self) -> str:
        return self._mode.value

    async def complete(self, prompt: str) -> str:
        if self._mode == ProviderMode.SYSTEM:
            return (
                "Mode système : aucun moteur IA disponible. "
                "Les fonctions locales restent actives. "
                f"(Reçu : « {prompt[-80:]} »)"
            )

        # Ollama (local ou remote) d’abord si mode LOCAL/REMOTE
        if self._mode in (ProviderMode.LOCAL, ProviderMode.REMOTE):
            try:
                return await self._ollama_complete(prompt)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Ollama échec (%s) — fallback OpenRouter si dispo : %s", self._mode.value, exc)
                if os.environ.get("OPENROUTER_API_KEY"):
                    try:
                        return await self._openrouter_complete(prompt)
                    except Exception as exc2:  # noqa: BLE001
                        return f"Erreur Ollama puis OpenRouter : {exc2}"
                return f"Erreur Ollama : {exc}"

        if self._mode == ProviderMode.CLOUD and os.environ.get("OPENROUTER_API_KEY"):
            try:
                return await self._openrouter_complete(prompt)
            except Exception as exc:  # noqa: BLE001
                logger.warning("OpenRouter échec : %s", exc)
                return f"Erreur OpenRouter : {exc}"

        return (
            f"[{self._mode.value}] Clé API présente mais provider non câblé "
            "(OpenRouter recommandé pour le 1er test)."
        )

    async def _openrouter_complete(self, prompt: str) -> str:
        """Appel OpenAI-compatible OpenRouter + log usage_events."""
        import asyncio

        from .usage import record_event

        api_key = os.environ["OPENROUTER_API_KEY"]
        model = os.environ.get("JARVIS_OPENROUTER_MODEL", "qwen/qwen3.5-flash-02-23")
        base = os.environ.get("JARVIS_OPENROUTER_BASE", "https://openrouter.ai/api/v1").rstrip("/")
        system = os.environ.get(
            "JARVIS_SYSTEM_PROMPT",
            "Tu es JARVIS, assistant IA français. Réponds brièvement, calmement, "
            "avec élégance et précision. Pas de markdown lourd.",
        )

        def _call() -> tuple[str, dict]:
            body = json.dumps(
                {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.6,
                    "max_tokens": 400,
                }
            ).encode("utf-8")
            req = request.Request(
                f"{base}/chat/completions",
                data=body,
                method="POST",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://jarvis-os.local",
                    "X-Title": "JARVIS OS Core",
                },
            )
            with request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = str(data["choices"][0]["message"]["content"]).strip()
            return text, data

        try:
            text, data = await asyncio.to_thread(_call)
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc

        usage = data.get("usage") if isinstance(data, dict) else None
        tin = int((usage or {}).get("prompt_tokens") or 0)
        tout = int((usage or {}).get("completion_tokens") or 0)
        # OpenRouter may expose native cost in usage
        cost = 0.0
        if isinstance(usage, dict):
            for k in ("cost", "total_cost", "native_tokens_prompt"):
                if k == "cost" or k == "total_cost":
                    try:
                        cost = float(usage.get(k) or 0)
                        break
                    except (TypeError, ValueError):
                        pass
        record_event(
            provider="openrouter",
            model=str(data.get("model") or model),
            tokens_in=tin,
            tokens_out=tout,
            cost_usd=cost,
            meta={"id": data.get("id")},
        )
        return text

    async def _ollama_complete(self, prompt: str) -> str:
        """Chat Ollama (/api/chat) + log tokens estimés."""
        import asyncio

        from .usage import record_event

        base = _ollama_base()
        if not base:
            raise RuntimeError("URL Ollama absente")
        model = os.environ.get("JARVIS_OLLAMA_MODEL", "qwen2.5:7b")
        system = os.environ.get(
            "JARVIS_SYSTEM_PROMPT",
            "Tu es JARVIS, assistant IA français. Réponds brièvement.",
        )

        def _call() -> dict:
            body = json.dumps(
                {
                    "model": model,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                }
            ).encode("utf-8")
            req = request.Request(
                f"{base}/api/chat",
                data=body,
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            with request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))

        data = await asyncio.to_thread(_call)
        msg = data.get("message") or {}
        text = str(msg.get("content") or "").strip()
        # Ollama eval counts
        tin = int(data.get("prompt_eval_count") or max(1, len(prompt) // 4))
        tout = int(data.get("eval_count") or max(1, len(text) // 4))
        provider = "ollama_remote" if self._mode == ProviderMode.REMOTE else "ollama_local"
        record_event(
            provider=provider,
            model=str(data.get("model") or model),
            tokens_in=tin,
            tokens_out=tout,
            cost_usd=0.0,
            meta={"host": base},
        )
        return text or "(réponse Ollama vide)"
