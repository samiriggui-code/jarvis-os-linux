#!/usr/bin/env python3
"""Hermes Architecture Index — génère `generated/` depuis le code source.

Graphify lit le code : imports, classes, appels, héritage. Ce qu'il ne peut
pas voir, c'est le **dispatch dynamique** — `ROUTES["mission_dev"]` puis
`getattr(self, "handle_mission_dev")`. Pour un AST, ce lien n'existe pas :
c'est une chaîne de caractères qui devient un nom de méthode à l'exécution.
Ce script reconstruit cette couche-là, et elle seule.

    python architecture/build.py            écrit generated/
    python architecture/build.py --check    échoue si generated/ a dérivé

Règle : rien ici ne se maintient à la main. Si une information est déjà dans
le code, elle s'extrait — on ne la recopie pas. Un YAML recopié est faux au
premier renommage ; ce dépôt s'est déjà fait avoir (cf.
`deploy/scripts/check-embedded-copies.sh`).

Pourquoi de l'AST et pas des expressions régulières : la première version de
cet extracteur en utilisait, et elle a renvoyé « 0 route » sans rien signaler
— `ROUTES: dict[str, Route] = {...}` est un `AnnAssign`, pas un `Assign`. Un
extracteur qui échoue en silence est pire que pas d'extracteur du tout.
"""
from __future__ import annotations

import argparse
import ast
import sys
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parent.parent
GENERATED = Path(__file__).resolve().parent / "generated"

CORE_PKG = ROOT / "core" / "jarvis_core"
CORE_MAIN = CORE_PKG / "__init__.py"
CORE_ROUTES = CORE_PKG / "ws" / "routes.py"
CORE_WS_HANDLERS = CORE_PKG / "ws" / "handlers"
HUD_SRC = ROOT / "hud" / "src" / "app"
# La couche agentique est hors de `app/` — sans elle, l'extracteur ignore
# `AgentSurface` et rapporte ses écoutes comme inexistantes.
HUD_AGENTIC = ROOT / "hud" / "src" / "agentic"
SYSTEMD = ROOT / "deploy" / "systemd"

EN_TETE = (
    "# ═══ GÉNÉRÉ — NE PAS ÉDITER ═══════════════════════════════════════════\n"
    "# Produit par `python architecture/build.py` depuis le code source.\n"
    "# Toute correction se fait dans le code, jamais ici : ce fichier est\n"
    "# comparé au code par `--check`, il perdrait toujours l'arbitrage.\n"
)


# ── outillage AST ─────────────────────────────────────────────────────────

def modules_python() -> Iterator[tuple[Path, ast.Module]]:
    for py in sorted(CORE_PKG.rglob("*.py")):
        if "__pycache__" in py.parts or py.name.startswith("_smoke"):
            continue
        try:
            yield py, ast.parse(py.read_text(encoding="utf-8"), str(py))
        except SyntaxError as exc:  # pragma: no cover — signalé, jamais avalé
            print(f"  ! {py.relative_to(ROOT)} illisible : {exc}", file=sys.stderr)


def nom_appele(node: ast.Call) -> str | None:
    """`self._emit(...)` → `_emit` ; `foo(...)` → `foo`."""
    f = node.func
    if isinstance(f, ast.Attribute):
        return f.attr
    if isinstance(f, ast.Name):
        return f.id
    return None


def premier_texte(node: ast.Call) -> str | None:
    if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
        return node.args[0].value
    return None


# ── extracteurs ───────────────────────────────────────────────────────────

def _collect_ws_handlers() -> set[str]:
    """Méthodes `handle_*` des mixins WS (Phase 1 — plus dans __init__.py)."""
    methodes: set[str] = set()
    if CORE_WS_HANDLERS.is_dir():
        for py in sorted(CORE_WS_HANDLERS.rglob("*.py")):
            if py.name.startswith("_"):
                continue
            for node in ast.walk(ast.parse(py.read_text(encoding="utf-8"), str(py))):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    methodes.add(node.name)
    return methodes


