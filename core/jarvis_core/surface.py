"""Surfaces agentiques — admission d'un document avant diffusion au HUD.

Le Core est le seul point de passage entre un agent et l'écran
(`docs/architecture/JARVIS-Agentic-UI.md` §6). Rien de ce qui suit n'est une
formalité : un document vient d'un LLM, donc d'une source qui peut se tromper,
inventer un composant ou glisser une donnée qu'on n'a pas le droit d'afficher.

Contrôles à l'admission, dans cet ordre (§7.1 du contrat) :

  1. **Existence** — le nom est-il dans `ui_catalog.json` ? Sinon rejet. Jamais
     de rendu dégradé : un composant inconnu ne s'affiche pas « en gris », il
     ne s'affiche pas.
  2. **États** — l'état demandé fait-il partie de ceux que le composant
     déclare ?
  3. **Vocabulaire de placement** — `region` et `size` appartiennent-ils aux
     ensembles fermés du protocole ?
  4. **Props** — conformes au JSON Schema que le catalogue publie (P2).
  5. **Données** — aucune liaison `$bind` non résolue ne passe (P2).
  6. **Permissions / contexte** — le composant est-il permis à CET utilisateur,
     et le matériel qu'il réclame est-il là (P2) ?
  7. **Budget d'attention** — un document ne peut pas noyer l'écran ni empiler
     les `overlay` (P2). C'est un déni de service par l'interface.

P2 ajoute par ailleurs deux choses hors admission :

  - `gravity_for()` — la gravité d'une action est **dérivée du catalogue côté
    Core**, jamais reçue du client (cf. sa docstring : c'est un contournement
    de Policy qui était ouvert) ;
  - `IntentExecutor` — le maillon « Autorisation → **Exécution** ». Sans lui,
    une intention approuvée ne faisait rien et le vert « autorisé » ne prouvait
    que l'affichage.

L'ordre est voulu : la Policy arrive avant qu'un LLM ne compose quoi que ce
soit (P3), jamais après.
"""

from __future__ import annotations

import inspect
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.surface")

PROTOCOL_VERSION = 1

CATALOG_PATH = Path(__file__).with_name("ui_catalog.json")

# Ensembles fermés du protocole — miroir de `hud/src/agentic/protocol/surface.ts`.
REGIONS = {"top", "left", "center", "right", "bottom", "overlay", "backdrop"}
SIZES = {"compact", "normal", "wide", "fill"}

# ── Budget d'attention (§7.1) ────────────────────────────────────────────────
# « Le budget d'attention est un déni de service par l'interface : rarement
# anticipé, et suffisant pour rendre une machine inutilisable sans qu'aucune
# action sensible ne soit exécutée. »
#
# Les valeurs sont volontairement basses. Une surface est une RÉPONSE à une
# question, pas un tableau de bord : si un agent en réclame quinze, c'est qu'il
# a mal compris la question — ou qu'il essaie de noyer l'écran.
MAX_COMPONENTS_PER_SURFACE = 12
MAX_COMPONENTS_TOTAL = 24
MAX_OVERLAYS = 1

# Permissions accordées selon le rôle de la session (§7.1 « Données »).
#
# ⚠ Baseline P2, à affiner avec Samir. Deux choix assumés ici :
#   - **admin reçoit tout ce que le catalogue déclare**, calculé et non listé :
#     une permission ajoutée au catalogue ne doit pas verrouiller le
#     propriétaire de la machine sans que personne ne comprenne pourquoi ;
#   - les autres rôles sont des **listes explicites**, donc fail-closed : une
#     nouvelle permission n'est accordée à personne tant qu'on ne l'a pas
#     écrite ici.
ROLE_PERMISSIONS: dict[str, set[str]] = {
    "user": {"system.read", "memory.read", "console.read", "camera.read", "web.read"},
    # Pas `memory.read` : `MemoryPanel` expose la mémoire du foyer et elle est
    # **effaçable**. Ce n'est pas une lecture anodine.
    "child": {"system.read"},
}

