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
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from enum import Enum

from .policy import RiskLevel


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


class Owner(str, Enum):
    """Qui réalise l'intention. L'utilisateur ne voit jamais cette valeur."""

    CORE = "core"
    """Le Core sait faire lui-même — aucun agent n'est consulté."""

    HERMES = "hermes"
    """Délégué à l'agent, via un toolset explicitement autorisé pour la session."""

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
    """Une intention offerte à l'utilisateur, et tout ce qu'il faut pour la tenir."""

    app_id: str
    """Identifiant de la tuile HUD — miroir de `hud/src/app/apps/catalog.ts`."""

    intent: str
    """Nom stable côté produit. C'est la clé du registre `IntentExecutor`."""

    owner: Owner
    risk: RiskLevel
    permission: str
    """Permission de session exigée pour seulement *voir* le résultat."""

    display: Display

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

        `CORE` est toujours disponible : le code est là, dans ce dépôt. `HERMES` exige
        un toolset nommé. `DEVICE` n'a aucun exécutant tant que le Device Manager
        n'existe pas — le déclarer disponible serait mentir.
        """
        if self.owner is Owner.CORE:
            # Stubs CORE sans exécutant réel (déclarés dans le registre « sans outil »).
            if self.intent in {"system.network", "core.missions"}:
                return False
            return True
        if self.owner is Owner.HERMES:
            return self.toolset is not None
        return False


# ── Le registre ──────────────────────────────────────────────────────────────
#
# Une ligne par tuile du volet Applications. L'ordre suit les catégories du HUD pour
# que les deux fichiers se relisent côte à côte.
#
# Les toolsets nommés ici sont ceux que le NUC expose réellement (relevé du
# 2026-08-05, Hermes 0.20.0) : web, browser, terminal, file, code_execution, vision,
# video, image_gen, video_gen, bfl, x_search, tts, stt, skills, todo, memory,
# context_engine, session_search, clarify, delegation, cronjob, homeassistant,
# spotify, discord, discord_admin, yuanbao, computer_use, a2a.

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
        note="Route Core `preferences`.",
        triggers=("paramètres", "settings", "réglages"),
    ),
    "jarvis": Capability(
        app_id="jarvis", intent="core.neural_map", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        note="NeuralMap — vue HUD locale.",
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
        note="Route Core `mission_dev`. Le kanban d'Hermes reste à raccorder.",
        triggers=("mission control dev", "mission-control-dev", "mission control"),
    ),
    "cursor": Capability(
        app_id="cursor", intent="core.cursor", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
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
            "ce que tu peux faire", "introspection", "catalogue ui",
            "tes skills hermes", "lis tes skills",
        ),
    ),
    # —— HUD / session — actions quotidiennes, SANS Hermes ————————————————
    #
    # Verrouiller, mute, veille, fermer un *espace* (app JARVIS, pas une
    # fenêtre HA) : état React. Le Core envoie `hud_command` ; le HUD exécute.
    "hud-lock": Capability(
        app_id="hud-lock", intent="hud.lock", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        note="Verrouille la session HUD.",
        triggers=(
            "verrouille", "verrouiller", "verrouille la session",
            "verrouillage", "lock session", "verrouille-toi",
        ),
    ),
    "hud-idle": Capability(
        app_id="hud-idle", intent="hud.idle", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        note="Mode veille HUD — ferme les espaces ouverts.",
        triggers=(
            "mode veille", "mets-toi en veille", "met toi en veille",
            "veille", "repos", "standby",
        ),
    ),
    "hud-close": Capability(
        app_id="hud-close", intent="hud.close_space", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        note="Ferme l'espace (app) actif ou tous les espaces.",
        triggers=(
            "ferme l'espace", "ferme les espaces", "ferme la fenêtre",
            "ferme les fenêtres", "ferme tout", "ferme l espace",
            "close space", "ferme l'application",
        ),
    ),
    "hud-mute": Capability(
        app_id="hud-mute", intent="hud.mute", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        note="Coupe micro + wake (écoute).",
        triggers=(
            "coupe le son", "coupe le micro", "mute", "mets en sourdine",
            "silence", "ne m'écoute plus",
        ),
    ),
    "hud-unmute": Capability(
        app_id="hud-unmute", intent="hud.unmute", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        note="Réactive micro + wake.",
        triggers=(
            "remets le son", "allume le micro", "unmute", "réactive le micro",
            "écoute-moi", "remets le micro",
        ),
    ),
    "hud-camera-on": Capability(
        app_id="hud-camera-on", intent="hud.camera_on", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
        note="Réveille la caméra du navigateur (portable ou NUC).",
        triggers=(
            "allume la caméra", "allume la camera", "ouvre la caméra",
            "active la caméra", "réveille la caméra",
        ),
    ),
    "hud-camera-off": Capability(
        app_id="hud-camera-off", intent="hud.camera_off", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.NATIVE,
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
        note="Pause média via HA media_player (déterministe).",
        triggers=(
            "coupe la musique", "arrête la musique", "pause musique",
            "stop musique", "coupe le son de la musique", "pause la musique",
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
        note="Adaptateur Core `homeassistant.py` — déterministe, sans LLM.",
        triggers=("maison", "domotique", "lumière", "lumières", "lampe", "home assistant"),
    ),
    # —— Médias ————————————————————————————————————————————————————————————
    "music": Capability(
        app_id="music", intent="media.music", owner=Owner.HERMES, toolset="spotify",
        risk=RiskLevel.MEDIA, permission="media.control", display=Display.GENERATED,
        note="Toolset spotify — 7 outils, désactivé côté Hermes aujourd'hui.",
        triggers=("musique", "spotify", "plex audio"),
    ),
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
        note="Adaptateur Core `plex.py` — déterministe, sans LLM.",
        triggers=("vidéo", "video", "film", "plex", "série", "serie", "épisode", "episode", "regarde"),
    ),
    # —— Hermes ————————————————————————————————————————————————————————————
    "reach": Capability(
        app_id="reach", intent="web.search", owner=Owner.HERMES, toolset="web",
        risk=RiskLevel.INFO, permission="web.read", display=Display.GENERATED,
        note="web_search · web_extract.",
        triggers=(
            "internet", "agent-reach", "agent reach", "recherche web",
            "cherche", "trouve", "propose", "recherche",
            "nouvelles", "actualité", "actualites", "actualités",
            "cherche sur internet", "cherche sur le web", "cherche sur youtube",
            "cherche sur github", "github", "youtube", "reddit", "rss", "openclaw",
        ),
    ),
    "browser": Capability(
        app_id="browser", intent="web.browse", owner=Owner.HERMES, toolset="browser",
        risk=RiskLevel.INFO, permission="web.read", display=Display.GENERATED,
        triggers=("navigateur", "browser", "holoweb"),
    ),
    "files": Capability(
        app_id="files", intent="files.browse", owner=Owner.HERMES, toolset="file",
        risk=RiskLevel.ADMIN, permission="files.read", display=Display.GENERATED,
        note="read_file · write_file · patch · search_files.",
        triggers=("fichiers", "dossier", "explorer"),
    ),
    "terminal": Capability(
        app_id="terminal", intent="system.shell", owner=Owner.HERMES, toolset="terminal",
        risk=RiskLevel.VPS, permission="console.read", display=Display.GENERATED,
        note="Allowlist appliquée par la Policy, pas par Hermes.",
        triggers=("terminal", "shell", "console ssh"),
    ),
    "analyze": Capability(
        app_id="analyze", intent="data.analyze", owner=Owner.HERMES, toolset="code_execution",
        risk=RiskLevel.ADMIN, permission="console.read", display=Display.GENERATED,
        triggers=("analyse", "stats", "données"),
    ),
    "skills": Capability(
        app_id="skills", intent="agent.skills", owner=Owner.HERMES, toolset="skills",
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        triggers=("skills", "compétences"),
    ),
    "outils": Capability(
        app_id="outils", intent="agent.tools", owner=Owner.HERMES, toolset="skills",
        risk=RiskLevel.ADMIN, permission="dashboard.access", display=Display.GENERATED,
        note="skill_manage écrit des compétences — ADMIN.",
        triggers=("outils", "tools", "tool manager"),
    ),
    "crons": Capability(
        app_id="crons", intent="agent.cron", owner=Owner.HERMES, toolset="cronjob",
        risk=RiskLevel.ADMIN, permission="dashboard.access", display=Display.GENERATED,
        triggers=("cron", "planifié", "schedule"),
    ),
    # —— Déclarées, sans exécutant. Visibles exprès ————————————————————————
    #
    # `toolset=None` : l'ouverture échouera en disant pourquoi. Les masquer ferait
    # croire que le volet est complet.
    "docker": Capability(
        app_id="docker", intent="vps.docker", owner=Owner.HERMES,
        risk=RiskLevel.VPS, permission="console.read", display=Display.GENERATED,
        note="Aucun toolset docker chez Hermes — passerait par `terminal`, à trancher.",
        triggers=("docker", "conteneur", "containers"),
    ),
    "storage": Capability(
        app_id="storage", intent="vps.storage", owner=Owner.HERMES,
        risk=RiskLevel.VPS, permission="console.read", display=Display.GENERATED,
        note="Idem docker.",
        triggers=("stockage", "disque", "volume"),
    ),
    "code": Capability(
        app_id="code", intent="vps.code", owner=Owner.DEVICE,
        risk=RiskLevel.VPS, permission="console.read", display=Display.GENERATED,
        note="Éditeur distant — relève d'un agent d'appareil.",
        triggers=("code", "vscode", "éditeur"),
    ),
    "network": Capability(
        app_id="network", intent="system.network", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Aucune liaison réseau enregistrée dans `BindingResolver`.",
        triggers=("réseau", "wifi", "lan"),
    ),
    "connexions": Capability(
        app_id="connexions", intent="devices.list", owner=Owner.DEVICE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Device Manager inexistant.",
        triggers=("connexions", "entités"),
    ),
    "reseau": Capability(
        app_id="reseau", intent="devices.topology", owner=Owner.DEVICE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Device Manager inexistant.",
        triggers=("topologie", "mesh"),
    ),
    "objectifs": Capability(
        app_id="objectifs", intent="core.missions", owner=Owner.CORE,
        risk=RiskLevel.INFO, permission="system.read", display=Display.GENERATED,
        note="Aucun magasin d'objectifs côté Core.",
        triggers=("objectifs", "buts"),
    ),
}


# ── Ce que chaque rôle a le droit de déléguer ────────────────────────────────
#
# Miroir volontaire de `ROLE_PERMISSIONS` dans `surface.py` : là-bas ce qu'on a le
# droit de VOIR, ici ce qu'on a le droit de FAIRE FAIRE. Les deux sont fail-closed —
# un rôle inconnu n'obtient rien.
#
# `admin` n'est pas listé : il reçoit tout toolset qu'une capacité nomme (calculé),
# pour qu'ajouter une capacité ne verrouille pas le propriétaire de la machine.
ROLE_TOOLSETS: dict[str, set[str]] = {
    "user": {"homeassistant", "spotify", "web", "browser"},
    "child": {"spotify"},
    "guest": set(),
}


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
    lowered = " " + " ".join(_fold(text).replace("'", " ").split()) + " "
    lowered = "".join(c if c.isalnum() or c == " " else " " for c in lowered)
    if not lowered.strip():
        return None

    best: list[Capability] = []
    best_len = 0
    for cap in CAPABILITIES.values():
        for trigger in cap.triggers:
            if f" {_fold(trigger)} " not in lowered:
                continue
            if len(trigger) > best_len:
                best, best_len = [cap], len(trigger)
            elif len(trigger) == best_len and cap not in best:
                best.append(cap)

    return best[0] if len(best) == 1 else None


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
    """Les toolsets Hermes délégables par ce rôle.

    C'est **l'unique** grille de filtrage du pont : Hermes ne se voit jamais offrir
    un toolset absent de cet ensemble. Un rôle inconnu, ou personne d'identifié,
    ne délègue rien du tout — l'inverse (tout ouvrir avant identification) est la
    faille classique des assistants domestiques.
    """
    if role is None:
        return set()
    normalized = str(role).lower()
    if normalized == "admin":
        return all_toolsets()
    return set(ROLE_TOOLSETS.get(normalized, ()))
