"""Résolution `intention → exécutant` — la couche qui manquait.

Le volet Applications du HUD offre des **intentions** (« Maison », « Terminal »,
« Musique »). Il déclarait jusqu'ici un champ `hermesTool` dont **aucune valeur ne
correspondait à un outil réel** : `home_assistant`, `agent_reach`, `node_cerveau`…
Ces noms n'existent nulle part chez Hermes. Une tuile était donc un libellé, pas un
appel — et cliquer n'affichait qu'une notification.

Ce module est la table qui manquait. Il répond à trois questions, et à elles seules :

  1. **Qui exécute ?** Le Core lui-même, Hermes, ou un agent d'appareil.
  2. **Avec quoi ?** Un *toolset* Hermes, pas une liste d'outils. C'est la granularité
     réelle du moteur : `GET /v1/toolsets` renvoie 28 ensembles nommés, chacun avec son
     état `enabled` / `configured`. Nommer des outils un par un dériverait dès la
     première mise à jour d'Hermes ; nommer un toolset survit.
  3. **À quel prix ?** Un niveau de risque pour la Policy et une permission de session.

Ce que ce module ne fait **pas** : exécuter. Il décrit. L'exécution passe par
`IntentExecutor`, après `PolicyEngine.evaluate()` — jamais avant, jamais à côté.

⚠ Honnêteté du registre. Une intention sans exécutant réel porte `toolset=None` et
`available=False`. Elle n'est pas masquée : elle apparaît, et l'ouverture échoue avec
sa raison. C'est le mode de panne que ce dépôt paie depuis le début — « déclaré, jamais
appelé, et rien ne le signale » — et le seul remède est de rendre le trou visible.

── Nommage — `Capability` ici = IntentCapability ───────────────────────────────

Ce que ce module appelle `Capability` est une capacité **produit** : une intention
offerte à l'utilisateur (« Maison », « Terminal »…), au grain d'une tuile HUD. Dans
le vocabulaire du Tool Bus (audit 2026-08-07), c'est une **IntentCapability**.

Un second concept existe dans la vision, pas encore dans le code : la
**HostCapability** — une capacité au grain d'une *machine* (NUC, Pi, VPS, futur
téléphone), du type `camera.capture`, `microphone.input`, `speaker.output`,
`computer.screenshot`. Rien de tel n'existe ici : `Owner.DEVICE` déclare qu'un
agent d'appareil devrait répondre, mais aucun Device Manager ne résout encore
« quelle machine porte quelle capacité matérielle ».

La liaison visée, pas construite : `IntentCapability → Tool → HostCapability →
Device`. Ne pas renommer `Capability` en `IntentCapability` maintenant — le coût
d'un renommage à travers le dépôt (HUD compris) dépasse la valeur tant que
`HostCapability` n'existe pas pour justifier la distinction dans le code. Ce
commentaire est la distinction, jusqu'à ce qu'elle ait un second type en face
d'elle.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from enum import Enum

from .policy import Operation, RiskLevel


def _fold(text: str) -> str:
    """Minuscule sans accent — même repli que l'adaptateur Home Assistant.

    Sans ça, « allume la lumiere du salon » ne déclenchait RIEN : le déclencheur
    déclaré est « lumières », et une comparaison littérale rate à la fois
    l'accent et le pluriel. Or la transcription vocale ne restitue pas les
    accents de façon fiable — la commande la plus courante de la maison serait
    donc tombée dans la conversation, silencieusement.
    """
    normalized = unicodedata.normalize("NFD", str(text or "").lower().strip())
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


def _normalize_for_match(text: str) -> str:
    """Phrase entourée d'espaces, ponctuation/tirets → espaces (entrée + triggers)."""
    lowered = " " + " ".join(_fold(text).replace("'", " ").split()) + " "
    return "".join(c if c.isalnum() or c == " " else " " for c in lowered)


class Owner(str, Enum):
    """Qui réalise l'intention. L'utilisateur ne voit jamais cette valeur."""

    CORE = "core"
    """Le Core sait faire lui-même — aucun agent n'est consulté."""

    DEVICE = "device"
    """Relève d'un agent d'appareil (Windows, TV…). Device Manager absent : rien encore."""


class Display(str, Enum):
    """Comment le résultat atteint l'écran (`JARVIS-Agentic-UI.md` §1).

    Trois modes d'existence, un seul renderer. Le choix se fait **ici**, pas dans le
    HUD : une tuile ne décide pas de son mode d'affichage, sa capacité le déclare.
    """

    NATIVE = "native"
    """Une page produit React existe déjà. Aucune surface n'est composée."""

    PREFAB = "prefab"
    """Surface préfabriquée — document versionné, aucun LLM requis."""

    GENERATED = "generated"
    """Surface composée à la demande par le Planner. Exige un LLM."""


