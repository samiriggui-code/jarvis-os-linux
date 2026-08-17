"""AI Provider Manager — bascule local → distant → cloud (OpenRouter) → mode système."""

from __future__ import annotations

import json
import logging
import os
import re
from enum import Enum
from typing import Any
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


# Sous-ensemble volontairement restreint du catalogue UI (58 composants au
# total, cf. ui_catalog.json) — 14 retenus pour le chat libre, triés à la
# main le 2026-08-17. Les 44 autres sont EXCLUS DÉLIBÉRÉMENT, pas oubliés :
# tout ce qui représente un état système réel (SystemMonitor, DeviceGrid,
# ProcessList, Terminal, HealthOverview, ToolCall, ToolResult, ExecutionStatus,
# VerificationCard…) ou déclenche une vraie action (ApprovalCard, DialogCard,
# ActionRequest) reste réservé aux chemins Core qui lisent/écrivent l'état
# réel — jamais à un LLM qui pourrait l'halluciner de façon plausible (cf.
# l'incident ImageViewer/Unsplash du même jour : une consigne « n'invente
# jamais » n'a pas suffi, Claude a rendu une URL plausible mais fausse).
# Étendre cette table pour ajouter un composant validé sûr ; le reste du
# mécanisme (prompt, parsing, repli) n'a pas besoin de changer.
#
# ⚠ `required_props` doit lister EXACTEMENT les clés de `required` dans
# ui_catalog.json — un champ manquant fait refuser tout le document par
# `surfaces/admission.py` (`additionalProperties: false` en prime : pas de
# clé en trop non plus). Vérifié le 2026-08-17 contre le catalogue généré
# (`_smoke_structured_reply.py` revérifie cette égalité à chaque run — toute
# dérive du schéma HUD casse le smoke, pas la prod).
STRUCTURED_COMPONENTS: dict[str, dict[str, Any]] = {
    "ResultPanel": {
        "when": "réponse textuelle simple, résumé, réponse à une question",
        "required_props": {
            "title": "str",
            "body": "str (texte principal)",
            "source": 'str courte, ex. "chat"',
            "items": "liste de str (puces optionnelles — [] si aucune, jamais absent)",
        },
    },
    "DataTable": {
        "when": "comparaison, liste structurée (colonnes/lignes) — ex. tableau de prix, de caractéristiques",
        "required_props": {
            "title": "str",
            "columns": "liste de str (en-têtes)",
            "rows": "liste de listes de str (une liste par ligne, même ordre que columns)",
        },
    },
    "ImageViewer": {
        "when": "une seule image à montrer, avec une URL d'image réelle et connue",
        "required_props": {
            "src": "str (URL image, jamais inventée)",
            "alt": "str",
            "caption": "str",
        },
    },
    "ChartCard": {
        "when": "série numérique à visualiser (évolution, comparaison de valeurs)",
        "required_props": {
            "type": '"line"|"area"|"bar"|"donut"',
            "data": 'liste de {"x": str|nombre, "y": nombre} — jamais vide',
            "tone": '"cyan"|"violet"|"amber"|"green"',
        },
    },
    "StatCard": {
        "when": "un seul indicateur chiffré à mettre en avant — un prix, une quantité, une durée",
        "required_props": {
            "label": "str (nom court de l'indicateur)",
            "value": "str|nombre",
            "unit": 'str (unité, "" si aucune)',
            "tone": '"cyan"|"violet"|"amber"|"green"',
            "hint": 'str (précision courte, "" si aucune)',
        },
    },
    "InfoCard": {
        "when": "explication courte d'un état ou d'un fait, plus léger que ResultPanel (pas de source/items)",
        "required_props": {"title": "str", "body": "str"},
    },
    "KeyValueList": {
        "when": "fiche de caractéristiques — paires clé/valeur (specs d'un produit, comparaison de config)",
        "required_props": {
            "title": "str",
            "rows": 'liste d\'objets {"clé": "valeur"} — une paire par objet, valeurs en texte',
        },
    },
    "TimelineChart": {
        "when": "succession d'événements ou de dates à montrer sur une frise chronologique",
        "required_props": {
            "items": (
                'liste de {"id": str, "label": str, "timestamp": str, '
                '"tone": "accent"|"success"|"warning"|"danger"|"neutral"} — '
                "TOUS ces champs sur chaque élément"
            ),
        },
    },
    "DataList": {
        "when": "liste simple d'éléments (options, capacités, inventaire) — pas assez structuré pour un tableau",
        "required_props": {
            "items": 'liste de {"label": str} minimum par élément (peut ajouter "value"/"status"/"icon")',
        },
    },
    "TreeView": {
        "when": "structure hiérarchique — arborescence, catégories imbriquées",
        "required_props": {
            "nodes": 'liste de {"id": str, "label": str} (peut ajouter "children": [...même forme, récursif])',
        },
    },
    "CodeBlock": {
        "when": "extrait de code à montrer (peut ajouter \"language\", ex. \"python\")",
        "required_props": {"code": "str"},
    },
    "MarkdownBlock": {
        "when": "texte long avec mise en forme (titres #, gras **, listes -) — jamais de tableau markdown, non rendu",
        "required_props": {"source": "str"},
    },
    "QuoteBlock": {
        "when": "citation à mettre en exergue (peut ajouter \"cite\" pour la source)",
        "required_props": {"text": "str"},
    },
    "TextBlock": {
        "when": "paragraphe de texte simple, sans les champs source/items de ResultPanel (peut ajouter \"title\")",
        "required_props": {"text": "str"},
    },
}