# Avant identification, le HUD affiche légitimement l'état de la machine
# (checklist de démarrage, écran de verrouillage). Rien d'autre.
ANONYMOUS_PERMISSIONS: set[str] = {"system.read"}


class SurfaceRejected(Exception):
    """Document refusé. Le message est destiné aux journaux ET au HUD.

    Un refus doit être bruyant : c'est le seul moyen de voir qu'un agent
    demande quelque chose qui n'existe pas, plutôt que de le découvrir par une
    interface à moitié vide.
    """


class SurfaceCatalog:
    """Catalogue chargé depuis l'artefact généré par le HUD.

    ⚠ Ce fichier n'est JAMAIS édité à la main : il est produit par
    `hud/scripts/gen-ui-catalog.mjs` depuis `definitions.ts`, seule source de
    vérité. Le HUD est le seul à savoir qu'un nom s'affiche réellement.

    Un catalogue absent n'est pas une erreur fatale : le Core démarre, mais il
    refuse alors TOUT composant. Mieux vaut un Core qui tourne sans surface
    qu'un Core qui ne démarre pas — `JARVIS BASE` doit survivre.
    """

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or CATALOG_PATH
        self._by_name: dict[str, dict[str, Any]] = {}
        self.load()

    def load(self) -> None:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            logger.warning(
                "catalogue UI absent (%s) — toute surface sera refusée. "
                "Le générer : cd hud && node scripts/gen-ui-catalog.mjs",
                self.path,
            )
            return
        except json.JSONDecodeError as exc:
            logger.error("catalogue UI illisible (%s) : %s", self.path, exc)
            return

        self._by_name = {c["name"]: c for c in raw.get("components", []) if c.get("name")}
        logger.info("catalogue UI chargé — %d composant(s)", len(self._by_name))

    def __contains__(self, name: str) -> bool:
        return name in self._by_name

    def get(self, name: str) -> dict[str, Any] | None:
        return self._by_name.get(name)

    @property
    def names(self) -> list[str]:
        return sorted(self._by_name)

    @property
    def all_permissions(self) -> set[str]:
        """Toutes les permissions que le catalogue mentionne.

        Sert à donner à l'admin l'ensemble complet sans avoir à le maintenir à
        la main : ajouter un composant au registre ne doit pas verrouiller le
        propriétaire de la machine.
        """
        out: set[str] = set()
        for definition in self._by_name.values():
            out.update(definition.get("permissions") or [])
        return out


def permissions_for(role: str | None, catalog: SurfaceCatalog) -> set[str]:
    """Permissions d'affichage accordées à un rôle de session.

    `admin` reçoit tout le catalogue ; les autres rôles sont des listes
    explicites ; personne d'identifié reçoit le strict minimum d'avant-session.

    Invariant : **s'identifier ne retire jamais un droit**. Tout rôle reçoit au
    moins ce qu'obtient un inconnu. Sans cette règle, une table mal remplie
    produit l'absurdité qu'un enfant reconnu voit moins qu'un visiteur non
    identifié — et le défaut passe inaperçu parce qu'il ne ressemble pas à une
    faille, seulement à un écran vide.

    Un rôle inconnu ne reçoit que ce plancher — fail-closed, comme `risk_of`.
    """
    if role is None:
        return set(ANONYMOUS_PERMISSIONS)
    normalized = str(role).lower()
    if normalized == "admin":
        return catalog.all_permissions | ANONYMOUS_PERMISSIONS
    return set(ROLE_PERMISSIONS.get(normalized, ())) | ANONYMOUS_PERMISSIONS


