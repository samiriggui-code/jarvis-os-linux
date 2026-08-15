"""AI Provider Manager — bascule local → distant → cloud (OpenRouter) → mode système."""

from __future__ import annotations

import json
import logging
import os
import re
from enum import Enum
from urllib import error, request

logger = logging.getLogger("jarvis.providers")


_THINK_TAGS = re.compile(r"<think>.*?</think>|<thinking>.*?</thinking>", re.S | re.I)

# Préambules de raisonnement qu'un modèle écrit EN CLAIR, sans balise. Observé
# le 2026-08-04 : à « quelle heure est-il », le modèle a renvoyé tout son
# « Thinking Process » et jamais l'heure.
_THINK_LEAD = re.compile(
    r"^\s*(?:thinking\s+process|thought\s+process|reasoning|analysis|réflexion|raisonnement)\s*:?.*?"
    r"(?:\n\s*\n|\Z)",
    re.S | re.I,
)

# Le modèle numérote parfois sa démarche sans aucun mot-clé d'en-tête :
#   « 1. **Analyze the Request:** … 4. **Checking Constraints:** … »
# Ces intitulés-là sont la signature d'un raisonnement, jamais d'une réponse
# adressée à l'utilisateur.
_THINK_STEPS = re.compile(
    r"\d\.\s*\*{0,2}(?:Analyze|Determine|Drafting|Draft|Refin\w+|Check\w+|Select\w+|Consider\w+|"
    r"Evaluate|Plan|Review)\b[^\n]*",
    re.I,
)