_STRUCTURED_INSTRUCTIONS = (
    "\n\nRéponds STRICTEMENT en JSON, sans texte autour, sans balise markdown ```. "
    "Schéma exact :\n"
    '{"speech": "texte court à dire à voix haute, 2 à 4 phrases, faits concrets", '
    '"component": "un des noms ci-dessous", "props": { ... TOUTES les clés listées, aucune de plus }}\n\n'
    "Composants disponibles :\n"
    + "\n".join(
        f"- {name} — {meta['when']} — props obligatoires (toutes, rien d'autre) : {meta['required_props']}"
        for name, meta in STRUCTURED_COMPONENTS.items()
    )
    + "\n\nChoisis TOUJOURS ResultPanel si aucun autre ne correspond clairement. "
    "N'invente jamais une URL d'image ou une donnée chiffrée que tu ne connais pas "
    "vraiment — dans ce cas, reste sur ResultPanel avec une réponse textuelle honnête.\n\n"
    "Quand une suite logique et concrète existe (approfondir, comparer, élargir la "
    "recherche à autre chose), tu peux la proposer en une courte phrase à la fin de "
    "``speech`` — jamais systématique, seulement quand c'est vraiment utile. Ne "
    "propose rien pour une réponse déjà complète (heure, calcul, fait ponctuel)."
)


async def verify_image_url(url: str, *, timeout: float = 4.0) -> bool:
    """HEAD réel — jamais confiance dans une URL générée par le LLM.

    Observé 2026-08-17 : demande de « photo de la tour Eiffel » sans outil de
    recherche d'images branché → Claude a rendu une URL Unsplash plausible
    mais inventée, malgré la consigne explicite de ne jamais le faire. La
    consigne seule ne suffit pas — c'est Core qui vérifie, pas le modèle qui
    promet. Retombe sur False au moindre doute (timeout, non-image, erreur).
    """
    import asyncio

    if not url or not url.startswith(("http://", "https://")):
        return False

    def _check() -> bool:
        # Sans User-Agent réaliste, beaucoup de CDN (Wikipedia compris —
        # observé 2026-08-17 : 403 sur une vraie image faute d'UA) refusent
        # la requête et donneraient un faux négatif — pire qu'utile ici,
        # puisque ça rejetterait de vraies images valides.
        headers = {"User-Agent": "Mozilla/5.0 (compatible; JarvisCore/1.0)"}
        try:
            req = request.Request(url, method="HEAD", headers=headers)
            with request.urlopen(req, timeout=timeout) as resp:
                status = getattr(resp, "status", 200)
                ctype = resp.headers.get("Content-Type", "")
                return status < 400 and ctype.lower().startswith("image/")
        except Exception:  # noqa: BLE001
            return False

    return await asyncio.to_thread(_check)