class BindingResolver:
    """Sert les liaisons de données `$bind` — **le Core lit, jamais l'agent**.

    C'est le point que le contrat appelle « le plus souvent négligé » (§6.3) :
    Hermes ne remplit jamais une prop avec une donnée, il demande une liaison et
    le Core décide s'il la sert. Sans cette inversion, une composition devient un
    canal d'exfiltration — il suffirait à l'agent de glisser une donnée protégée
    dans un titre pour l'afficher.

    Chaque source déclare la permission qu'elle exige. Une source inconnue est
    refusée, jamais servie vide : rendre `null` apprendrait à l'agent que le nom
    est valide mais la donnée absente, ce qui est déjà une fuite.
    """

    def __init__(self) -> None:
        self._sources: dict[str, tuple[str, str, Any]] = {}

    def register(self, name: str, permission: str, reader: Any, kind: str = "string") -> None:
        """`kind` est le type JSON Schema de ce que la source rend.

        Il n'est pas décoratif : il est publié à l'agent (cf. `describe`). Sans
        lui, l'agent lie une source numérique dans une prop `string`, se fait
        refuser à l'admission, et n'a aucun moyen de comprendre pourquoi — le
        catalogue lui dit le type de la prop, mais rien ne lui disait celui de
        la donnée. Défaut trouvé en écrivant `_smoke_p3`.
        """
        self._sources[name] = (permission, kind, reader)

    @property
    def names(self) -> list[str]:
        return sorted(self._sources)

    def describe(self, permissions: set[str] | None = None) -> list[dict[str, str]]:
        """Sources publiables à l'agent, filtrées par ce qu'il a le droit de lire."""
        out = []
        for name in self.names:
            permission, kind, _ = self._sources[name]
            if permissions is not None and permission not in permissions:
                continue
            out.append({"name": name, "type": kind})
        return out

    def read(self, name: str, permissions: set[str] | None) -> Any:
        entry = self._sources.get(name)
        if entry is None:
            raise SurfaceRejected(
                f"liaison « {name} » inconnue — sources servies : "
                f"{', '.join(self.names) or '(aucune)'}"
            )
        required, _, reader = entry
        if permissions is not None and required not in permissions:
            raise SurfaceRejected(
                f"liaison « {name} » refusée pour cette session "
                f"(exige {required})"
            )
        return reader()


def resolve_bindings(value: Any, resolver: BindingResolver | None, permissions: set[str] | None) -> Any:
    """Remplace récursivement les `{"$bind": "..."}` par leur valeur.

    Sans résolveur, tout `$bind` est **refusé** : c'est le défaut sûr. Servir
    la structure brute afficherait le nom de la source à l'écran, et l'ignorer
    afficherait un trou — les deux valent moins qu'un refus explicite.
    """
    if isinstance(value, dict):
        if "$bind" in value:
            source = value.get("$bind")
            if resolver is None:
                raise SurfaceRejected(
                    f"liaison de données « {source} » : aucun résolveur. "
                    "Aucun document ne doit porter de données liées tant que "
                    "le Core ne sait pas les servir (contrat §6.3)."
                )
            if not isinstance(source, str):
                raise SurfaceRejected("`$bind` doit nommer une source, en texte")
            return resolver.read(source, permissions)
        return {k: resolve_bindings(v, resolver, permissions) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_bindings(v, resolver, permissions) for v in value]
    return value


def _contains_binding(value: Any) -> bool:
    """Reste-t-il une liaison non résolue quelque part ?"""
    if isinstance(value, dict):
        if "$bind" in value:
            return True
        return any(_contains_binding(v) for v in value.values())
    if isinstance(value, list):
        return any(_contains_binding(v) for v in value)
    return False