@dataclass(frozen=True)
class Capability:
    """IntentCapability — intention produit (tuile / voix).

    Le symbole reste `Capability` (pas de rename massif). Alias : `IntentCapability`.
    Ne pas confondre avec une **HostCapability** (capacité machine).
    """

    app_id: str
    """Identifiant de la tuile HUD — miroir de `hud/src/app/apps/catalog.ts`."""

    intent: str
    """Nom stable côté produit. C'est la clé du registre `IntentExecutor`."""

    owner: Owner
    risk: RiskLevel
    permission: str
    """Permission de session exigée pour seulement *voir* le résultat."""

    display: Display

    operation: Operation = Operation.READ
    """Type d'opération technique — axe orthogonal à `risk` (voir `policy.py`).

    `risk` dit la conséquence produit ; `operation` dit le geste technique.
    Sert la Policy (ex. `DESTRUCTIVE` exige toujours confirmation) et le futur
    journal de tool calls. Par défaut `READ` : la plupart des tuiles consultent
    plus qu'elles n'agissent."""

    toolset: str | None = None
    """Nom du toolset Hermes (`GET /v1/toolsets`). `None` = rien ne l'exécute."""

    triggers: tuple[str, ...] = ()
    """Mots qui routent une phrase vers cette intention.

    Miroir du champ `voice` de `hud/src/app/apps/catalog.ts`. Le doublon est
    volontaire — le Core ne peut pas dépendre du HUD pour décider d'un niveau de
    risque — mais il est **vérifié** : `python architecture/build.py --check`
    échoue si les deux listes divergent. Un déclencheur qui n'existe que d'un côté
    est soit une commande morte, soit une commande non protégée.
    """

    note: str = ""

    @property
    def available(self) -> bool:
        """Un exécutant réel existe-t-il ?

        `CORE` est toujours disponible : le code est là, dans ce dépôt.
        `DEVICE` dépend du Device Manager.
        """
        if self.owner is Owner.CORE:
            return True
        if self.owner is Owner.DEVICE:
            import os

            return os.environ.get("JARVIS_DEVICE_AGENT_ENABLED", "1").lower() in (
                "1",
                "true",
                "yes",
            )
        return False


# Alias documentaire Tool Bus — même objet, pas un second type.
# Capacités *physiques* (caméra, micro…) → `devices.HostCapability` / DeviceRegistry.
IntentCapability = Capability


# ── Le registre ──────────────────────────────────────────────────────────────
#
# Une ligne par tuile du volet Applications. L'ordre suit les catégories du HUD pour
# que les deux fichiers se relisent côte à côte.
#
# Les toolsets Hermes côté NUC (relevé 2026-08) : web, browser, terminal, file,
# code_execution, vision, skills, todo, memory, cronjob, …
# ⚠ ``homeassistant`` n'est PAS un toolset prod — domotique = Core → HA NUC.
#
# `operation` n'est explicite que là où elle diffère du défaut `Operation.READ`
# (dataclass) — la majorité des tuiles consultent plus qu'elles n'agissent, et
# le répéter partout aurait noyé les cas qui comptent (`WRITE`, `EXECUTE`).