def _parse_structured_reply(raw: str) -> dict[str, Any]:
    """Parse tolérant : accepte les clôtures ```json, retombe sur ResultPanel sinon.

    Ne lève jamais — un JSON mal formé ne doit pas priver l'utilisateur d'une
    réponse (cf. philosophie ``strip_reasoning`` : une réponse maladroite vaut
    mieux qu'un silence que rien n'explique).
    """
    text = (raw or "").strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.S)
    if fence:
        text = fence.group(1).strip()

    speech = ""
    try:
        data = json.loads(text)
        speech = str(data.get("speech") or "").strip()
        component = str(data.get("component") or "").strip()
        props = data.get("props")
        if speech and component in STRUCTURED_COMPONENTS and isinstance(props, dict):
            return {"speech": speech, "component": component, "props": props}
        logger.warning(
            "réponse structurée invalide (component=%r) — repli ResultPanel", component
        )
    except (json.JSONDecodeError, AttributeError, TypeError) as exc:
        logger.warning("réponse structurée non-JSON (%s) — repli ResultPanel", exc)

    # Repli : si le JSON était partiellement exploitable (speech présent, mais
    # composant/props invalides), on garde CE texte plutôt que le JSON brut —
    # jamais de "brace speech colon..." lu à voix haute. Sinon, le texte brut
    # entier sert de réponse. Jamais de composant halluciné, jamais de silence.
    fallback_text = speech or raw.strip() or "(réponse vide)"
    return {
        "speech": fallback_text,
        "component": "ResultPanel",
        "props": {"title": "Jarvis", "body": fallback_text, "source": "chat", "items": []},
    }


class ProviderMode(str, Enum):
    CLOUD = "cloud"  # OpenRouter (primaire) + Anthropic direct (secours)
    SYSTEM = "system"  # Aucun LLM — fonctions programmées