def _check_props(name: str, schema: Any, props: Any) -> None:
    """Valide les props contre le JSON Schema publié par le catalogue.

    Volontairement **minimal** : `type`, `required`, `properties`, `enum`, et
    le refus des clés inconnues. C'est le sous-ensemble que Zod produit via
    `z.toJSONSchema()`, et il n'y a pas de raison d'embarquer une dépendance de
    validation complète pour ça — d'autant qu'une dépendance de plus dans le
    Core est une brique de plus qui peut manquer au démarrage.

    Les clés inconnues sont refusées, et ce n'est pas de la rigidité : une prop
    inventée par un agent est soit une hallucination, soit une tentative de
    faire passer une donnée par un canal que personne n'a prévu.
    """
    if not isinstance(schema, dict) or not schema:
        return
    if props is None:
        props = {}
    if not isinstance(props, dict):
        raise SurfaceRejected(f"« {name} » : `props` doit être un objet")

    properties = schema.get("properties")
    properties = properties if isinstance(properties, dict) else {}

    for key in schema.get("required") or []:
        if key not in props:
            raise SurfaceRejected(f"« {name} » : prop obligatoire « {key} » absente")

    for key, value in props.items():
        spec = properties.get(key)
        if spec is None:
            known = ", ".join(sorted(properties)) or "(aucune)"
            raise SurfaceRejected(
                f"« {name} » : prop inconnue « {key} » — admises : {known}"
            )
        if not isinstance(spec, dict):
            continue

        expected = spec.get("type")
        if isinstance(expected, str) and not _type_matches(expected, value):
            raise SurfaceRejected(
                f"« {name} » : prop « {key} » attendue de type {expected}"
            )

        allowed = spec.get("enum")
        if isinstance(allowed, list) and value not in allowed:
            raise SurfaceRejected(
                f"« {name} » : prop « {key} » hors des valeurs admises "
                f"({', '.join(map(str, allowed))})"
            )


def _type_matches(expected: str, value: Any) -> bool:
    """`bool` avant `int` : en Python `True` est un entier, pas en JSON Schema."""
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "string":
        return isinstance(value, str)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    if expected == "null":
        return value is None
    return True