CAPABILITIES: dict[str, Capability] = {
    # —— Système — le Core, et rien d'autre ————————————————————————————————
    #
    # Ces six tuiles étaient marquées « Hermes » dans le catalogue HUD. C'était une
    # erreur d'attribution : la Policy, l'auth, le routeur de modèles et les quotas
    # sont des organes du Core. Les déléguer à un agent reviendrait à demander à
    # l'IA de rapporter elle-même ce qu'elle a le droit de faire.
    "settings": Capability(
        app_id="settings", intent="core.preferences", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        operation=Operation.WRITE,
        note="Route Core `preferences`.",
        triggers=("paramètres", "settings", "réglages"),
    ),
    "jarvis": Capability(
        app_id="jarvis", intent="core.neural_map", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        note=(
            "NeuralMap — carte visuelle 3D du système, ouverte en surface HUD. "
            "Demande de MONTRER/AFFICHER/VISUALISER, pas une explication en texte."
        ),
        triggers=("noyau", "carte hermes", "neural"),
    ),
    "hub": Capability(
        app_id="hub", intent="core.dashboard", owner=Owner.CORE,
        risk=RiskLevel.ADMIN, permission="dashboard.access", display=Display.NATIVE,
        note="ADMIN seul. Le HUD passe par `requestDashboard`.",
        triggers=("dashboard", "admin", "cockpit"),
    ),
    "monitor": Capability(
        app_id="monitor", intent="core.monitor", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        note="Superviseur + liaisons `system.*`.",
        triggers=("moniteur", "cpu", "ressources"),
    ),
    "vision": Capability(
        app_id="vision", intent="core.holomat", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Surface CameraPreview + gestes. Caméra navigateur (kiosk NUC = USB LG).",
        triggers=(
            "holomat", "vision", "gestes",
            "caméra", "camera", "webcam", "visuel", "visuels",
            "montre la caméra", "montre la camera",
            "ce que tu vois", "flux caméra", "flux camera",
            "caméra lg", "camera lg", "thinq",
            "donne-moi un visuel", "donne moi un visuel",
        ),
    ),
    "security": Capability(
        app_id="security", intent="core.security", owner=Owner.CORE,
        risk=RiskLevel.ADMIN, permission="dashboard.access", display=Display.GENERATED,
        note="Policy + auth. Était attribué à Hermes — mauvais propriétaire.",
        triggers=("sécurité", "policy", "auth"),
    ),
    "cerveau": Capability(
        app_id="cerveau", intent="core.providers", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="AI Provider Manager (`providers.py`). Était attribué à Hermes.",
        triggers=("cerveau", "llm"),
    ),
    "tokens": Capability(
        app_id="tokens", intent="core.usage", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Route Core `usage`. Était attribué à Hermes.",
        triggers=("tokens", "quota"),
    ),
    "mission-control-dev": Capability(
        app_id="mission-control-dev", intent="core.mission_dev", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        note="Route Core `mission_dev` + kanban Hermes (skills) au démarrage projet.",
        # Plus de « mission control » nu : ça volait Mission Control Home.
        triggers=("mission control dev", "mission-control-dev", "mission ctrl dev"),
    ),
    "dev-board-create": Capability(
        app_id="mission-control-dev", intent="dev.board.create", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        note="Crée un ticket kanban Mission DEV (voix).",
        triggers=(
            "nouveau ticket", "nouvelle ticket", "crée un ticket", "cree un ticket",
            "créer un ticket", "create ticket", "nouvelle tache", "nouvelle tâche",
        ),
    ),
    "dev-board-assign": Capability(
        app_id="mission-control-dev", intent="dev.board.assign", owner=Owner.CORE,
        risk=RiskLevel.MEDIA, permission="system.read", display=Display.NATIVE,
        note="Assigne un ticket à cursor/claude.",
        triggers=(
            "assigne à cursor", "assigne a cursor", "assigne à claude", "assigne a claude",
            "assign to cursor", "assign to claude",
        ),
    ),
    "dev-board-start-run": Capability(
        app_id="mission-control-dev", intent="dev.board.start_run", owner=Owner.CORE,
        risk=RiskLevel.HOME, permission="system.read", display=Display.NATIVE,
        operation=Operation.EXECUTE,
        note="Lance dev.agent.run sur le ticket en cours (Policy + P5).",
        triggers=("lance le run", "lance run", "démarre le run", "demarre le run", "start run"),
    ),
    "cursor": Capability(
        app_id="cursor", intent="core.cursor", owner=Owner.DEVICE,
        risk=RiskLevel.MEDIA, permission="media.control", display=Display.NATIVE,
        operation=Operation.EXECUTE,
        note="Lancement via agent local (app.launch) — milestone test_app puis Cursor.",
        triggers=("cursor", "éditeur cursor", "ouvre cursor"),
    ),
    # Liste des capacités — surface ResultPanel, sans Hermes
    "capabilities": Capability(
        app_id="reach", intent="system.capabilities", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Liste les intentions disponibles (ResultPanel).",
        triggers=(
            "quels outils", "quel outils", "tes outils", "tes capacités",
            "que peux-tu", "que peux tu", "de quoi disposes", "tes fonctions",
            "what can you do", "your tools", "capabilities",
        ),
    ),
    "introspect": Capability(
        app_id="reach", intent="system.introspect", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Parcourt compétences Hermes, catalogue UI, intentions Core.",
        triggers=(
            "tes compétences", "tes skills", "ton code", "parcours ton code",
            "ce que tu peux faire", "ce que tu sais faire", "introspection", "catalogue ui",
            "tes skills hermes", "lis tes skills",
        ),
    ),
    # Recherche web — outil hébergé Anthropic (`web_search_20260209`), pas de
    # Hermes derrière. Retiré avec Hermes le 2026-08-17 sans remplaçant ; JARVIS
    # répondait honnêtement « pas d'outil de recherche » — vrai, mais un vrai
    # manque produit. `chat_research_route.looks_like_web_search()` sert de
    # filet plus large (regex) entre les triggers exacts ci-dessous et le
    # routage sémantique — voir l'ordre Gateway dans `ws/handlers/chat.py`.
    "web-search": Capability(
        app_id="reach", intent="web.search", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="web.read", display=Display.GENERATED,
        note="Recherche web réelle via l'outil hébergé Anthropic — jamais Hermes/ddgs maison.",
        triggers=(
            "cherche sur internet", "cherche sur le web", "recherche web",
            "cherche sur google", "sur google", "google search",
            "cherche moi", "va chercher", "recherche sur",
            "search for", "look up", "lookup",
        ),
    ),
    # Architecture Awareness — joignable depuis le chat (triggers).
    # Pas de tuile HUD, pas de TTS : chat_reply uniquement.
    "architecture-explain": Capability(
        app_id="architecture-explain",
        intent="architecture.explain",
        owner=Owner.CORE,
        risk=RiskLevel.INFO,
        permission="system.read",
        display=Display.NATIVE,
        operation=Operation.READ,
        note="Architecture Awareness — snapshot + explain_live. Chat only, pas de HUD / TTS.",
        triggers=(
            "comment tu fonctionnes",
            "comment fonctionnes tu",
            "how do you work",
            "architecture générale",
            "où tourne hermes",
            "où est hermes",
            "where does hermes",
        ),
    ),
    # —— Memory V2 M4 — Hermes → Core MemoryAPI (pas de tuile HUD, pas de voix) —
    "memory-search": Capability(
        app_id="memory-search",
        intent="memory.search",
        owner=Owner.CORE,
        risk=RiskLevel.INFO,
        permission="memory.read",
        display=Display.NATIVE,
        operation=Operation.READ,
        note="M4 — jarvis_memory_search. Lecture MemoryAPI, résultats non exécutoires.",
    ),
    "memory-recall": Capability(
        app_id="memory-recall",
        intent="memory.recall",
        owner=Owner.CORE,
        risk=RiskLevel.INFO,
        permission="memory.read",
        display=Display.NATIVE,
        operation=Operation.READ,
        note="M4 — jarvis_memory_recall. Lecture MemoryAPI, résultats non exécutoires.",
    ),
    "memory-store-note": Capability(
        app_id="memory-store-note",
        intent="memory.store_note",
        owner=Owner.CORE,
        risk=RiskLevel.INFO,
        permission="memory.read",
        display=Display.NATIVE,
        operation=Operation.WRITE,
        note="M4 — jarvis_memory_store_note. kind=note, writer=hermes. Pas de mission_result / forget.",
    ),
    # —— HUD / session — actions quotidiennes, SANS Hermes ————————————————
    #
    # Verrouiller, mute, veille, fermer un *espace* (app JARVIS, pas une
    # fenêtre HA) : état React. Le Core envoie `hud_command` ; le HUD exécute.
    "hud-lock": Capability(
        app_id="hud-lock", intent="hud.lock", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        operation=Operation.WRITE,
        note="Verrouille la session HUD.",
        # Pas de « verrouillage » / « veille » nus : la phrase TTS
        # « Verrouillage automatique. Mise en veille… » était réécoutée par le
        # micro et re-routée → soft-lock en boucle (kiosk collé au PIN).
        triggers=(
            "verrouille la session",
            "verrouille-toi",
            "verrouille toi",
            "lock session",
            "verrouille le hud",
        ),
    ),
    "hud-idle": Capability(
        app_id="hud-idle", intent="hud.idle", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        operation=Operation.WRITE,
        note="Mode veille HUD — ferme les espaces ouverts.",
        triggers=(
            "mode veille", "mets-toi en veille", "met toi en veille",
            "repos", "standby",
        ),
    ),
    "hud-close": Capability(
        app_id="hud-close", intent="hud.close_space", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        operation=Operation.WRITE,
        note="Ferme l'espace (app) actif ou tous les espaces.",
        triggers=(
            "ferme l'espace", "ferme les espaces", "ferme la fenêtre",
            "ferme les fenêtres", "ferme tout", "ferme l espace",
            "close space", "ferme l'application",
        ),
    ),
    "hud-close-app": Capability(
        app_id="hud-close", intent="hud.close_app", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        operation=Operation.WRITE,
        note="Ferme un espace HUD nommé — distinct de l'ouverture (`core.preferences`, etc.).",
        triggers=(
            "ferme les paramètres", "ferme les parametres",
            "ferme le panneau paramètres", "ferme le panneau parametres",
            "ferme les réglages", "ferme les reglages",
            "ferme la maison", "ferme home assistant",
            "ferme la vision", "ferme holomat", "ferme les gestes",
            "ferme le moniteur", "ferme la musique",
            "ferme netflix", "ferme disney", "ferme youtube", "ferme prime",
        ),
    ),
    "hud-toggle-app": Capability(
        app_id="hud-toggle", intent="hud.toggle_space", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        operation=Operation.WRITE,
        note=(
            "Bascule un espace HUD nommé (open↔close) — même cible que "
            "`hud.close_app`, troisième action du même domaine que "
            "`core.preferences`/`hud.close_app`, pas une capacité séparée."
        ),
        triggers=(
            "bascule les paramètres", "bascule les parametres",
            "bascule le panneau paramètres", "bascule le panneau parametres",
            "toggle les paramètres", "toggle les parametres",
            "toggle le panneau paramètres", "toggle le panneau parametres",
            "bascule les réglages", "bascule les reglages",
            "bascule la maison", "bascule la vision", "bascule holomat",
            "bascule les gestes", "bascule le moniteur", "bascule la musique",
        ),
    ),
    "hud-mute": Capability(
        app_id="hud-mute", intent="hud.mute", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        operation=Operation.WRITE,
        note="Coupe micro + wake (écoute).",
        triggers=(
            "coupe le son", "coupe le micro", "mute", "mets en sourdine",
            "silence", "ne m'écoute plus",
        ),
    ),
    "hud-unmute": Capability(
        app_id="hud-unmute", intent="hud.unmute", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        operation=Operation.WRITE,
        note="Réactive micro + wake.",
        triggers=(
            "remets le son", "allume le micro", "unmute", "réactive le micro",
            "écoute-moi", "remets le micro",
        ),
    ),
    "hud-camera-on": Capability(
        app_id="hud-camera-on", intent="hud.camera_on", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        operation=Operation.WRITE,
        note="Réveille la caméra du navigateur (portable ou NUC).",
        triggers=(
            "allume la caméra", "allume la camera", "ouvre la caméra",
            "active la caméra", "réveille la caméra",
        ),
    ),
    "hud-camera-off": Capability(
        app_id="hud-camera-off", intent="hud.camera_off", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        operation=Operation.WRITE,
        note="Coupe la caméra navigateur.",
        triggers=(
            "coupe la caméra", "coupe la camera", "éteins la caméra",
            "ferme la caméra", "arrête la caméra",
        ),
    ),
    # Enrôlement foyer : admin parle (session laptop / chat) → UI s'ouvre sur le kiosk NUC.
    "hud-enroll": Capability(
        app_id="hud-enroll", intent="hud.enroll", owner=Owner.CORE,
        risk=RiskLevel.ADMIN, permission="dashboard.access", display=Display.NATIVE,
        operation=Operation.WRITE,
        note="Ouvre l'enrôlement sur le kiosk maison (Holomat face + voix).",
        triggers=(
            "enrôle", "enrole", "enrôler", "enroler", "inscris", "inscrit",
            "nouvel utilisateur", "nouveau profil", "ajoute un profil",
            "enrollment", "enrôlement", "enrolement", "family enroll",
            "inscris ma", "inscris mon", "ajoute ma", "ajoute mon",
        ),
    ),
    "media-pause": Capability(
        app_id="music", intent="media.pause", owner=Owner.CORE,
        risk=RiskLevel.MEDIA, permission="media.control", display=Display.NATIVE,
        operation=Operation.WRITE,
        note="Pause média via HA media_player (déterministe).",
        triggers=(
            "coupe la musique", "arrête la musique", "pause musique",
            "stop musique", "coupe le son de la musique", "pause la musique",
        ),
    ),
    "media-streaming": Capability(
        app_id="video", intent="media.streaming", owner=Owner.CORE,
        risk=RiskLevel.MEDIA, permission="media.control", display=Display.GENERATED,
        operation=Operation.WRITE,
        note="Netflix / Disney+ / YouTube — Home Assistant NUC (`media_player.play_media`).",
        triggers=(
            "netflix", "disney", "disney+", "youtube", "prime video", "amazon prime", "prime",
            "regarde sur netflix", "lance netflix", "ouvre disney", "lance prime",
            "montre la cam", "affiche la cam", "caméra salon", "camera salon",
            "flux salon", "voir le salon",
        ),
    ),
    # —— Maison ————————————————————————————————————————————————————————————
    #
    # ⚠ CORE, pas Hermes — et c'est une correction, pas un choix de départ.
    #
    # La première version déléguait à Hermes, qui demandait à un modèle 8B de
    # deviner quel outil appeler : 475 secondes pour allumer une lampe, et des
    # résultats inventés dès qu'on lui exposait plus d'une dizaine d'outils.
    #
    # Deux textes l'interdisaient déjà :
    #   · `JARVIS-Satellites.md` — « Core → Home Assistant Adapter → HA API » ;
    #     Hermes ne figure pas dans ce chemin ;
    #   · cahier des charges §11 — « Mode 3, sans LLM : le Core continue (HA,
    #     Plex, Holomat…) ». La domotique doit tenir SANS modèle.
    #
    # Une lampe ne se pilote pas par inférence. Ce qui reste à Hermes, c'est ce
    # qui demande un jugement : « prépare le salon cinéma », une demande ambiguë.
    "home": Capability(
        app_id="home", intent="home.control", owner=Owner.CORE,
        risk=RiskLevel.HOME, permission="home.control", display=Display.GENERATED,
        operation=Operation.WRITE,
        note="Adaptateur Core `homeassistant.py` — déterministe, sans LLM.",
        # "maison" / "domotique" / "home" nus retirés (2026-08-15, chantier
        # Orchestration conversationnelle, P.5) : ce sont des mots de SUJET
        # (ils nomment un domaine), pas des verbes d'action — « regarde si
        # tout va bien à la maison » matchait `home.control` sur le seul mot
        # "maison", alors que la phrase ne demande AUCUNE action. Les phrases
        # composées qui nomment vraiment une action (« ouvre la maison »,
        # « ouvre home ») restent, inchangées. Les verbes d'action nus
        # (« allume », « éteint »…) restent aussi : eux portent un ordre sans
        # ambiguïté. Une phrase d'observation sans verbe d'action tombe
        # maintenant en routage sémantique (`capability_routing.py`), qui sait
        # dire « aucune capacité appropriée » plutôt que de deviner une action.
        triggers=(
            "lumière", "lumières", "lampe", "home assistant",
            "ouvre home", "affiche home", "affiche-moi home",
            "mission control home", "mission contrôle home", "mission controle home",
            "ouvre la maison", "affiche la maison",
            "allume", "éteint", "eteint", "allume le salon", "éteint le salon",
        ),
    ),
    # —— Caméra satellite —————————————————————————————————————————————————
    #
    # Une seule source dans tout l'écosystème : le flux MJPEG déjà exposé par
    # `jarvis_cam.py` sur pi-salon (LG AN-VC500). `device_id`/`source` sont
    # toujours explicites — jamais la webcam locale du HUD (`vision.analyze`
    # capte ça, c'est un chemin différent, volontairement pas réutilisé ici).
    "camera_list": Capability(
        app_id="camera_list", intent="home.camera_list", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="home.camera", display=Display.GENERATED,
        operation=Operation.READ,
        note="Liste des caméras connues (DeviceRegistry, capability camera.capture).",
        triggers=("quelles caméras", "liste des caméras"),
    ),
    "camera_view": Capability(
        app_id="camera_view", intent="home.camera_view", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="home.camera", display=Display.GENERATED,
        operation=Operation.READ,
        note="Ouvre le flux LIVE pi-salon côté HUD (jeton signé courte durée).",
        triggers=(
            "affiche la caméra", "affiche la caméra du salon", "montre la caméra",
            "montre-moi le salon", "regarde ce qui se passe au salon",
            "regarde le salon", "caméra du salon", "caméra salon",
        ),
    ),
    "camera_snapshot": Capability(
        app_id="camera_snapshot", intent="home.camera_snapshot", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="home.camera", display=Display.GENERATED,
        operation=Operation.READ,
        note="Une image pi-salon ; `analyze=true` la passe au pipeline Vision existant.",
        triggers=(
            "prends une image", "prends une photo", "photo du salon",
            "prends une image de la caméra", "snapshot du salon", "snapshot caméra",
        ),
    ),
    # —— Médias ————————————————————————————————————————————————————————————
    # ⚠ CORE depuis le 2026-08-05 — même correction que `home.control`, et pour
    # le même motif écrit noir sur blanc au §11 : « Mode 3, sans LLM : le Core
    # continue (HA, **Plex**, Holomat…) ». Plex y est nommé.
    #
    # `DEVICE` promettait un Device Manager qui n'existe pas ; la tuile était donc
    # visible et morte. Le chemin réel, mesuré : API Plex pour le catalogue et le
    # marque-page, puis un lien `plex://` remis au lecteur. Aucun modèle consulté.
    "video": Capability(
        app_id="video", intent="media.video", owner=Owner.CORE,
        risk=RiskLevel.MEDIA, permission="media.control", display=Display.GENERATED,
        operation=Operation.WRITE,
        note="Adaptateur Core `plex.py` — déterministe, sans LLM.",
        triggers=(
            "vidéo", "video", "film", "plex", "série", "serie", "épisode", "episode",
            "mets", "lance", "play",
        ),
    ),
    "code": Capability(
        app_id="code", intent="vps.code", owner=Owner.CORE,
        risk=RiskLevel.VPS, permission="console.read", display=Display.GENERATED,
        operation=Operation.WRITE,
        note="Liste projets (JARVIS_PROJECTS_ROOT) + note éditeur ; Hermes file pour le reste.",
        triggers=("code", "vscode", "éditeur", "editeur"),
    ),
    "network": Capability(
        app_id="network", intent="system.network", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Topologie DeviceRegistry + services amont (Core in-process).",
        triggers=("réseau", "wifi", "lan"),
    ),
    "connexions": Capability(
        app_id="connexions", intent="devices.list", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Liste DeviceRegistry + inventaire logiciel par agent.",
        triggers=("connexions", "entités", "appareils connectés"),
    ),
    "software": Capability(
        app_id="connexions", intent="devices.software", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Inventaire logiciel des agents Windows (app.software.*).",
        triggers=(
            "logiciels installés",
            "applications installées",
            "apps du pc",
            "logiciels du portable",
            "mes applications",
        ),
    ),
    "pc-health": Capability(
        app_id="connexions", intent="devices.metrics", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Métriques CPU/RAM/disque des agents Windows (system.metrics).",
        triggers=(
            "analyser mon pc",
            "analyse mon pc",
            "analyser le pc",
            "état du pc",
            "santé du pc",
            "santé du portable",
            # Ajouté (2026-08-15) : couvre littéralement « analyse la santé de
            # mon portable » — plus long que le seul "analyse" retiré de
            # `data.analyze`, donc gagnant par la règle existante du
            # déclencheur le plus long, sans nouveau mécanisme.
            "santé de mon portable",
            "métriques du pc",
            "charge du pc",
            # Ajouté (2026-08-15, finition V1 — stabilisation post-audit) :
            # « pourquoi mon portable rame » passait par le resolver sémantique
            # (LLM) faute de trigger déterministe. Composé, pas un mot seul :
            # "rame" isolé collisionnerait ("il rame vers la rive").
            "portable rame", "pc rame",
        ),
    ),
    "device-launch": Capability(
        app_id="connexions", intent="device.app_launch", owner=Owner.DEVICE,
        risk=RiskLevel.MEDIA, permission="media.control", display=Display.NATIVE,
        operation=Operation.EXECUTE,
        note="Lance une app inventoriée sur l'agent Windows (match phrase → app_id).",
        triggers=("ouvre l'application", "lance l'application", "ouvre l application"),
    ),
    "reseau": Capability(
        app_id="reseau", intent="devices.topology", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Topologie DeviceRegistry (Core in-process).",
        triggers=("topologie", "mesh", "réseau jarvis"),
    ),
    # —— Terminal admin Dashboard — VPS / Pi salon (SSH sortant dédié) ———————
    #
    # Pas des tuiles HUD : ces deux intentions n'existent que pour donner un
    # `risk`/`operation` à la Policy et un exécutant à `IntentExecutor`, côté
    # Terminal du Dashboard admin (`ws/handlers/terminal.py`). `Owner.CORE` est
    # exact ici : `remote_exec.py` tourne en process, aucun agent consulté —
    # contrairement à `system.shell` (NUC) qui, lui, passe par Hermes.
    "vps-terminal": Capability(
        app_id="vps-terminal", intent="vps.terminal", owner=Owner.CORE,
        risk=RiskLevel.VPS, permission="console.read", display=Display.NATIVE,
        operation=Operation.EXECUTE,
        note="Dashboard → VPS via SSH dédié (remote_exec.py). Policy VPS allowlist.",
    ),
    "pi-terminal": Capability(
        app_id="pi-terminal", intent="pi.terminal", owner=Owner.CORE,
        risk=RiskLevel.ADMIN, permission="console.read", display=Display.NATIVE,
        operation=Operation.EXECUTE,
        note="Dashboard → Pi salon via SSH dédié (remote_exec.py). Confirmation systématique.",
    ),
    "objectifs": Capability(
        app_id="objectifs", intent="core.missions", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        operation=Operation.WRITE,
        note="Magasin local data/missions.json — ajout / liste / clôture.",
        triggers=("objectifs", "buts", "objectif", "goal", "goals"),
    ),
    "vision-analyze": Capability(
        app_id="vision", intent="vision.analyze", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        operation=Operation.READ,
        note=(
            "Snapshot HUD (type:perception) → délégation Hermes vision_analyze. "
            "Distinct de holomat/face_frame."
        ),
        triggers=(
            "qu'est-ce que je te montre", "quest ce que je te montre",
            "qu est ce que je te montre",
            "décris ce que tu vois", "decris ce que tu vois",
            "qu'est-ce que c'est", "quest ce que c est",
            "identifie ce", "reconnais ce", "analyse ce que tu vois",
        ),
    ),
    "vision-scene": Capability(
        app_id="vision-scene", intent="vision.scene", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        operation=Operation.READ,
        note=(
            "Contexte SceneStore (Vision Worker → VISION_OBJECT_*). "
            "Sans snapshot, sans Hermes — lecture seule du suivi temps réel."
        ),
        triggers=(
            "que vois-tu", "que vois tu", "que vois-tu en ce moment",
            "que vois tu en ce moment", "objets détectés", "objets detectes",
            "scène courante", "scene courante", "qu'est-ce qu'il y a devant",
            "quest ce qu il y a devant",
        ),
    ),
}