class AIProviderManager:
    def __init__(self) -> None:
        self._mode = self._detect()

    def _detect(self) -> ProviderMode:
        if os.environ.get("JARVIS_FORCE_SYSTEM") == "1":
            return ProviderMode.SYSTEM
        if os.environ.get("OPENROUTER_API_KEY") or os.environ.get("ANTHROPIC_API_KEY"):
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
        system_suffix: str | None = None,
        max_tokens: int = 400,
    ) -> str:
        """Complétion LLM.

        ``call_mode`` / ``personality`` : voir ``jarvis_core.personality``.
        COMPOSER et STRUCTURED ignorent la personnalité narrative.
        ``system_suffix`` : ajouté tel quel après le message système construit
        (utilisé par ``complete_structured`` — pas d'autre usage prévu).
        ``max_tokens`` : 400 convient à une phrase courte, pas à un JSON
        structuré avec un tableau/code riche — observé 2026-08-17 :
        `KeyValueList` tronqué en plein milieu, JSON invalide, texte brut
        tronqué lu à voix haute. ``complete_structured`` demande plus.
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
        if system_suffix:
            system = f"{system}{system_suffix}"

        if self._mode == ProviderMode.SYSTEM:
            return (
                "Mode système : aucun moteur IA disponible. "
                "Les fonctions locales restent actives. "
                f"(Reçu : « {prompt[-80:]} »)"
            )

        if self._mode == ProviderMode.CLOUD:
            if os.environ.get("OPENROUTER_API_KEY"):
                try:
                    return await self._openrouter_complete(prompt, system=system, max_tokens=max_tokens)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("OpenRouter échec : %s — repli Anthropic si dispo", exc)
                    if os.environ.get("ANTHROPIC_API_KEY"):
                        try:
                            return await self._anthropic_complete(prompt, system=system, max_tokens=max_tokens)
                        except Exception as exc_anthropic:  # noqa: BLE001
                            return f"Erreur OpenRouter puis Anthropic : {exc_anthropic}"
                    return f"Erreur OpenRouter : {exc}"
            if os.environ.get("ANTHROPIC_API_KEY"):
                try:
                    return await self._anthropic_complete(prompt, system=system, max_tokens=max_tokens)
                except Exception as exc:  # noqa: BLE001
                    return f"Erreur Anthropic : {exc}"

        return (
            f"[{self._mode.value}] Clé API présente mais provider non câblé "
            "(OpenRouter ou Anthropic requis)."
        )

    async def complete_structured(
        self,
        prompt: str,
        *,
        call_mode: Any = None,
        personality: Any = None,
    ) -> dict[str, Any]:
        """Réponse structurée : ``{"speech": str, "component": str, "props": dict}``.

        Le LLM choisit un composant parmi ``STRUCTURED_COMPONENTS`` et remplit
        ses props. Ne lève jamais : un JSON invalide ou un composant halluciné
        retombe sur ``ResultPanel`` avec le texte brut — voir
        ``_parse_structured_reply``. C'est Core, pas le LLM, qui reste seul
        responsable de la carte réellement diffusée (``surfaces/admission.py``
        refuse tout composant absent du catalogue HUD).
        """
        raw = await self.complete(
            prompt,
            call_mode=call_mode,
            personality=personality,
            system_suffix=_STRUCTURED_INSTRUCTIONS,
            max_tokens=1200,
        )
        return _parse_structured_reply(raw)

    async def _openrouter_complete(
        self, prompt: str, *, system: str | None = None, max_tokens: int = 400,
    ) -> str:
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
                    "max_tokens": max_tokens,
                    # ⚠ Qwen3.5 est un modèle à RAISONNEMENT. Laissé libre, il
                    # dépense la totalité de son budget à narrer sa démarche
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

    async def _anthropic_complete(
        self, prompt: str, *, system: str | None = None, max_tokens: int = 400,
    ) -> str:
        """Repli direct API Anthropic (`api.anthropic.com`) — sans OpenRouter entre les deux.

        Utilisé uniquement si OpenRouter échoue : ce n'est pas le chemin
        nominal, donc pas de log usage séparé (le repli est rare par design).
        """
        import asyncio

        from .usage import record_event

        api_key = os.environ["ANTHROPIC_API_KEY"]
        model = os.environ.get("JARVIS_ANTHROPIC_MODEL", "claude-sonnet-5")
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
                    "max_tokens": max_tokens,
                    "system": system,
                    "messages": [{"role": "user", "content": prompt}],
                }
            ).encode("utf-8")
            req = request.Request(
                "https://api.anthropic.com/v1/messages",
                data=body,
                method="POST",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
            )
            with request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            blocks = data.get("content") or []
            text = "".join(
                str(b.get("text") or "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"
            ).strip()
            return strip_reasoning(text) if text else "(réponse Anthropic vide)", data

        try:
            text, data = await asyncio.to_thread(_call)
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc

        usage = data.get("usage") if isinstance(data, dict) else None
        tin = int((usage or {}).get("input_tokens") or 0)
        tout = int((usage or {}).get("output_tokens") or 0)
        record_event(
            provider="anthropic",
            model=str(data.get("model") or model),
            tokens_in=tin,
            tokens_out=tout,
            cost_usd=0.0,
            meta={"id": data.get("id")},
        )
        logger.info(
            "Anthropic (repli direct) · %s · in=%d out=%d · « %s »",
            data.get("model") or model,
            tin,
            tout,
            text[:80].replace("\n", " "),
        )
        return text