def validate_document(
    doc: Any,
    catalog: SurfaceCatalog,
    *,
    permissions: set[str] | None = None,
    context: set[str] | None = None,
    bindings: BindingResolver | None = None,
) -> dict[str, Any]:
    """Admet ou refuse un document de surface. Lève `SurfaceRejected`.

    On ne **corrige** jamais ce qu'un agent propose : c'est accepté ou refusé, un
    document rafistolé en silence masquerait le défaut au lieu de le signaler.

    Une seule chose est réécrite, et c'est le contrat qui l'exige : les liaisons
    `$bind` sont **remplacées par leur valeur**, servie par le Core (§6.3).
    L'agent demande une donnée, il ne la fournit pas — sinon une composition
    devient un canal d'exfiltration.

    `permissions` et `context` décrivent CE QUE PEUT VOIR l'utilisateur de la
    session en cours. Les laisser à `None` conserve le comportement P0/P1 (pas
    de filtrage) : c'est réservé aux tests et aux outils, jamais au chemin qui
    part d'un agent. Le Core, lui, les fournit toujours.
    """
    if not isinstance(doc, dict):
        raise SurfaceRejected("document absent ou mal formé")

    surfaces = doc.get("surfaces")
    if not isinstance(surfaces, dict) or not surfaces:
        raise SurfaceRejected("aucune surface dans le document")

    total_components = 0
    total_overlays = 0

    for surface_id, surface in surfaces.items():
        if not isinstance(surface, dict):
            raise SurfaceRejected(f"surface « {surface_id} » mal formée")

        components = surface.get("components")
        roots = surface.get("root")
        if not isinstance(components, dict) or not isinstance(roots, list):
            raise SurfaceRejected(f"surface « {surface_id} » : `root` ou `components` manquant")

        for cid in roots:
            if cid not in components:
                raise SurfaceRejected(f"racine « {cid} » absente de `components`")

        if len(components) > MAX_COMPONENTS_PER_SURFACE:
            raise SurfaceRejected(
                f"surface « {surface_id} » : {len(components)} composants, "
                f"maximum {MAX_COMPONENTS_PER_SURFACE} (budget d'attention)"
            )
        total_components += len(components)

        for cid, node in components.items():
            if not isinstance(node, dict):
                raise SurfaceRejected(f"composant « {cid} » mal formé")

            name = node.get("name")
            if not isinstance(name, str) or name not in catalog:
                raise SurfaceRejected(
                    f"composant « {name} » hors catalogue — connus : {', '.join(catalog.names) or '(aucun)'}"
                )

            definition = catalog.get(name) or {}

            state = node.get("state")
            states = definition.get("states") or []
            if states and state not in states:
                raise SurfaceRejected(
                    f"« {name} » : état « {state} » inconnu — attendus : {', '.join(states)}"
                )

            region = node.get("region")
            if region is not None and region not in REGIONS:
                raise SurfaceRejected(f"« {name} » : région « {region} » hors vocabulaire")

            size = node.get("size")
            if size is not None and size not in SIZES:
                raise SurfaceRejected(f"« {name} » : taille « {size} » hors vocabulaire")

            if region == "overlay":
                total_overlays += 1

            # ── Permissions et contexte ─────────────────────────────────────
            # `None` = pas de filtrage (tests, outils). Le Core passe toujours
            # des ensembles, même vides.
            #
            # Ces deux contrôles passent AVANT la résolution des liaisons : on
            # ne va pas lire une donnée pour un composant qu'on s'apprête à
            # refuser. L'ordre du §6.2 place la validation des props avant, mais
            # elle ne peut pas s'appliquer à un `$bind` non encore résolu — on
            # valide donc les props APRÈS, sur les valeurs réellement servies,
            # ce qui est strictement plus sûr.
            if permissions is not None:
                required = set(definition.get("permissions") or [])
                if missing := required - permissions:
                    raise SurfaceRejected(
                        f"« {name} » : permission refusée pour cette session — "
                        f"il faudrait {', '.join(sorted(missing))}"
                    )

            if context is not None:
                needed = set(definition.get("requiredContext") or [])
                if absent := needed - context:
                    raise SurfaceRejected(
                        f"« {name} » : contexte absent — {', '.join(sorted(absent))}"
                    )

            # ── Données ─────────────────────────────────────────────────────
            props = node.get("props")
            if _contains_binding(props):
                try:
                    props = resolve_bindings(props, bindings, permissions)
                except SurfaceRejected as exc:
                    raise SurfaceRejected(f"« {name} » : {exc}") from exc
                node["props"] = props

            _check_props(name, definition.get("props"), props)

            for child in node.get("children") or []:
                if child not in components:
                    raise SurfaceRejected(f"« {name} » : enfant « {child} » introuvable")

    if total_components > MAX_COMPONENTS_TOTAL:
        raise SurfaceRejected(
            f"{total_components} composants au total, maximum "
            f"{MAX_COMPONENTS_TOTAL} (budget d'attention)"
        )

    # Un `overlay` recouvre l'écran et capte l'entrée. Deux, et l'utilisateur ne
    # sait plus à quoi il répond — c'est le cas qui rend une machine inutilisable
    # sans qu'aucune action « sensible » n'ait été exécutée.
    if total_overlays > MAX_OVERLAYS:
        raise SurfaceRejected(
            f"{total_overlays} composants en « overlay », maximum {MAX_OVERLAYS} "
            "(budget d'attention)"
        )

    return doc


# Gravité du protocole → niveau de risque de la Policy existante.
# On ne crée pas un second barème : `policy.py` reste seul juge, ce module ne
# fait que traduire le vocabulaire de la surface vers le sien.
GRAVITY_TO_RISK = {
    "info": 1,   # RiskLevel.INFO
    "media": 2,  # RiskLevel.MEDIA
    "home": 3,   # RiskLevel.HOME
    "admin": 4,  # RiskLevel.ADMIN
}


def risk_of(gravity: str) -> int:
    """Gravité inconnue → traitée comme ADMIN.

    Le défaut penche vers le plus restrictif : une action dont on ne sait rien
    ne doit pas passer pour anodine.
    """
    return GRAVITY_TO_RISK.get(str(gravity).lower(), 4)