def extraire_routes() -> list[dict[str, Any]]:
    """La table `ROUTES` du Core : message WS → méthode handler."""
    source = CORE_ROUTES if CORE_ROUTES.is_file() else CORE_MAIN
    arbre = ast.parse(source.read_text(encoding="utf-8"), str(source))

    methodes = _collect_ws_handlers()
    if not methodes and CORE_MAIN.is_file():
        # Compat ancien monolithe
        arbre_main = ast.parse(CORE_MAIN.read_text(encoding="utf-8"), str(CORE_MAIN))
        methodes = {
            n.name
            for cls in ast.walk(arbre_main)
            if isinstance(cls, ast.ClassDef)
            for n in cls.body
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        }

    routes: list[dict[str, Any]] = []
    for node in arbre.body:
        # AnnAssign (`ROUTES: dict[...] = {}`) autant qu'Assign — ne tester
        # que le second est l'erreur qui a coûté une première version muette.
        if isinstance(node, ast.AnnAssign):
            cible, valeur = node.target, node.value
        elif isinstance(node, ast.Assign):
            cible, valeur = node.targets[0], node.value
        else:
            continue
        if getattr(cible, "id", None) != "ROUTES" or not isinstance(valeur, ast.Dict):
            continue

        for cle, val in zip(valeur.keys, valeur.values):
            if not (isinstance(cle, ast.Constant) and isinstance(cle.value, str)):
                continue
            handler: str | None = None
            if isinstance(val, ast.Call):
                args = [a.value for a in val.args if isinstance(a, ast.Constant)]
                handler = args[0] if args else None
            routes.append({
                "message": cle.value,
                "core_handler": handler,
                "error_type": None,
                "handler_existe": handler in methodes if handler else False,
                "source": f"{source.relative_to(ROOT).as_posix()}:L{cle.lineno}",
            })
    return routes


def extraire_emissions() -> dict[str, dict[str, list[str]]]:
    """Ce que le Core envoie au HUD — sur DEUX canaux distincts.

    Découverte en écrivant cet extracteur, et invisible à la lecture :
    `cmd()` ne produit pas un message typé mais `{"command": …}`
    (`__init__.py:363`). Le protocole a donc deux axes parallèles —
    `type` pour les événements, `command` pour les impératifs — et le HUD
    les teste séparément (`data.type ===` vs `cmd ===`). Les confondre
    faisait apparaître `set_orb_state` comme « émis mais jamais écouté ».

    Un troisième canal alimente le premier : `self._emit("x", …)` du
    superviseur publie sur le bus, que `_forward_bus()` relaie en WS.
    """
    types: dict[str, set[str]] = {}
    commandes: dict[str, set[str]] = {}
    bus: dict[str, set[str]] = {}

    def noter(cible: dict[str, set[str]], nom: str, chemin: Path) -> None:
        cible.setdefault(nom, set()).add(str(chemin.relative_to(ROOT)).replace("\\", "/"))

    for chemin, arbre in modules_python():
        for node in ast.walk(arbre):
            if isinstance(node, ast.Dict):
                for cle, val in zip(node.keys, node.values):
                    if not (isinstance(cle, ast.Constant) and isinstance(val, ast.Constant)
                            and isinstance(val.value, str)):
                        continue
                    if cle.value == "type":
                        noter(types, val.value, chemin)
                    elif cle.value == "command":
                        noter(commandes, val.value, chemin)
            elif isinstance(node, ast.Call):
                nom = nom_appele(node)
                texte = premier_texte(node)
                if not texte:
                    continue
                if nom == "cmd":
                    noter(commandes, texte, chemin)
                elif nom in ("_emit", "publish"):
                    # `publish` manquait : `bus.publish("GESTURE_DETECTED", …)`
                    # alimente le même relais WS que `_emit`. Sans lui, trois
                    # événements réellement émis étaient rapportés comme
                    # « le Core ne l'émet jamais ».
                    noter(bus, texte, chemin)
                elif nom == "_envelope":
                    # Quatrième canal, découvert le 2026-08-05 : les surfaces
                    # ne construisent pas un dict littéral mais passent par
                    # `_envelope(kind, payload)` → `{"type": kind, …}`. Le type
                    # est le PREMIER ARGUMENT, donc invisible à la lecture des
                    # dicts. `SURFACE_SNAPSHOT` sortait « jamais émis » alors
                    # qu'il est le message central de la couche agentique.
                    noter(types, texte, chemin)

    trier = lambda d: {k: sorted(v) for k, v in sorted(d.items())}  # noqa: E731
    return {"types": trier(types), "commandes": trier(commandes), "bus": trier(bus)}