# ── Ce que chaque rôle a le droit de déléguer ────────────────────────────────
#
# Miroir volontaire de `ROLE_PERMISSIONS` dans `surface.py` : là-bas ce qu'on a le
# droit de VOIR, ici ce qu'on a le droit de FAIRE FAIRE. Les deux sont fail-closed —
# un rôle inconnu n'obtient rien.
#
# Permissions qui n'appartiennent qu'à l'administrateur. Volontairement une liste
# courte et explicite plutôt qu'un calcul : « ADMIN seul accède au Dashboard » est une
# loi produit, pas une conséquence d'un tableau.
ADMIN_ONLY_PERMISSIONS: set[str] = {"dashboard.access"}


def allows(cap: Capability, role: str | None) -> bool:
    """Ce rôle a-t-il le droit de **demander** cette intention ?

    Distinct de `surface.permissions_for()`, qui dit ce qu'on a le droit de *voir*.
    Un même mot — « permission » — recouvre deux questions ; les confondre ferait
    dépendre l'action d'un catalogue de composants d'interface.
    """
    if cap.permission in ADMIN_ONLY_PERMISSIONS:
        return str(role or "").lower() == "admin"
    return True


def match_intent(text: str) -> Capability | None:
    """Route une phrase vers une intention — ou refuse de deviner.

    Trois règles, toutes nées du risque que ça porte : une erreur d'aiguillage
    ici n'affiche pas la mauvaise page, elle **agit** sur la mauvaise chose.

    1. **Le déclencheur le plus long gagne.** « mission control dev » doit primer
       sur « mission control », et « éditeur cursor » sur « code ». Prendre la
       première correspondance rencontrée, comme le fait `findAppByVoice()` côté
       HUD, dépend de l'ordre de déclaration — donc du hasard.

    2. **Une égalité ne tranche pas.** Deux capacités qui matchent avec la même
       longueur rendent `None` : mieux vaut laisser la phrase partir en
       conversation que d'ouvrir un ouvrant parce qu'un mot était ambigu.
       `architecture/build.py` signale déjà ces collisions sous
       `declencheurs_ambigus` — ceci en est la conséquence à l'exécution.

    3. **Aucune correspondance n'est un échec.** C'est le cas ordinaire : la
       plupart des phrases sont des questions, pas des commandes.

    4. **Un déclencheur est un mot, pas une syllabe.** La phrase était entourée
       d'espaces, mais le déclencheur ne l'était pas : « lan » (réseau) se
       trouvait donc dans « **lan**ce farscape », et « lance un film » partait
       diagnostiquer le réseau. Même famille que « lumiere » raté faute d'accent —
       une correspondance approximative qui agit sur la mauvaise chose. La
       ponctuation est ramenée à des espaces pour que « allume les lumières. »
       continue de correspondre.
    """
    lowered = _normalize_for_match(text)
    if not lowered.strip():
        return None

    best: list[Capability] = []
    best_len = 0
    for cap in CAPABILITIES.values():
        for trigger in cap.triggers:
            if f" {_normalize_for_match(trigger).strip()} " not in lowered:
                continue
            if len(trigger) > best_len:
                best, best_len = [cap], len(trigger)
            elif len(trigger) == best_len and cap not in best:
                best.append(cap)

    if len(best) == 1:
        return best[0]
    if len(best) > 1:
        picked = _disambiguate_intent(lowered, best)
        if picked is not None:
            return picked
    return None