def gravity_for(catalog: SurfaceCatalog, component_name: Any, action: Any) -> str:
    """Gravité d'une action, **dérivée du catalogue**. Jamais reçue du client.

    ⚠ C'est un correctif de sécurité, pas une commodité. Le Core lisait
    auparavant `data["gravity"]` tel qu'envoyé par le HUD. Or `definitions.ts`
    affirme exactement l'inverse — « sa gravité est déclarée ici, au catalogue,
    pas dans le composant, pas dans la proposition de l'agent : un agent ne peut
    donc pas s'auto-attribuer une gravité faible pour une action lourde ».

    Le HUD faisait bien son travail, mais rien ne l'imposait : n'importe quel
    client WebSocket pouvait émettre
    `{"action":"intent","intent":"service.restart","gravity":"info"}`
    et traverser la Policy sans confirmation. Le contrôle n'a de valeur que du
    côté qui décide.

    Résolution : correspondance exacte de l'action, puis joker `*`, puis
    `admin`. Tout ce qui n'est pas explicitement déclaré est traité comme lourd
    — une action inconnue d'un composant est soit une hallucination, soit une
    tentative, et aucune des deux ne mérite le bénéfice du doute.
    """
    definition = catalog.get(component_name) if isinstance(component_name, str) else None
    if not definition:
        return "admin"

    supported = definition.get("supportedActions")
    if not isinstance(supported, dict):
        return "admin"

    declared = supported.get(action) if isinstance(action, str) else None
    if declared is None:
        declared = supported.get("*")

    return str(declared).lower() if isinstance(declared, str) else "admin"


def _pointer(path: str) -> list[str]:
    """Décode un JSON Pointer (RFC 6901).

    L'ordre de dé-échappement compte : `~1` avant `~0`, sinon `~01` devient
    `/` au lieu de `~1`.
    """
    if path == "":
        return []
    if not path.startswith("/"):
        raise SurfaceRejected(f"pointeur invalide (doit commencer par « / ») : {path}")
    return [seg.replace("~1", "/").replace("~0", "~") for seg in path[1:].split("/")]


def apply_patch(doc: dict[str, Any], ops: list[dict[str, Any]]) -> dict[str, Any]:
    """Applique un JSON Patch — `add`, `replace`, `remove` uniquement.

    **Tout ou rien** : on travaille sur une copie profonde et on ne la retourne
    qu'en cas de succès complet. Un patch à moitié appliqué laisserait le Core
    et le HUD dans deux états différents, sans que rien ne le signale.

    `move`, `copy` et `test` ne servent pas à une surface : les admettre
    ouvrirait des cas d'erreur pour rien.
    """
    import copy as _copy

    work = _copy.deepcopy(doc)

    for op in ops:
        kind = op.get("op")
        path = op.get("path")
        if kind not in ("add", "replace", "remove") or not isinstance(path, str):
            raise SurfaceRejected(f"opération invalide : {op}")

        segments = _pointer(path)
        if not segments:
            raise SurfaceRejected("patch sur la racine refusé")

        cursor: Any = work
        for seg in segments[:-1]:
            if isinstance(cursor, list):
                try:
                    cursor = cursor[int(seg)]
                except (ValueError, IndexError) as exc:
                    raise SurfaceRejected(f"« {path} » : segment « {seg} » invalide") from exc
            elif isinstance(cursor, dict) and seg in cursor:
                cursor = cursor[seg]
            else:
                raise SurfaceRejected(f"« {path} » : segment « {seg} » absent")

        last = segments[-1]

        if isinstance(cursor, list):
            index = len(cursor) if last == "-" else int(last)
            if kind == "add":
                cursor.insert(index, op.get("value"))
            elif kind == "replace":
                cursor[index] = op.get("value")
            else:
                del cursor[index]
        elif isinstance(cursor, dict):
            if kind == "replace" and last not in cursor:
                raise SurfaceRejected(f"« {path} » : clé absente, « replace » refusé")
            if kind == "remove":
                if last not in cursor:
                    raise SurfaceRejected(f"« {path} » : clé absente, rien à supprimer")
                del cursor[last]
            else:
                cursor[last] = op.get("value")
        else:
            raise SurfaceRejected(f"« {path} » : le parent n'est pas un conteneur")

    return work