def extraire_hud() -> dict[str, list[str]]:
    """Ce que le HUD envoie, écoute, et déclare — sources TypeScript.

    Attention au piège : un `type: 'tts_audio'` dans `hudContracts.ts` est la
    DÉCLARATION d'un message que le HUD *reçoit*, pas un envoi. Une première
    version ratissait tous les `type:` du dossier et annonçait 45 « messages
    envoyés sans route Core » — tous faux. On ne retient donc comme envoi que
    ce qui est littéralement passé à `send({...})`.
    """
    import re

    envoie: set[str] = set()
    ecoute: set[str] = set()
    ecoute_cmd: set[str] = set()
    declare: set[str] = set()

    # ⚠ `HUD_SRC` seul ne suffit pas : la couche agentique vit dans
    # `hud/src/agentic/`, HORS de `hud/src/app/`. Elle était donc entièrement
    # invisible à cet extracteur — `surface_result` et `surface_error` étaient
    # rapportés « non écoutés » alors qu'`AgentSurface.tsx` les traite. Un
    # extracteur aveugle sur un dossier ment avec l'assurance d'un fichier
    # généré, ce qui est pire que de ne rien dire.
    sources_hud = [HUD_SRC, HUD_AGENTIC]
    fichiers = sorted(
        f for base in sources_hud if base.is_dir()
        for f in list(base.rglob("*.ts")) + list(base.rglob("*.tsx"))
    )

    for ts in fichiers:
        texte = ts.read_text(encoding="utf-8")
        # Envoi réel : send({ type: 'x', … }) — l'objet peut être multiligne.
        envoie |= set(re.findall(r"send\(\s*\{[^{}]*?type:\s*'([a-z_]+)'", texte, re.S))
        declare |= set(re.findall(r"type:\s*'([a-z_]+)'", texte))

        # Formes rencontrées, et les enveloppes de surface sont en MAJUSCULES
        # (`SURFACE_SNAPSHOT`), que `[a-z_]+` ne voyait pas :
        #   `data.type === 'x'`                    → `type === 'x'`
        #   `const type = String(data.type)` puis  → `type === 'x'`
        #   `const kind = data.type` puis          → `kind === 'x'`
        #
        # ⚠ Le troisième cas ne se traite PAS en élargissant à `kind` : le HUD
        # compare aussi `MediaDeviceInfo.kind === 'audioinput'`, qui n'est pas un
        # message. Trois fausses alertes en sortaient. On lit donc d'abord les
        # alias RÉELLEMENT liés à `data.type` **dans ce fichier**, et on ne
        # reconnaît qu'eux — l'information est extraite, jamais recopiée.
        alias = {"type"} | set(
            re.findall(r"\b(?:const|let)\s+(\w+)\s*=\s*(?:String\()?\s*\w+\.type\b", texte)
        )
        for nom_alias in alias:
            ecoute |= set(re.findall(rf"\b{re.escape(nom_alias)} === '([A-Za-z_]+)'", texte))
        ecoute_cmd |= set(re.findall(r"\bcmd === '([a-z_]+)'", texte))

    # `msg.type === 'ai'` du chat n'est pas un message WebSocket. Restreindre
    # la recherche au dossier `bridge/` écartait ce bruit — mais aussi les
    # vrais consommateurs (`SettingsPanel` traite `holomat_status`). On
    # soustrait donc le bon ensemble plutôt que de couper par dossier, et cet
    # ensemble est LU dans le code, pas recopié ici.
    ctx = (HUD_SRC / "context" / "AppContext.tsx").read_text(encoding="utf-8")
    bloc = re.search(r"interface Message \{(.*?)\}", ctx, re.S)
    if bloc:
        union = re.search(r"type:\s*([^;]+);", bloc.group(1))
        if union:
            ecoute -= set(re.findall(r"'([a-z_]+)'", union.group(1)))

    return {
        "envoie": sorted(envoie),
        "ecoute": sorted(ecoute),
        "ecoute_commandes": sorted(ecoute_cmd),
        "declare": sorted(declare - envoie),
    }