def strip_reasoning(text: str) -> str:
    """Retire la réflexion du modèle pour ne garder que la réponse.

    Deuxième ligne de défense : l'invite système demande déjà de ne pas
    raconter sa démarche, mais un modèle à raisonnement le fait quand même
    régulièrement. Ce que l'utilisateur entend doit être la RÉPONSE, pas le
    cheminement.

    ⚠ On ne renvoie jamais une chaîne vide : si le filtre a tout mangé — parce
    que le modèle n'a produit QUE du raisonnement — on rend le texte d'origine.
    Une réponse maladroite vaut mieux qu'un silence que rien n'explique.
    """
    cleaned = _THINK_TAGS.sub("", text)
    cleaned = _THINK_LEAD.sub("", cleaned)
    cleaned = _THINK_STEPS.sub("", cleaned)
    # Les puces de délibération qui restent (« * **Persona:** … »).
    cleaned = re.sub(r"^\s*[*\-]\s*\*{0,2}(?:Persona|Tone|Constraint|Format|Context|"
                     r"User Input|Role|Option \d|Selection|Draft)\b[^\n]*$",
                     "", cleaned, flags=re.I | re.M)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned or text.strip()


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
        # Chat libre : OpenRouter (Qwen flash) EN PREMIER — Ollama VPS trop lent /
        # peu fiable pour les réponses courtes. Forcer Ollama : JARVIS_OLLAMA_FIRST=1.
        if (
            os.environ.get("OPENROUTER_API_KEY")
            and os.environ.get("JARVIS_OLLAMA_FIRST") != "1"
        ):
            return ProviderMode.CLOUD
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

    async def complete(
        self,
        prompt: str,
        *,
        call_mode: Any = None,
        personality: Any = None,
    ) -> str:
        """Complétion LLM.

        ``call_mode`` / ``personality`` : voir ``jarvis_core.personality``.
        COMPOSER et STRUCTURED ignorent la personnalité narrative.
        """
        from .personality import LLMCallMode, PersonalityRequest, resolve_personality
        from .personality.resolver import build_system_message

        mode = call_mode if call_mode is not None else LLMCallMode.NARRATIVE
        if personality is None:
            personality = resolve_personality(PersonalityRequest(context=mode))

        env_prompt = (
            os.environ.get("JARVIS_OPERATOR_PROMPT")
            or os.environ.get("JARVIS_SYSTEM_PROMPT")
        )
        system = build_system_message(
            personality,
            operator_instructions=env_prompt,
        )

        if self._mode == ProviderMode.SYSTEM:
            return (
                "Mode système : aucun moteur IA disponible. "
                "Les fonctions locales restent actives. "
                f"(Reçu : « {prompt[-80:]} »)"
            )

        if self._mode == ProviderMode.CLOUD and os.environ.get("OPENROUTER_API_KEY"):
            try:
                return await self._openrouter_complete(prompt, system=system)
            except Exception as exc:  # noqa: BLE001
                logger.warning("OpenRouter échec : %s — repli Ollama si dispo", exc)
                if _ollama_base():
                    try:
                        return await self._ollama_complete(prompt, system=system)
                    except Exception as exc2:  # noqa: BLE001
                        return f"Erreur OpenRouter puis Ollama : {exc2}"
                return f"Erreur OpenRouter : {exc}"

        # Ollama (local ou remote)
        if self._mode in (ProviderMode.LOCAL, ProviderMode.REMOTE):
            try:
                return await self._ollama_complete(prompt, system=system)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Ollama échec (%s) — fallback OpenRouter si dispo : %s", self._mode.value, exc)
                if os.environ.get("OPENROUTER_API_KEY"):
                    try:
                        return await self._openrouter_complete(prompt, system=system)
                    except Exception as exc2:  # noqa: BLE001
                        return f"Erreur Ollama puis OpenRouter : {exc2}"
                return f"Erreur Ollama : {exc}"

        return (
            f"[{self._mode.value}] Clé API présente mais provider non câblé "
            "(OpenRouter recommandé pour le 1er test)."
        )

    async def _openrouter_complete(self, prompt: str, *, system: str | None = None) -> str:
        """Appel OpenAI-compatible OpenRouter + log usage_events."""
        import asyncio

        from .usage import record_event

        api_key = os.environ["OPENROUTER_API_KEY"]
        model = os.environ.get("JARVIS_OPENROUTER_MODEL", "qwen/qwen3.5-flash-02-23")
        base = os.environ.get("JARVIS_OPENROUTER_BASE", "https://openrouter.ai/api/v1").rstrip("/")
        if system is None:
            from .personality import LLMCallMode, PersonalityRequest, resolve_personality
            from .personality.resolver import build_system_message

            personality = resolve_personality(PersonalityRequest(context=LLMCallMode.NARRATIVE))
            operator = (
                os.environ.get("JARVIS_OPERATOR_PROMPT")
                or os.environ.get("JARVIS_SYSTEM_PROMPT")
            )
            system = build_system_message(personality, operator_instructions=operator)

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
                    # ⚠ Qwen3.5 est un modèle à RAISONNEMENT. Laissé libre, il
                    # dépense la totalité des 400 jetons à narrer sa démarche
                    # (« Analyze the Request », « Determine the Action »,
                    # « Drafting the Response ») et la réponse est tronquée
                    # avant d'exister. Observé le 2026-08-04 : à « quelle heure
                    # est-il », zéro heure donnée, 400 jetons de réflexion.
                    #
                    # Ce champ est la commande OFFICIELLE d'OpenRouter pour
                    # l'éteindre. Un filtre de sortie ne suffisait pas : on ne
                    # peut pas extraire une réponse qui n'a jamais été écrite.
                    "reasoning": {"enabled": False},
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
            text = strip_reasoning(str(data["choices"][0]["message"]["content"]))
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
        logger.info(
            "OpenRouter · %s · in=%d out=%d · « %s »",
            data.get("model") or model,
            tin,
            tout,
            text[:80].replace("\n", " "),
        )
        return text

    async def _ollama_complete(self, prompt: str, *, system: str | None = None) -> str:
        """Chat Ollama (/api/chat) + log tokens estimés."""
        import asyncio

        from .usage import record_event

        base = _ollama_base()
        if not base:
            raise RuntimeError("URL Ollama absente")
        model = os.environ.get("JARVIS_OLLAMA_MODEL", "qwen2.5:7b")
        if system is None:
            from .personality import LLMCallMode, PersonalityRequest, resolve_personality
            from .personality.resolver import build_system_message

            personality = resolve_personality(PersonalityRequest(context=LLMCallMode.NARRATIVE))
            operator = (
                os.environ.get("JARVIS_OPERATOR_PROMPT")
                or os.environ.get("JARVIS_SYSTEM_PROMPT")
            )
            system = build_system_message(personality, operator_instructions=operator)

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
        text = strip_reasoning(str(msg.get("content") or ""))
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