# Plateformes streaming — si présentes, `media.streaming` l'emporte sur les
# verbes génériques (`regarde`) ou les recherches web (`youtube` seul).
_STREAMING_MARKERS: tuple[str, ...] = (
    "netflix", "disney", "disney plus", "youtube",
    "prime video", "amazon prime", "prime",
)


def _disambiguate_intent(lowered: str, candidates: list["Capability"]) -> "Capability | None":
    """Tranche une égalité de longueur — sans deviner au hasard."""
    if _has_streaming_platform(lowered):
        streaming = [c for c in candidates if c.intent == "media.streaming"]
        if streaming:
            return streaming[0]

    close_app = [c for c in candidates if c.intent == "hud.close_app"]
    open_prefs = [c for c in candidates if c.intent == "core.preferences"]
    if close_app and not open_prefs:
        return close_app[0]

    holomat = [c for c in candidates if c.intent == "core.holomat"]
    camera = [c for c in candidates if c.intent == "home.camera_view"]
    if holomat and camera:
        if " salon " in lowered:
            return camera[0]
        return holomat[0]

    return None


def _has_streaming_platform(lowered: str) -> bool:
    return any(f" {_fold(m)} " in lowered for m in _STREAMING_MARKERS)


def for_app(app_id: str) -> Capability | None:
    return CAPABILITIES.get(app_id)


def for_intent(intent: str) -> Capability | None:
    for cap in CAPABILITIES.values():
        if cap.intent == intent:
            return cap
    return None


def all_toolsets() -> set[str]:
    """Tous les toolsets qu'une capacité nomme."""
    return {c.toolset for c in CAPABILITIES.values() if c.toolset}


def toolsets_for(role: str | None) -> set[str]:
    """Compatibilité API : aucun toolset agent n'est exposé par le Core."""
    return set()