def extraire_evenements() -> dict[str, Any]:
    """Bus interne et signaux de séquence — l'autre couche invisible à l'AST.

    Deux mécanismes distincts, souvent confondus :
      · `bus.publish("GESTURE_DETECTED", …)` — file inter-composants, avec une
        politique de débit par type (`RATE_POLICIES` dans `bus.py`)
      · `sequences.signal("face.matched")` — jalons attendus par les séquences
        de dialogue, qui débloquent l'étape suivante

    Un signal jamais émis fige une séquence ; une politique déclarée pour un
    type jamais publié est du code mort. Les deux se voient ici, nulle part
    ailleurs.
    """
    publies: dict[str, set[str]] = {}
    signaux: dict[str, set[str]] = {}
    attendus: set[str] = set()
    # Sites où le type publié est une VARIABLE — `self.bus.publish(kind, …)`
    # pour les gestes venus du HUD. Tant qu'il en existe un seul, on ne peut
    # PAS conclure qu'une politique est sans émetteur : l'émission existe,
    # elle est simplement hors de portée d'une lecture statique. Le dire est
    # plus utile que d'inventer six alertes.
    publications_dynamiques: list[str] = []

    for chemin, arbre in modules_python():
        rel = str(chemin.relative_to(ROOT)).replace("\\", "/")
        for node in ast.walk(arbre):
            if not isinstance(node, ast.Call):
                continue
            nom, texte = nom_appele(node), premier_texte(node)
            if nom in ("publish", "signal") and texte is None and node.args:
                publications_dynamiques.append(f"{rel}:L{node.lineno}")
                continue
            if not texte:
                continue
            if nom == "publish":
                publies.setdefault(texte, set()).add(rel)
            elif nom == "signal":
                signaux.setdefault(texte, set()).add(rel)

    # Politiques de débit déclarées dans bus.py — un dict littéral de plus.
    politiques: dict[str, str] = {}
    bus = ROOT / "core" / "jarvis_core" / "bus.py"
    arbre = ast.parse(bus.read_text(encoding="utf-8"), str(bus))
    for node in ast.walk(arbre):
        if not isinstance(node, ast.Dict):
            continue
        for cle, val in zip(node.keys, node.values):
            if (isinstance(cle, ast.Constant) and isinstance(cle.value, str)
                    and cle.value.isupper() and isinstance(val, ast.Call)):
                mode = "?"
                for kw in val.keywords:
                    if kw.arg == "mode":
                        mode = ast.unparse(kw.value).replace("Mode.", "")
                politiques[cle.value] = mode

    # Jalons attendus par les séquences YAML (`await:` / `on_timeout:`).
    for yml in sorted((ROOT / "core" / "dialogues").glob("*.yaml")):
        for ligne in yml.read_text(encoding="utf-8").splitlines():
            m = __import__("re").search(r"^\s*(?:await|wait_for):\s*([\w.]+)", ligne)
            if m:
                attendus.add(m.group(1))

    return {
        "publies": {k: sorted(v) for k, v in sorted(publies.items())},
        "signaux": {k: sorted(v) for k, v in sorted(signaux.items())},
        "politiques": dict(sorted(politiques.items())),
        "attendus_par_sequences": sorted(attendus),
        "publications_dynamiques": sorted(set(publications_dynamiques)),
    }


def extraire_contrats() -> dict[str, list[str]]:
    """Unions déclarées dans `hudContracts.ts` — le contrat *annoncé*.

    Sa valeur n'est pas de lister des noms : c'est de pouvoir être confronté
    à ce qui circule réellement. Un membre d'union que le Core n'émet jamais
    est une promesse non tenue ; l'inverse est un message non documenté.
    """
    import re

    src = (HUD_SRC / "bridge" / "hudContracts.ts").read_text(encoding="utf-8")
    sortie: dict[str, list[str]] = {}
    for nom in ("CoreToHudEvent", "HudToCoreEvent"):
        bloc = re.search(rf"export type {nom} =(.*?)(?=\nexport |\Z)", src, re.S)
        membres = re.findall(r"\|\s*\{\s*type:\s*'([a-z_]+)'", bloc.group(1)) if bloc else []
        sortie[nom] = sorted(set(membres))
    return sortie


def extraire_plugins() -> list[dict[str, Any]]:
    """Catalogue d'apps du HUD : id, déclencheurs vocaux, outil Hermes, risque.

    C'est un registre de plugins au sens de la spec : un objet déclaratif que
    la voix et le dock résolvent à l'exécution. Les collisions de déclencheurs
    y sont invisibles à la lecture — deux apps qui répondent au même mot, et
    c'est la première déclarée qui gagne, en silence.
    """
    import re

    src = (HUD_SRC / "apps" / "catalog.ts").read_text(encoding="utf-8")
    apps: list[dict[str, Any]] = []
    for bloc in re.findall(r"\{\s*\n?\s*id:\s*'([^']+)'(.*?)\n\s*\},", src, re.S):
        app_id, corps = bloc
        raw = re.search(r"voice:\s*\[(.*?)\]", corps, re.S)
        if raw:
            voix = [
                m.replace("\\'", "'")
                for m in re.findall(r"'((?:\\.|[^'\\])*)'", raw.group(1))
            ]
        else:
            voix = []
        def champ(nom: str) -> str | None:
            m = re.search(rf"{nom}:\s*'([^']*)'", corps)
            return m.group(1) if m else None
        apps.append({
            "id": app_id,
            "nom": champ("name"),
            "risque": champ("risk"),
            "statut": champ("status"),
            # `hermesTool` a été retiré du catalogue : il nommait des outils
            # inexistants. `intent` est résolu par `core/jarvis_core/capabilities.py`,
            # et `owner` n'est qu'un indice de diagnostic — pas un routage.
            "intention": champ("intent"),
            "execute_par": champ("owner"),
            "declencheurs": voix,
        })
    return apps


