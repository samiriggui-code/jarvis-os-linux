"""P3 — composition d'une surface par un LLM, puis admission par le Core.

`docs/architecture/JARVIS-Agentic-UI.md` §6. Le contrat sépare trois rôles et
ce module n'en tient qu'un :

  * **Planner sémantique** (ici) — quoi montrer, quelles données demander.
  * **Planner d'admission** (`surface.py`) — existence, schéma, Policy, liaisons,
    budget. Il ne fait aucune confiance à ce qui suit.
  * **Composer / Renderer** (HUD) — où poser, dans quel ordre.

⚠ Le contrat écrit « **Hermes** compose ». Aujourd'hui le Core ne demande rien à
Hermes : il le sonde (`/health`) et rien d'autre, et sa seule voie vers un LLM
est l'AI Provider Manager — que `CLAUDE.md` impose par ailleurs comme passage
unique. Ce module appelle donc `providers.complete()`. Le jour où Hermes expose
une complétion, c'est le Provider Manager qui y route : ce fichier ne bouge pas.
La séparation des rôles du §6.1 est respectée dans les deux cas, parce qu'elle
porte sur **qui admet**, pas sur qui propose.

Trois garde-fous, tous nés du même constat — une proposition vient d'un LLM :

1. **Le catalogue injecté est filtré par les permissions de la session.** Un
   composant que l'utilisateur n'a pas le droit de voir n'est même pas proposé.
   L'admission le refuserait de toute façon ; lui cacher évite surtout de lui
   apprendre l'existence de ce qu'il ne peut pas avoir.
2. **Confiance déclarée, et plancher.** Repris de
   `vendor/second-brain-research-dashboard-main/agent/layout_selector.py`, dont
   le `LayoutDecision` porte `confidence`, `reasoning` et `alternative_layouts`.
   Sous le plancher, on refuse : mieux vaut pas de surface qu'une surface au
   hasard.
3. **Un refus est bruyant.** C'est le critère de sortie P3 lui-même — « une
   proposition invalide est **rejetée et visible** ».
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from .surface import SurfaceCatalog, SurfaceRejected

logger = logging.getLogger("jarvis.composer")

# Sous ce seuil, la proposition est refusée. Un LLM qui annonce lui-même qu'il
# n'est pas sûr a déjà donné la réponse : ne rien afficher.
MIN_CONFIDENCE = 0.45

# Taille maximale d'une réponse acceptée. Une composition est un petit document ;
# au-delà, c'est du bavardage ou une tentative de saturer l'admission.
MAX_RESPONSE_CHARS = 20_000


class CompositionRejected(SurfaceRejected):
    """Proposition inexploitable AVANT même l'admission (illisible, vide, peu sûre)."""


def _catalog_for_prompt(catalog: SurfaceCatalog, permissions: set[str] | None) -> list[dict[str, Any]]:
    """Ce que l'agent a le droit de connaître — pas tout le catalogue.

    On retire `props` : leur JSON Schema est verbeux et l'agent n'a pas à
    fabriquer des valeurs, il demande des liaisons. On garde ce sur quoi il
    choisit : la description, les tags, la région et la taille préférées.
    """
    out: list[dict[str, Any]] = []
    for name in catalog.names:
        definition = catalog.get(name) or {}
        required = set(definition.get("permissions") or [])
        if permissions is not None and not required <= permissions:
            continue
        out.append(
            {
                "name": name,
                "description": definition.get("description", ""),
                "category": definition.get("category"),
                "states": list(definition.get("states") or []),
                "preferredRegion": definition.get("preferredRegion"),
                "preferredSize": definition.get("preferredSize"),
                "tags": list(definition.get("tags") or []),
            }
        )
    return out