class SurfaceBroadcaster:
    """Fabrique les enveloppes et tient la séquence.

    `seq` est monotone PAR RUN. Le HUD s'en sert pour détecter un trou et
    réclamer un snapshot : sans ça un delta perdu produirait une interface
    silencieusement fausse. En P0 on n'émet que des snapshots, mais la
    numérotation est déjà juste — la garde côté HUD peut donc être testée.
    """

    def __init__(self, catalog: SurfaceCatalog | None = None) -> None:
        self.catalog = catalog or SurfaceCatalog()
        self.run_id: str = ""
        self._seq = 0
        # Copie de vérité côté Core. Les deltas y sont appliqués avant émission,
        # pour qu'une resynchronisation renvoie l'état RÉEL et non l'original.
        self.document: dict[str, Any] = {}

    def _envelope(self, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._seq += 1
        return {
            "v": PROTOCOL_VERSION,
            "type": kind,
            "id": uuid.uuid4().hex,
            "ts": int(time.time() * 1000),
            "run_id": self.run_id,
            "seq": self._seq,
            "payload": payload,
        }

    def snapshot(self, document: dict[str, Any]) -> dict[str, Any]:
        """Nouvelle composition. Elle REMPLACE la précédente (décision §10.2-4).

        D'où le `run_id` neuf et la séquence remise à zéro : le HUD comprend
        qu'il ne s'agit pas de la suite de ce qu'il affichait.
        """
        self.run_id = uuid.uuid4().hex
        self._seq = 0
        self.document = document
        return self._envelope("SURFACE_SNAPSHOT", {"document": document})

    def resnapshot(self) -> dict[str, Any] | None:
        """Réémet l'état courant SANS changer de `run_id`.

        Réponse à une demande de resynchronisation : le HUD a détecté un trou
        et jeté son état. On lui redonne la vérité en gardant la composition
        en cours — un nouveau `run_id` lui ferait croire à une composition
        différente.
        """
        if not self.document:
            return None
        return self._envelope("SURFACE_SNAPSHOT", {"document": self.document})

    def open_approval(
        self, *, intent: str, gravity: str, reason: str, surface_id: str
    ) -> tuple[str, dict[str, Any]]:
        """Ouvre une demande d'autorisation et l'INJECTE dans la surface.

        Deux choses importantes ici.

        D'abord, la demande est écrite dans `pending.approvals` du document :
        elle survit donc à une resynchronisation et à un rechargement du HUD.
        Une action en attente ne doit pas disparaître parce qu'un onglet a
        rechargé — sinon elle resterait bloquée côté Core sans que personne ne
        puisse plus y répondre.

        Ensuite, on ajoute une `ApprovalCard` à la surface concernée. C'est le
        CORE qui la compose, pas l'agent : un agent ne doit pas pouvoir
        fabriquer une fausse demande d'autorisation, ni omettre d'en afficher
        une vraie.
        """
        approval_id = uuid.uuid4().hex[:12]
        card_id = f"approval_{approval_id}"

        self.document.setdefault("pending", {}).setdefault("approvals", {})[approval_id] = {
            "intent": intent,
            "gravity": gravity,
            "reason": reason,
            "surface_id": surface_id,
        }

        surface = self.document.setdefault("surfaces", {}).setdefault(
            surface_id, {"root": [], "components": {}}
        )
        surface["components"][card_id] = {
            "name": "ApprovalCard",
            "props": {
                "approvalId": approval_id,
                "action": intent,
                "gravity": gravity,
                "reason": reason,
            },
            "state": "pending",
            "region": "top",
            "size": "wide",
            "children": [],
        }
        if card_id not in surface["root"]:
            surface["root"].insert(0, card_id)

        return approval_id, self._envelope("SURFACE_SNAPSHOT", {"document": self.document})

    def close_approval(
        self, approval_id: str, granted: bool
    ) -> tuple[dict[str, Any], dict[str, Any]] | None:
        """Retire la demande et sa carte. Rend `(état à rediffuser, demande)`.

        ⚠ La demande est **retournée**, pas jetée. Elle l'était : cette méthode
        ne relisait `record` que pour son `surface_id`, si bien que l'`intent`
        approuvé disparaissait avec elle. Accordée ou refusée, l'intention ne
        s'exécutait jamais — l'invariant du produit
        « IA → Proposition → Policy → Autorisation → **Exécution** » s'arrêtait
        à l'avant-dernier maillon, et le vert « autorisé » ne prouvait que
        l'affichage.

        C'est l'appelant qui exécute (cf. `IntentExecutor`), pas ce module : un
        diffuseur de surfaces n'a pas à savoir redémarrer un service.
        """
        pending = self.document.get("pending", {}).get("approvals", {})
        record = pending.pop(approval_id, None)
        if record is None:
            return None

        surface_id = record.get("surface_id", "")
        card_id = f"approval_{approval_id}"
        surface = self.document.get("surfaces", {}).get(surface_id)
        if surface:
            surface.get("components", {}).pop(card_id, None)
            surface["root"] = [r for r in surface.get("root", []) if r != card_id]

        event = self._envelope("SURFACE_SNAPSHOT", {"document": self.document})
        return event, record

    def delta(self, ops: list[dict[str, Any]]) -> dict[str, Any]:
        """Mise à jour incrémentale de la composition en cours.

        ⚠ Le Core applique le patch à SA copie avant de l'émettre. Sans ça, une
        resynchronisation renverrait un état périmé — le HUD serait « réparé »
        avec un document antérieur aux deltas déjà appliqués, ce qui est pire
        que le trou d'origine.
        """
        self.document = apply_patch(self.document, ops)
        return self._envelope("SURFACE_DELTA", {"ops": ops})


class IntentNotExecutable(Exception):
    """Aucun exécutant pour cette intention. Refus explicite, jamais silence."""


class IntentExecutor:
    """Le maillon « Autorisation → **Exécution** » (§7.2 du contrat).

    Il n'existait pas. La chaîne s'arrêtait à l'autorisation : `close_approval`
    retirait la carte, rediffusait l'état, et l'intention approuvée était
    perdue. Personne ne le voyait, parce qu'une approbation qui « marche » à
    l'écran est indistinguable d'une approbation qui exécute.

    Deux règles de conception, toutes deux tirées de ce défaut :

    1. **Registre explicite.** Une action ne s'exécute que si quelqu'un l'a
       inscrite ici. On n'exécute pas une chaîne de caractères venue d'un LLM
       parce qu'elle ressemble à une commande.

    2. **Absence d'exécutant = refus tracé, jamais succès silencieux.** C'est
       le point qui compte. Le mode de panne de ce projet est « déclaré et
       jamais appelé, et rien ne le signale » : si une intention sans exécutant
       repartait avec un `ok: True`, on réinstallerait exactement ce défaut, à
       l'endroit précis où on vient de le corriger.

    Inspiration assumée de `vendor/eve-analyst-main` : chez Eve, l'approbation
    est une propriété de l'OUTIL, donc la reprise après pause rappelle l'outil.
    Le lien décision → exécution y est structurel. Ici il est explicite, ce qui
    revient au même tant que le registre reste la seule porte.
    """

    def __init__(self) -> None:
        self._handlers: dict[str, Any] = {}

    def register(self, action: str, handler: Any) -> None:
        """Inscrit un exécutant. Réinscrire écrase — le dernier gagne."""
        self._handlers[action] = handler
        logger.info("exécutant enregistré · %s", action)

    @property
    def actions(self) -> list[str]:
        return sorted(self._handlers)

    def can(self, action: str) -> bool:
        return action in self._handlers

    async def execute(self, action: str, payload: dict[str, Any] | None = None) -> Any:
        """Exécute une intention DÉJÀ autorisée.

        ⚠ Cette méthode ne consulte pas la Policy : elle s'exécute en aval
        d'une décision. L'appeler sans être passé par `policy.evaluate` court-
        circuite tout le dispositif — c'est le seul usage interdit.
        """
        handler = self._handlers.get(action)
        if handler is None:
            raise IntentNotExecutable(
                f"« {action} » : aucun exécutant enregistré. L'action a été "
                "autorisée mais rien ne sait la réaliser."
            )

        result = handler(payload or {})
        if inspect.isawaitable(result):
            result = await result
        return result