def extraire_voix() -> dict[str, Any]:
    """Événements de dialogue et couverture du cache vocal.

    Le seul extracteur qui touche à de l'argent : un événement absent du cache
    part en synthèse live, facturée à chaque lecture. La session a montré que
    Mission Control DEV payait 346 caractères par exécution pour des phrases
    déjà présentes sur le disque.
    """
    import json
    import re

    domaines: dict[str, list[str]] = {}
    for yml in sorted((ROOT / "core" / "dialogues").glob("*.yaml")):
        texte = yml.read_text(encoding="utf-8")
        dom = (re.search(r"^domain:\s*(\S+)", texte, re.M) or [None, yml.stem])[1]
        evts = re.findall(r"^\s*-\s*event:\s*(\S+)", texte, re.M)
        if evts:
            domaines[dom] = sorted(set(evts))

    caches: set[str] = set()
    voix_cache = "?"
    racine = ROOT / "core" / "data" / "voice" / "cache"
    if racine.is_dir():
        for dossier in racine.iterdir():
            manifeste = dossier / "manifest.json"
            if manifeste.exists():
                voix_cache = dossier.name
                data = json.loads(manifeste.read_text(encoding="utf-8"))
                caches = {e.get("event") for e in data.get("entries", [])}
                break

    couverture = {}
    for dom, evts in domaines.items():
        manquants = [e for e in evts if e not in caches]
        couverture[dom] = {
            "evenements": len(evts),
            "en_cache": len(evts) - len(manquants),
            "synthese_live": manquants,
        }
    return {"voix_cache": voix_cache, "domaines": domaines, "couverture": couverture}


def phases_interface() -> set[str]:
    """Phases d'écran (`SetupPhase`, `AuthRoute`…) — des UI_PHASE, pas des
    messages.

    Elles vivent dans le même espace de chaînes que les commandes du Core et
    créaient des collisions : « boot » est une commande WS *et* la première
    phase de `FirstSetupScene`. Le rapprochement des deux produisait une
    alerte sur un problème inexistant. On lit donc ces unions dans le code —
    les recopier ici serait exactement la dérive que ce fichier combat.
    """
    import re

    phases: set[str] = set()
    for ts in sorted(HUD_SRC.rglob("*.tsx")) + sorted(HUD_SRC.rglob("*.ts")):
        texte = ts.read_text(encoding="utf-8")
        for union in re.findall(
            r"type\s+\w*(?:Phase|Route|Step|Stage)\w*\s*=\s*([^;]+);", texte
        ):
            phases |= set(re.findall(r"'([a-z_]+)'", union))
    return phases


def extraire_services() -> list[dict[str, Any]]:
    """Unités systemd déployées — nom, description, exec, alias."""
    services = []
    for unite in sorted(SYSTEMD.glob("*.service")):
        champs: dict[str, Any] = {"unite": unite.name}
        for ligne in unite.read_text(encoding="utf-8", errors="replace").splitlines():
            ligne = ligne.strip()
            for cle, sortie in (
                ("Description=", "description"),
                ("ExecStart=", "exec"),
                ("Alias=", "alias"),
                ("WorkingDirectory=", "workdir"),
            ):
                if ligne.startswith(cle):
                    champs[sortie] = ligne[len(cle):]
        services.append(champs)
    return services


# ── rendu YAML (sans dépendance) ──────────────────────────────────────────