def build_prompt(
    question: str,
    catalog: SurfaceCatalog,
    *,
    permissions: set[str] | None = None,
    binding_sources: list[dict[str, str]] | None = None,
) -> str:
    """Prompt de composition. Le catalogue y est injecté, filtré et complet.

    « Complet » compte autant que « filtré » : si l'agent doit deviner ce qui
    existe, il inventera. La liste exhaustive est ce qui rend le refus
    d'invention légitime.
    """
    components = _catalog_for_prompt(catalog, permissions)
    sources = binding_sources or []

    return f"""Tu composes une INTERFACE en répondant à une question. Tu ne rédiges pas de texte.

Question de l'utilisateur :
{question}

Composants disponibles — tu ne peux utiliser QUE ceux-là, jamais un autre nom :
{json.dumps(components, ensure_ascii=False, indent=1)}

Sources de données disponibles pour les liaisons, avec le type qu'elles rendent.
Une liaison doit atterrir dans une prop du MÊME type, sinon elle est refusée :
{json.dumps(sources, ensure_ascii=False)}

Règles absolues :
- Tu n'écris JAMAIS de code, de HTML ni de JSX. Tu nommes des composants existants.
- Tu ne remplis JAMAIS une donnée toi-même. Si tu veux afficher une donnée, tu
  demandes une liaison : {{"$bind": "system.cpu"}}. C'est le Core qui la sert.
- `region` ∈ top, left, center, right, bottom, overlay, backdrop.
- `size` ∈ compact, normal, wide, fill.
- Un seul composant en `overlay`, et seulement s'il est vraiment bloquant.
- Maximum 6 composants. Une surface répond à une question, ce n'est pas un tableau de bord.
- Si la question ne correspond à aucun composant, réponds avec une confiance basse
  et une surface vide plutôt que d'inventer.

Réponds UNIQUEMENT par un objet JSON de cette forme, sans texte autour :
{{
  "confidence": 0.0 à 1.0,
  "reasoning": "pourquoi ces composants, en une phrase",
  "alternatives": ["noms de composants envisagés puis écartés"],
  "document": {{
    "surfaces": {{
      "main": {{
        "root": ["c1"],
        "components": {{
          "c1": {{"name": "SystemMonitor", "state": "idle", "region": "left", "size": "normal"}}
        }}
      }}
    }}
  }}
}}"""


def _rekey(document: Any, surface_id: str) -> dict[str, Any]:
    """Force la clé de surface — le modèle ne choisit pas où il s'affiche.

    Le gabarit du prompt montre `"surfaces": {"main": …}`, et le HUD cherche
    `document.surfaces[<id de l'app>]`. Une composition atterrissait donc sous
    une clé que personne ne regardait : admise, diffusée, invisible. Le pire des
    échecs — silencieux et à l'air correct.

    Corriger le gabarit n'aurait pas suffi : la clé serait restée un champ
    rempli par le modèle, donc un endroit où il peut se tromper ou écraser la
    surface d'une AUTRE fenêtre. On la lui retire.

    Une composition répond à UNE question et occupe UNE fenêtre. Plusieurs
    surfaces dans une même réponse ne se recollent pas — on refuse.
    """
    if not isinstance(document, dict):
        raise CompositionRejected("`document` absent ou illisible")

    surfaces = document.get("surfaces")
    if not isinstance(surfaces, dict) or not surfaces:
        raise CompositionRejected("aucune surface dans la proposition")
    if len(surfaces) > 1:
        raise CompositionRejected(
            f"{len(surfaces)} surfaces proposées — une composition répond à une seule question"
        )

    (composed,) = surfaces.values()
    return {**document, "surfaces": {surface_id: composed}}