def yaml_valeur(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    texte = str(v)
    if texte == "" or any(c in texte for c in ":#'\"\n") or texte.strip() != texte:
        return '"' + texte.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return texte


def rendre(titre: str, corps: list[str]) -> str:
    return EN_TETE + f"# {titre}\nversion: 1\n" + "\n".join(corps) + "\n"


def construire() -> dict[str, str]:
    routes = extraire_routes()
    emissions = extraire_emissions()
    hud = extraire_hud()
    services = extraire_services()

    fichiers: dict[str, str] = {}

    corps = ["routes:"]
    for r in routes:
        corps.append(f"  - message: {yaml_valeur(r['message'])}")
        for k in ("core_handler", "error_type", "handler_existe", "source"):
            corps.append(f"    {k}: {yaml_valeur(r[k])}")
    fichiers["routes.yaml"] = rendre(
        "Dispatch WebSocket entrant : message → handler (invisible à l'AST).", corps)

    corps = [
        "# Deux canaux parallèles : `type` (événements) et `command`",
        "# (impératifs, via cmd() → {\"command\": …}). Le HUD les teste",
        "# séparément. Ne pas les fusionner.",
        "evenements_emis:",
    ]
    for nom, sources in emissions["types"].items():
        corps.append(f"  - type: {yaml_valeur(nom)}")
        corps.append(f"    sources: [{', '.join(yaml_valeur(s) for s in sources)}]")
        corps.append(f"    ecoute_par_le_hud: {yaml_valeur(nom in hud['ecoute'])}")
    corps.append("commandes_emises:")
    for nom, sources in emissions["commandes"].items():
        corps.append(f"  - command: {yaml_valeur(nom)}")
        corps.append(f"    sources: [{', '.join(yaml_valeur(s) for s in sources)}]")
        corps.append(f"    ecoute_par_le_hud: {yaml_valeur(nom in hud['ecoute_commandes'])}")
    corps.append("signaux_bus:")
    for nom, sources in emissions["bus"].items():
        corps.append(f"  - signal: {yaml_valeur(nom)}")
        corps.append(f"    sources: [{', '.join(yaml_valeur(s) for s in sources)}]")
    corps.append("hud_envoie:")
    connus = {r["message"] for r in routes}
    for nom in hud["envoie"]:
        corps.append(f"  - type: {yaml_valeur(nom)}")
        corps.append(f"    route_core_existe: {yaml_valeur(nom in connus)}")
    fichiers["websocket.yaml"] = rendre(
        "Contrat de messages Core ↔ HUD, dans les deux sens et sur les deux canaux.", corps)

    corps = ["services:"]
    for s in services:
        corps.append(f"  - unite: {yaml_valeur(s['unite'])}")
        for k in ("description", "exec", "workdir", "alias"):
            if k in s:
                corps.append(f"    {k}: {yaml_valeur(s[k])}")
    fichiers["services.yaml"] = rendre("Unités systemd déployées sur le NUC.", corps)

    # ── events ────────────────────────────────────────────────────────────
    ev = extraire_evenements()
    corps = ["bus_publies:"]
    for nom, src in ev["publies"].items():
        corps.append(f"  - evenement: {yaml_valeur(nom)}")
        corps.append(f"    politique_debit: {yaml_valeur(ev['politiques'].get(nom))}")
        corps.append(f"    sources: [{', '.join(yaml_valeur(s) for s in src)}]")
    # Sans site de publication dynamique, l'absence d'émetteur est un fait.
    # Avec, c'est une lacune de l'analyse — et il faut le dire, pas le taire.
    dyn = ev["publications_dynamiques"]
    corps.append("publications_dynamiques:  # type passé en variable, invisible à l'AST")
    for site in dyn:
        corps.append(f"  - {yaml_valeur(site)}")
    etiquette = ("politiques_sans_emetteur_STATIQUE:  # peuvent être publiées "
                 "dynamiquement, cf. ci-dessus" if dyn else "politiques_sans_emetteur:")
    corps.append(etiquette)
    for nom in sorted(set(ev["politiques"]) - set(ev["publies"])):
        corps.append(f"  - {yaml_valeur(nom)}")
    corps.append("signaux_sequence:")
    for nom, src in ev["signaux"].items():
        corps.append(f"  - signal: {yaml_valeur(nom)}")
        corps.append(f"    attendu_par_une_sequence: {yaml_valeur(nom in ev['attendus_par_sequences'])}")
        corps.append(f"    sources: [{', '.join(yaml_valeur(s) for s in src)}]")
    corps.append("attendus_jamais_emis:")
    for nom in sorted(set(ev["attendus_par_sequences"]) - set(ev["signaux"])):
        corps.append(f"  - {yaml_valeur(nom)}")
    fichiers["events.yaml"] = rendre(
        "Bus interne et signaux de séquence — hors de portée de l'AST.", corps)

    # ── contracts ─────────────────────────────────────────────────────────
    ct = extraire_contrats()
    emis_tout = set(emissions["types"]) | set(emissions["commandes"]) | set(emissions["bus"])
    corps = []
    for union, membres in ct.items():
        corps.append(f"{union}:")
        for m in membres:
            if union == "CoreToHudEvent":
                corps.append(f"  - type: {yaml_valeur(m)}")
                corps.append(f"    reellement_emis: {yaml_valeur(m in emis_tout)}")
                corps.append(f"    consomme_par_le_hud: {yaml_valeur(m in hud['ecoute'])}")
            else:
                corps.append(f"  - type: {yaml_valeur(m)}")
                corps.append(f"    route_core_existe: {yaml_valeur(m in connus)}")
    fichiers["contracts.yaml"] = rendre(
        "Contrat annoncé (hudContracts.ts) confronté à ce qui circule.", corps)

    # ── plugins ───────────────────────────────────────────────────────────
    plugins = extraire_plugins()
    collisions: dict[str, list[str]] = {}
    for p in plugins:
        for d in p["declencheurs"]:
            collisions.setdefault(d, []).append(p["id"])
    corps = ["apps:"]
    for p in plugins:
        corps.append(f"  - id: {yaml_valeur(p['id'])}")
        for k in ("nom", "statut", "risque", "intention", "execute_par"):
            corps.append(f"    {k}: {yaml_valeur(p[k])}")
        corps.append(f"    declencheurs: [{', '.join(yaml_valeur(d) for d in p['declencheurs'])}]")
    corps.append("declencheurs_ambigus:")
    for mot, ids in sorted(collisions.items()):
        if len(ids) > 1:
            corps.append(f"  - mot: {yaml_valeur(mot)}")
            corps.append(f"    revendique_par: [{', '.join(yaml_valeur(i) for i in ids)}]")
    fichiers["plugins.yaml"] = rendre(
        "Registre d'apps du HUD — résolu à l'exécution par la voix et le dock.", corps)

    # ── voice ─────────────────────────────────────────────────────────────
    vx = extraire_voix()
    corps = [f"voix_cache: {yaml_valeur(vx['voix_cache'])}", "domaines:"]
    for dom, c in sorted(vx["couverture"].items()):
        corps.append(f"  - domaine: {yaml_valeur(dom)}")
        corps.append(f"    evenements: {c['evenements']}")
        corps.append(f"    en_cache: {c['en_cache']}")
        corps.append(f"    synthese_live: [{', '.join(yaml_valeur(e) for e in c['synthese_live'])}]")
    fichiers["voice.yaml"] = rendre(
        "Événements de dialogue et couverture du cache — hors cache = facturé.", corps)

    return fichiers


# ── incohérences : ce que la fusion révèle ────────────────────────────────

def types_du_bus() -> set[str]:
    """Types déclarant une politique de débit dans `bus.py` — ce qui circule.

    Sert à ne pas accuser d'absence un type publié dynamiquement
    (`bus.publish(kind, …)`), tout en laissant l'accusation valable pour un type
    que rien ne déclare nulle part.

    ⚠ Repéré par sa **forme** — un dict dont les valeurs sont des `RatePolicy(…)`
    — et non par son nom. Première version : je cherchais `RATE_POLICIES`, nom
    lu dans un commentaire ; la table s'appelle `DEFAULT_POLICIES`. Elle
    renvoyait donc un ensemble vide, en silence. C'est le travers que l'en-tête
    de ce fichier dénonce : une information recopiée est fausse au premier
    renommage. La forme, elle, survit à un `git mv`.
    """
    chemin = CORE_PKG / "bus.py"
    if not chemin.is_file():
        return set()

    noms: set[str] = set()
    for node in ast.walk(ast.parse(chemin.read_text(encoding="utf-8"))):
        if not isinstance(node, ast.Dict):
            continue
        if not any(
            isinstance(v, ast.Call) and nom_appele(v) == "RatePolicy" for v in node.values
        ):
            continue
        noms |= {
            k.value for k in node.keys
            if isinstance(k, ast.Constant) and isinstance(k.value, str)
        }
    return noms


def incoherences() -> list[str]:
    routes = extraire_routes()
    emissions = extraire_emissions()
    hud = extraire_hud()
    problemes = []

    for r in routes:
        if not r["handler_existe"]:
            problemes.append(
                f"route « {r['message'] } » → handler « {r['core_handler']} » introuvable ({r['source']})")

    connus = {r["message"] for r in routes}
    for t in hud["envoie"]:
        if t not in connus:
            problemes.append(f"le HUD envoie « {t} » — aucune route Core ne l'accepte")

    # Certains types transitent par `self.bus.publish(kind, …)` où `kind` est
    # une VARIABLE — les gestes, construits en tuples dans `gestures.py`. Aucune
    # lecture statique ne peut les rattacher à leur nom. Mais `bus.py` déclare
    # une politique de débit PAR TYPE : cette table est la liste, écrite dans le
    # code, de ce qui circule sur le bus. On la lit plutôt que de recopier des
    # exceptions à la main.
    #
    # Ça ne masque rien : une politique déclarée pour un type jamais publié est
    # signalée séparément par `events.yaml` comme code mort.
    connus_types = set(emissions["types"]) | set(emissions["bus"]) | types_du_bus()
    for t in hud["ecoute"]:
        if t not in connus_types:
            problemes.append(f"le HUD écoute l'événement « {t} » — le Core ne l'émet jamais")

    for c in hud["ecoute_commandes"]:
        if c not in emissions["commandes"]:
            problemes.append(f"le HUD écoute la commande « {c} » — le Core ne l'émet jamais")

    # Typage sémantique : une même chaîne peut désigner deux concepts sans
    # rapport. « boot » est à la fois une COMMANDE du Core et une UI_PHASE de
    # `FirstSetupScene` ; les comparer produisait une fausse alerte. On ne
    # confronte donc que des éléments de même type — et les UI_PHASE sont
    # LUES dans le code, pas listées à la main ici.
    phases_ui = phases_interface()

    # Sens inverse : émis par le Core, traité par personne. Soit du code mort
    # côté Core, soit un branchement oublié côté HUD.
    for t in emissions["types"]:
        if t in hud["declare"] and t not in hud["ecoute"]:
            problemes.append(f"événement « {t} » émis et déclaré, mais aucun test `type ===` ne le traite")
    for c in emissions["commandes"]:
        if c in phases_ui:
            continue  # homonyme d'une phase d'interface — pas le même concept
        if c not in hud["ecoute_commandes"]:
            problemes.append(f"commande « {c} » émise par le Core, mais aucun test `cmd ===` ne la traite")

    problemes.extend(derive_declencheurs())
    return problemes


def derive_declencheurs() -> list[str]:
    """Les déclencheurs vocaux du HUD et du Core disent-ils la même chose ?

    Comparés par ``intent`` (contrat réel), pas par ``app_id`` — plusieurs
    capacités Core peuvent partager une tuile HUD (ex. connexions / devices.*).
    """
    import re

    src_cap = ROOT / "core" / "jarvis_core" / "capabilities.py"
    if not src_cap.exists():
        return []
    texte = src_cap.read_text(encoding="utf-8")

    core: dict[str, set[str]] = {}
    for bloc in re.findall(r'app_id="([^"]+)",(.*?)\n    \),', texte, re.S):
        _app_id, corps = bloc
        intent_m = re.search(r'intent="([^"]+)"', corps)
        if not intent_m:
            continue
        intention = intent_m.group(1)
        m = re.search(r"triggers=\((.*?)\)", corps, re.S)
        triggers = set(re.findall(r'"([^"]+)"', m.group(1))) if m else set()
        core.setdefault(intention, set()).update(triggers)

    problemes: list[str] = []
    for app in extraire_plugins():
        intention = app.get("intention")
        if not intention:
            continue
        aid = app["id"]
        cote_hud = set(app["declencheurs"])
        if intention not in core:
            if cote_hud:
                problemes.append(
                    f"tuile « {aid} » ({intention}) : déclencheurs vocaux HUD, aucune capacité Core"
                )
            continue
        cote_core = core.pop(intention)
        for mot in sorted(cote_hud - cote_core):
            problemes.append(
                f"déclencheur « {mot} » ({aid}/{intention}) : connu du HUD, inconnu du Core"
            )
        for mot in sorted(cote_core - cote_hud):
            problemes.append(
                f"déclencheur « {mot} » ({aid}/{intention}) : connu du Core, ABSENT du HUD"
            )

    # Intents vocaux sans tuile HUD (device.app_launch, media.pause…) : attendu.
    return problemes


def sortie_utf8() -> None:
    """Force UTF-8 sur stdout/stderr.

    Sous Git Bash — c'est-à-dire là où tourne le hook pre-commit — Python
    ouvre stdout en cp1252 et lève `UnicodeEncodeError` sur le premier `✓`.
    Le hook refusait donc le commit en annonçant une dérive de l'index, alors
    que le seul problème était un caractère non imprimable. Un garde-fou qui
    se trompe de motif est pire qu'un garde-fou absent : on apprend à
    l'ignorer.
    """
    for flux in (sys.stdout, sys.stderr):
        try:
            flux.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):  # flux redirigé, non reconfigurable
            pass


def main() -> int:
    sortie_utf8()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="ne rien écrire ; sortir 1 si generated/ a dérivé du code")
    args = ap.parse_args()

    fichiers = construire()
    GENERATED.mkdir(parents=True, exist_ok=True)

    derive = False
    for nom, contenu in fichiers.items():
        cible = GENERATED / nom
        actuel = cible.read_text(encoding="utf-8") if cible.exists() else None
        if args.check:
            if actuel != contenu:
                print(f"✗ {nom} — a dérivé du code (relancer `python architecture/build.py`)")
                derive = True
            else:
                print(f"✓ {nom}")
        else:
            cible.write_text(contenu, encoding="utf-8")
            lignes = contenu.count("\n")
            print(f"écrit  generated/{nom}  ({lignes} lignes)")

    problemes = incoherences()
    if problemes:
        print(f"\n⚠ {len(problemes)} incohérence(s) entre le Core et le HUD :")
        for p in problemes:
            print(f"   · {p}")
    else:
        print("\nAucune incohérence Core ↔ HUD.")

    return 1 if (args.check and derive) else 0


if __name__ == "__main__":
    raise SystemExit(main())