def parse_proposal(raw: Any) -> dict[str, Any]:
    """Extrait la proposition JSON d'une réponse de LLM.

    Tolérant sur la forme, strict sur le fond. Un LLM encadre volontiers son
    JSON de ```json, le fait précéder de « Voici la composition : », ou ajoute
    une explication après. Refuser pour ça transformerait un défaut de style en
    panne. En revanche tout ce qui suit — champs, valeurs, noms — est vérifié.
    """
    if not isinstance(raw, str) or not raw.strip():
        raise CompositionRejected("réponse vide du modèle")
    if len(raw) > MAX_RESPONSE_CHARS:
        raise CompositionRejected(
            f"réponse de {len(raw)} caractères, maximum {MAX_RESPONSE_CHARS}"
        )

    text = raw.strip()

    # Bloc clôturé ```json … ``` s'il y en a un.
    fenced = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Dernier recours : le plus grand objet accolade-à-accolade.
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise CompositionRejected(
                f"aucun JSON dans la réponse — reçu : {raw[:120]!r}"
            ) from None
        try:
            parsed = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise CompositionRejected(f"JSON illisible : {exc}") from exc

    if not isinstance(parsed, dict):
        raise CompositionRejected("la proposition doit être un objet JSON")

    document = parsed.get("document")
    if not isinstance(document, dict):
        raise CompositionRejected("proposition sans champ `document`")

    confidence = parsed.get("confidence")
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
        raise CompositionRejected("proposition sans `confidence` numérique")
    if not 0.0 <= float(confidence) <= 1.0:
        raise CompositionRejected(f"`confidence` hors de [0,1] : {confidence}")

    return {
        "confidence": float(confidence),
        "reasoning": str(parsed.get("reasoning") or ""),
        "alternatives": [str(a) for a in (parsed.get("alternatives") or []) if isinstance(a, str)],
        "document": document,
    }


def check_confidence(proposal: dict[str, Any], floor: float = MIN_CONFIDENCE) -> None:
    """Refuse une composition dont le modèle doute lui-même.

    Le seuil n'est pas de la prudence décorative : sans lui, une question hors
    sujet produit quand même une surface — le modèle prend le composant le moins
    éloigné et l'affiche. L'utilisateur voit alors une réponse confiante à une
    question que personne n'a comprise.
    """
    confidence = float(proposal.get("confidence", 0.0))
    if confidence < floor:
        raise CompositionRejected(
            f"confiance {confidence:.2f} sous le plancher {floor:.2f} — "
            f"rien affiché. Motif du modèle : {proposal.get('reasoning') or '(aucun)'}"
        )


class SurfaceComposer:
    """Assemble prompt → complétion → proposition. **N'admet rien lui-même.**

    L'admission reste à `validate_document`, appelée par le Core. Ce module
    pourrait tout à fait la faire ; ne pas la faire est délibéré. Le jour où
    quelqu'un ajoute une seconde source de compositions, elle passera par le
    même garde parce qu'il est ailleurs.
    """

    def __init__(self, catalog: SurfaceCatalog, providers: Any) -> None:
        self.catalog = catalog
        self.providers = providers

    async def propose(
        self,
        question: str,
        *,
        surface_id: str,
        permissions: set[str] | None = None,
        binding_sources: list[dict[str, str]] | None = None,
        floor: float = MIN_CONFIDENCE,
    ) -> dict[str, Any]:
        """Retourne `{confidence, reasoning, alternatives, document}` — non admis.

        Lève `CompositionRejected` si la réponse est illisible ou peu sûre.

        `surface_id` dit **où** la composition doit atterrir : la clé de
        `document.surfaces` est l'identifiant de la fenêtre d'app qui l'affichera.
        Le modèle ne la choisit pas — voir `_rekey`.
        """
        prompt = build_prompt(
            question, self.catalog, permissions=permissions, binding_sources=binding_sources
        )
        from .personality import LLMCallMode

        raw = await self.providers.complete(prompt, call_mode=LLMCallMode.COMPOSER)

        proposal = parse_proposal(raw)
        check_confidence(proposal, floor)
        proposal["document"] = _rekey(proposal["document"], surface_id)

        logger.info(
            "composition proposée · surface=%s · confiance=%.2f · %s",
            surface_id,
            proposal["confidence"],
            proposal["reasoning"][:120] or "(sans motif)",
        )
        return proposal
