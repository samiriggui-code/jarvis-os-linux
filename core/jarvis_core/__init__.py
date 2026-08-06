"""JARVIS Core — orchestrateur minimal (dev)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .bus import Bus
from .policy import PolicyEngine, RiskLevel
from .providers import AIProviderManager
from .recovery import RecoveryManager
from .supervisor import DEGRADED, LOADING, READY, Supervisor

logger = logging.getLogger("jarvis.core")

HOST = "127.0.0.1"
PORT = 8765

# Délai minimal entre deux séquences de boot parlées. Une reconnexion en
# boucle ne doit pas faire réciter JARVIS toutes les deux secondes.
BOOT_REPLAY_COOLDOWN_S = 30.0

# Délai au-delà duquel le Core annonce le boot de lui-même, faute de demande.
# Couvre la cinématique la plus longue (54 s + repos + raccord ≈ 60 s) avec de
# la marge : un client qui a l'intention de demander doit avoir le temps, un
# client qui n'en a pas l'intention ne doit pas attendre indéfiniment.
BOOT_ANNOUNCE_GRACE_S = 75.0

# Fenêtre pendant laquelle plusieurs périphériques qui reviennent comptent
# pour UN seul geste. Brancher une webcam à micro intégré fait remonter deux
# périphériques à quelques millisecondes d'intervalle : c'est un branchement,
# pas deux, et ça mérite une seule phrase de détection.
PERIPHERAL_DETECT_GROUP_S = 3.0

# Repli TTS si le cache WAV n'a pas encore la ligne (génération = script).
SESSION_SAY_FALLBACKS: dict[str, str] = {
    "session_locked_manual": (
        "Verrouillage de session. Mise en veille des systèmes. À bientôt."
    ),
    "session_locked_auto": (
        "Verrouillage automatique. Mise en veille des systèmes. À bientôt."
    ),
    "session_goodbye": "À bientôt.",
    "session_closed": "Session verrouillée.",
    "session_opened": "Session ouverte.",
    "session_welcome_back": (
        "Tous les systèmes sont opérationnels. "
        "Ravi de vous revoir, {titre}. Que puis-je faire pour vous ?"
    ),
}

_ROLE_TITLES = {"admin": "monsieur", "user": "madame", "child": "mademoiselle"}


@dataclass(frozen=True)
class Route:
    """Une entrée de la table de dispatch WS.

    `error_type` / `error_extra` : l'enveloppe d'erreur attendue par le HUD pour
    ce type — chaque famille a la sienne (`voice_error` vs
    `preferences_result{ok:false}`), et le HUD s'en sert pour distinguer un
    refus d'un plantage.
    """

    handler: str
    error_type: str
    error_extra: dict[str, Any] = field(default_factory=dict)
    rewrite: Callable[[dict[str, Any]], dict[str, Any]] | None = None


def _user_id_of(data: dict[str, Any], field_name: str) -> str | None:
    inner = data.get(field_name)
    return inner.get("userId") if isinstance(inner, dict) else None


# Table de dispatch WS. Remplace une cascade de `if data.get("type") == …` :
# ajouter un type est une ligne ici, et chaque handler est testable seul.
ROUTES: dict[str, Route] = {
    "ping": Route("handle_ping", "core_error"),
    "auth": Route("handle_auth", "auth_error"),
    "holomat": Route("handle_holomat", "holomat_error"),
    # Signaux bruts MediaPipe du HUD. Fire-and-forget : aucune réponse, la
    # sortie repart par le bus (GESTURE_DETECTED / HAND_POINT) comme tout
    # le reste. À 30 fps, répondre par frame doublerait le trafic pour rien.
    "gesture": Route("handle_gesture", "core_error"),
    "peripheral": Route("handle_peripheral", "core_error"),
    "preferences": Route("handle_preferences", "preferences_result", {"ok": False}),
    "memory": Route("handle_memory", "memory_result", {"ok": False}),
    "voice": Route("handle_voice", "voice_error"),
    "agent_reach": Route("handle_agent_reach", "agent_reach_status", {"ok": False}),
    "supervisor": Route("handle_supervisor", "supervisor_status", {"ok": False}),
    "usage": Route("handle_usage", "usage_result", {"ok": False}),
    # Surface agentique : un document est ADMIS (catalogue + protocole) puis
    # diffusé à tous les clients. Cf. docs/architecture/JARVIS-Agentic-UI.md
    # Le HUD annonce la fin de sa cinématique — le Core peut parler.
    "boot": Route("handle_boot", "core_error"),
    "surface": Route("handle_surface", "surface_error", {"ok": False}),
    "user_event": Route("handle_chat", "core_error"),
    "stop_run": Route("handle_stop_run", "core_error"),
    "mission_dev": Route("handle_mission_dev", "mission_dev_error"),
    # Compat contrats HUD — types plats réécrits vers le handler générique.
    "save_hud_preferences": Route(
        "handle_preferences",
        "preferences_result",
        {"ok": False},
        rewrite=lambda d: {
            "action": "save_hud_preferences",
            "prefs": d.get("prefs"),
            "user_id": _user_id_of(d, "prefs"),
        },
    ),
    "save_gesture_profile": Route(
        "handle_preferences",
        "preferences_result",
        {"ok": False},
        rewrite=lambda d: {
            "action": "save_gesture_profile",
            "profile": d.get("profile"),
            "user_id": _user_id_of(d, "profile"),
        },
    ),
    "holomat_calibrate_start": Route(
        "handle_holomat",
        "holomat_error",
        rewrite=lambda d: {
            "action": "calibrate_start",
            "camera_on": d.get("camera_on", False),
            "cameraDeviceId": d.get("cameraDeviceId"),
        },
    ),
}


def _default_prompt(cap: Any) -> str:
    """Ce qu'on demande à Hermes quand l'utilisateur n'a rien précisé.

    Ouvrir « Maison » sans phrase, c'est demander un état, pas une action. Le
    défaut est donc volontairement en **lecture** : une tuile ouverte par
    curiosité ne doit rien allumer. La phrase de l'utilisateur, quand elle
    existe, remplace celle-ci intégralement.
    """
    return (
        f"Rends l'état actuel pour l'intention « {cap.intent} », en une phrase "
        "courte et en français. N'exécute aucune action de modification."
    )


class Orchestrator:
    """Cerveau : reçoit les events HUD, applique la policy, répond via WS."""

    def __init__(self) -> None:
        self.policy = PolicyEngine()
        self.providers = AIProviderManager()
        self.clients: set[Any] = set()
        # Un seul chemin de sortie vers les clients : producteurs → bus →
        # forwarder → broadcast. Aucune brique n'ouvre son propre WS vers le HUD.
        self.bus = Bus()
        # Le superviseur signale, il ne redémarre pas : systemd s'en charge.
        self.supervisor = Supervisor(emit=self.emit)
        # Surfaces agentiques — catalogue + admission + numérotation de séquence.
        # Un catalogue absent ne bloque pas le boot : le Core refusera juste
        # toute surface, et `JARVIS BASE` continue de tourner.
        from .surface import BindingResolver, IntentExecutor, SurfaceBroadcaster

        self.surfaces = SurfaceBroadcaster()
        # Exécutants d'intentions (P2). Registre volontairement VIDE au départ :
        # une action autorisée qui n'a pas d'exécutant est refusée bruyamment,
        # jamais acquittée en silence. Voir `IntentExecutor`.
        self.intents = IntentExecutor()
        # Sources de données servies aux liaisons `$bind` (§6.3). C'est le Core
        # qui lit et filtre — un agent demande, il ne fournit jamais.
        self.bindings = BindingResolver()
        self._register_bindings()
        # Pont vers Hermes — la seule voie entre le Core et l'agent. Construit
        # toujours : un pont non configuré refuse en le disant, ce qui vaut mieux
        # qu'un attribut absent découvert au premier clic.
        from .hermes import HermesBridge

        self.hermes = HermesBridge()
        # Domotique — adaptateur DIRECT, sans agent ni modèle. Le contrat écrit
        # `Core → Home Assistant Adapter → HA API` ; le §11 du cahier des charges
        # exige que la maison réponde même sans LLM. Passer par Hermes violait les
        # deux, et coûtait 475 s par commande.
        from .homeassistant import HomeAssistantAdapter

        self.hass = HomeAssistantAdapter()
        # Vidéo — même raisonnement, même patron. Le §11 nomme Plex au même titre
        # que HA dans ce qui doit tenir sans modèle, et le marque-page d'une série
        # est une donnée que Plex possède déjà : rien à faire deviner.
        from .plex import PlexAdapter

        self.plex = PlexAdapter()
        # Phrases en attente d'autorisation, indexées par demande. Elles ne
        # peuvent pas voyager dans la carte d'approbation : celle-ci est diffusée
        # à tous les clients connectés, et « allume la chambre de Léa » n'a pas à
        # s'afficher sur l'écran du salon.
        self._pending_prompts: dict[str, str] = {}
        # Remplit `self.intents`, resté vide jusqu'ici. Une intention déclarée
        # sans exécutant reste refusée bruyamment — c'est l'invariant, pas un
        # défaut à masquer.
        self._register_capabilities()
        # Auth / User Manager — optionnel, ne doit jamais empêcher le boot Core
        self.auth = None
        try:
            from .auth import AuthService

            self.auth = AuthService()
            logger.info(
                "Auth prêt · first_run=%s · db=%s",
                self.auth.users.is_first_run(),
                self.auth.users.db_path,
            )
        except Exception as exc:  # noqa: BLE001 — Core doit démarrer sans auth
            logger.warning("Auth indisponible (Core continue) : %s", exc)

        # Holomat — construction seule. Le chargement des modèles (~20 s) part
        # dans start_background() après serve() : sinon le HUD ne peut pas se
        # connecter pendant tout le chargement.
        self.face = None
        try:
            from .holomat import FaceRunner

            self.face = FaceRunner()
        except Exception as exc:  # noqa: BLE001 — le Core tourne sans visage
            logger.warning("Holomat indisponible : %s", exc)

        # Voice Manager — construction seule, aucun appel réseau ici : la sonde
        # voicebox tourne dans start_background() après serve().
        self.voice = None
        try:
            from .voice import VoiceManager

            self.voice = VoiceManager()
            logger.info("Voice Manager prêt · voicebox=%s (sonde différée)", self.voice.client.base)
        except Exception as exc:  # noqa: BLE001 — le HUD garde ttsDev en secours
            logger.warning("Voice Manager indisponible (TTS délégué au HUD) : %s", exc)

        # Routeur gestuel — pur calcul, aucune dépendance externe (MediaPipe
        # tourne dans le HUD, le Core est en 3.14 où la roue n'existe pas).
        # Il ne peut donc pas échouer à la construction : pas de try/except.
        from .gestures import GestureRouter

        self.gestures = GestureRouter(self.bus, self._load_gesture_profile)

        # Métriques système. `disk_path` : la racine porte /var, /storage et
        # les logs sur le NUC — c'est ce disque-là qui fait tomber JARVIS.
        from .metrics import MetricsSampler

        self.metrics = MetricsSampler(
            self.emit,
            degraded_count=self._degraded_components,
            disk_path=os.environ.get("JARVIS_DISK_PATH", "C:\\" if os.name == "nt" else "/"),
        )

        from .mission_dev import MissionDevRunner

        self.mission_dev = MissionDevRunner()

        # Cache vocal — ~680 clips pré-générés. Aucun réseau, aucun coût, et
        # JARVIS parle même quand voicebox, Ollama et Internet sont tombés.
        # Absent, on retombe simplement sur la synthèse : le Core démarre.
        self.voice_cache = None
        try:
            from .voice import VoiceCache

            cache = VoiceCache()
            if cache.available:
                self.voice_cache = cache
                logger.info("Cache vocal · %s", cache.status())
            else:
                logger.info("Cache vocal absent (%s) — synthèse seule", cache.last_error)
        except Exception as exc:  # noqa: BLE001 — jamais bloquant
            logger.warning("Cache vocal indisponible : %s", exc)

        # Repli TTS payant — DÉSACTIVÉ par défaut (JARVIS_ELEVENLABS_FALLBACK=1).
        # Sans lui, une réponse libre sort avec la voix du navigateur pendant
        # que le cache parle avec `jarvis2` : deux voix dans la même phrase.
        # Avec lui, une voix unique — mais ça consomme des caractères, d'où
        # l'activation explicite.
        self.tts_live = None
        try:
            from .voice.elevenlabs import ElevenLabsLive

            live = ElevenLabsLive()
            if live.available:
                self.tts_live = live
                logger.warning("Repli TTS ElevenLabs ACTIF — consomme des caractères")
            elif live.enabled:
                logger.warning("Repli ElevenLabs demandé mais indisponible : %s", live.last_error)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Repli ElevenLabs indisponible : %s", exc)

        # La séquence de boot ne se joue qu'UNE fois, à la première connexion
        # d'un HUD : la jouer au démarrage du Core parlerait dans le vide,
        # puisqu'aucun navigateur n'est là pour sortir le son.
        self._boot_spoken_at = 0.0

        # Experience Orchestrator — enchaîne boot puis identification.
        # Les conditions décident si une étape a lieu : annoncer « analyse
        # environnementale » sans caméra serait un mensonge, on saute.
        from .sequences import SequenceRunner

        # Une étape de boot dont le composant n'est PAS surveillé est sautée,
        # pas échouée. Sans ça, un Core lancé sans `JARVIS_HERMES_URL`
        # annoncerait « noyau cognitif injoignable » à chaque démarrage alors
        # que personne n'a jamais demandé à le joindre. « Pas de ligne » vaut
        # mieux que « éternellement KO » — même règle que le superviseur.
        def watched(name: str) -> Callable[[], bool]:
            return lambda: name in self.supervisor.components

        def prime_signals(signal: Callable[[str], None]) -> None:
            """Faits déjà établis au moment où la séquence démarre.

            Le superviseur n'émet que sur transition (à raison : sonder toutes
            les 5 s et diffuser à chaque fois, c'est 12 messages/minute de
            bruit par brique). Conséquence : un Core en route depuis longtemps
            n'a plus rien à transmettre au HUD qui se connecte. Sans cet
            amorçage, la séquence attendrait des annonces déjà passées.
            """
            for comp in self.supervisor.components.values():
                if comp.state == READY:
                    signal(f"{comp.name}.ready")
                elif comp.state == DEGRADED:
                    signal(f"{comp.name}.degraded")

        # Remise en service — tentée AVANT de déclarer une brique perdue.
        #
        # Les sondes ci-dessous refont le travail de démarrage sans quitter le
        # processus : recharger les modèles, resonder voicebox. Aucun
        # privilège, donc tentées d'office. Tout ce qui touche à la machine
        # (`systemctl`, `docker`, installer un paquet) passe par la Policy
        # Engine et attend un humain — cf. l'en-tête de `recovery.py`.
        #
        # Chaque sonde re-`note()` le superviseur : c'est ce qui réarme le
        # signal que la séquence réattend. Sans ça, une brique réellement
        # rétablie resterait « dégradée » pour la séquence en cours.
        async def soft_voice() -> bool:
            ok = await self.voice.probe() if self.voice is not None else False
            self.supervisor.note("voice", READY if ok else DEGRADED, None)
            return ok

        async def soft_face() -> bool:
            ok = await self.face.load() if self.face is not None else False
            self.supervisor.note("face", READY if ok else DEGRADED, None)
            return ok

        async def soft_hermes() -> bool:
            comp = self.supervisor.components.get("hermes")
            if comp is None:
                return False
            ok = bool(await comp.check())
            self.supervisor.note("hermes", READY if ok else DEGRADED, None)
            return ok

        self.recovery = RecoveryManager(
            self.say,
            policy=self.policy,
            soft_probes={
                "voice": soft_voice,
                "face": soft_face,
                "hermes": soft_hermes,
            },
        )

        self.sequences = SequenceRunner(
            self.say,
            prime=prime_signals,
            recover=self.recovery.attempt,
            reveal=self.supervisor.emit_one,
            conditions={
                "face_ready": lambda: self.face is not None and self.face.ready,
                "voice_ready": lambda: self.voice is not None and self.voice.available,
                # Identification vocale = synthèse debout ET micro branché.
                # `is not False` : un micro jamais rapporté ne bloque pas la
                # branche — on ne suppose pas une panne qu'on n'a pas vue.
                #
                # Plus référencée par aucune étape depuis que la branche
                # vocale est suspendue (cf. `speaker_verified`). Conservée
                # parce qu'elle redeviendra nécessaire le jour où la
                # vérification du locuteur arrivera : il faudra alors les
                # DEUX conditions — matériel présent et locuteur vérifiable.
                "voice_auth_ready": lambda: (
                    self.voice is not None
                    and self.voice.available
                    and self._peripherals.get("mic") is not False
                ),
                # ⚠ FAUX, ET C'EST VOULU.
                #
                # Il n'existe aujourd'hui AUCUNE vérification du locuteur :
                # pas d'empreinte vocale stockée, pas de modèle d'embedding,
                # rien. Le fichier `data/users/<id>/voice_profile` est un
                # preset TTS — la voix que JARVIS emploie pour PARLER à cette
                # personne, pas celle qui permet de la reconnaître.
                #
                # Tant que ça n'a pas changé, la branche vocale de l'auth est
                # sautée : mieux vaut ne rien annoncer que d'annoncer une
                # « signature vocale validée » sur une transcription non vide.
                #
                # À basculer en même temps que l'arrivée de l'embedding
                # locuteur, et pas avant.
                "speaker_verified": lambda: False,
                **{
                    f"{name}_watched": watched(name)
                    for name in ("hermes", "voice", "face", "holomat", "users", "agents")
                },
                # Aucun capteur d'identification. `is False` et non `not` :
                # un périphérique jamais rapporté vaut `None`, et on n'annonce
                # pas une avarie sur un état qu'on ignore.
                "no_biometrics": lambda: (
                    self._peripherals.get("camera") is False
                    and self._peripherals.get("mic") is False
                ),
                # Personne d'identifié = pas de salutation. Sans ça JARVIS
                # dit « Ravi de vous revoir » à un inconnu, avec un titre
                # tiré au hasard entre monsieur, madame et mademoiselle.
                "identified": lambda: bool(
                    self.auth is not None and getattr(self.auth, "active", None)
                ),
            },
        )
        # Références aux tâches de fond : sans ça le GC peut les ramasser
        # avant qu'elles aient tourné.
        self._tasks: set[asyncio.Task[Any]] = set()
        #: Dernier état caméra rapporté par le HUD. `None` = jamais rapporté,
        #: ce qui n'est PAS « en panne » : la sonde `holomat` reste alors en
        #: échec tant que le HUD n'a pas répondu, et la séquence attend.
        self._camera_ok: bool | None = None
        #: Hits YuNet consécutifs avant `face.presence` (anti faux positif).
        self._presence_hits: int = 0
        #: État des périphériques rapporté par le HUD — `None` = jamais vu.
        #: Sert à ne parler qu'au changement, cf. `handle_peripheral`.
        self._peripherals: dict[str, bool] = {}
        #: Dernière annonce « détection en cours », pour regrouper les
        #: périphériques qui reviennent ensemble (webcam + micro intégré).
        self._detecting_said_at = 0.0
        #: Coupe la narration libre (périphériques, relances) après login /
        #: refresh session — sinon cam denied→ready rejoue un monologue
        #: pendant que le HUD est déjà ouvert.
        self._voice_quiet = False
        #: Armé quand les sondes sont enregistrées.
        #:
        #: `serve()` accepte les connexions AVANT `start_background()` — c'est
        #: voulu, le HUD ne doit pas attendre le chargement des modèles. Mais
        #: la séquence de boot, elle, doit attendre : un HUD connecté dans
        #: cette fenêtre trouverait zéro composant surveillé, sauterait les six
        #: étapes faute de sonde, et conclurait « tous les systèmes sont
        #: opérationnels » sans en avoir vérifié un seul. Exactement le bug
        #: qu'on vient de retirer, par une autre porte.
        self._components_ready = asyncio.Event()
        #: HUD a demandé un boot silencieux (session déjà ouverte).
        self._boot_skip = False

    def cmd(self, command: str, **kwargs: Any) -> dict[str, Any]:
        return {"command": command, **kwargs}

    async def start_background(self) -> None:
        """Chargements lents — appelé après serve(), jamais dans __init__.

        Le WS accepte déjà les connexions : chaque brique annonce son état au
        fur et à mesure au lieu de retarder le boot.
        """
        asyncio.create_task(self._forward_bus())
        asyncio.create_task(self.gestures.run())
        asyncio.create_task(self.metrics.run())
        self._apply_gesture_sensitivity()
        self._register_components()
        self._components_ready.set()
        await self.supervisor.start()
        if self.voice is not None:
            asyncio.create_task(self._probe_voice())
        if self.face is not None:
            asyncio.create_task(self._load_face())
        asyncio.create_task(self._probe_agents())

    def _register_components(self) -> None:
        """Ce que le superviseur surveille. Une brique absente n'est pas
        surveillée : mieux vaut « pas de ligne » que « éternellement KO ».

        Ces six noms sont AUSSI les six vérifications de la séquence de boot
        (`sequences.BOOT`) et les six lignes de `BOOT_CHECKS_INIT` dans
        `AuthScene.tsx`. Un composant enregistré ici, c'est une ligne qui passe
        au vert pour une vraie raison ; un composant absent, c'est une ligne
        sautée. Rien ne coche plus tout seul.
        """
        if self.voice is not None:
            self.supervisor.register(
                "voice", self.voice.probe, interval_s=15.0
            )
        if self.face is not None:
            # Pas de réseau : le moteur est chargé ou il ne l'est pas.
            async def face_check() -> bool:
                return self.face.ready

            self.supervisor.register("face", face_check, interval_s=10.0)

            # HOLOMAT VISION ≠ FACE RECOGNITION. Ce sont deux pannes
            # différentes et il faut pouvoir les distinguer à l'oral :
            #
            #   face     → modèles YuNet + SFace chargés, côté Core (~20 s)
            #              → panne type : `fetch_models.py` jamais lancé
            #   holomat  → flux caméra ouvert, côté NAVIGATEUR (getUserMedia)
            #              → panne type : webcam débranchée, permission refusée
            #
            # Les modèles peuvent être parfaitement chargés sans une seule
            # image à traiter, et l'inverse aussi. Le Core ne peut pas sonder
            # une caméra qu'il ne tient pas : c'est le HUD qui la rapporte
            # (`{"type":"holomat","action":"camera"}`), d'où `note()` et une
            # sonde qui se contente de relire le dernier état connu.
            async def holomat_check() -> bool | None:
                # `None` tant que le HUD n'a rien rapporté : le Core ne tient
                # pas cette caméra, il n'a donc aucun moyen d'affirmer quoi que
                # ce soit. Ne pas confondre « pas encore de navigateur » avec
                # « objectif en panne » — la ligne reste grise, pas rouge.
                return self._camera_ok

            self.supervisor.register("holomat", holomat_check, interval_s=20.0)

        if self.auth is not None:
            # Requête RÉELLE, pas un booléen « le module est importé » : une
            # base injoignable ou un schéma non migré ne se voient qu'en
            # interrogeant. SQLAlchemy est synchrone → hors boucle.
            async def users_check() -> bool:
                await asyncio.to_thread(self.auth.users.count_users)
                return True

            self.supervisor.register(
                "users", users_check, interval_s=30.0, critical=True
            )

        # AGENT NETWORK — capability Internet d'Hermes. `status()` lit le
        # disque et peut lancer le CLI : hors boucle, comme la base.
        async def agents_check() -> bool:
            from .agent_reach_status import status as agent_status

            # `deep=False` : présence du CLI, pas le diagnostic réseau. Ce
            # dernier prend ~8 s (il sonde GitHub, X, Reddit…) pour un budget
            # de sonde de 5 s — cf. agent_reach_status.status().
            st = await asyncio.to_thread(lambda: agent_status(deep=False))
            return bool(st.get("installed"))

        self.supervisor.register("agents", agents_check, interval_s=60.0)

        hermes_url = os.environ.get("JARVIS_HERMES_URL")
        if hermes_url:
            from .supervisor import http_check

            self.supervisor.register(
                "hermes",
                http_check(f"{hermes_url.rstrip('/')}/health"),
                interval_s=20.0,
            )

    async def _forward_bus(self) -> None:
        """Unique pont bus → clients WS.

        Tourne indéfiniment : un événement mal formé ne doit pas fermer le
        robinet pour tous les autres.
        """
        sub = self.bus.subscribe(name="ws-clients", maxsize=128)
        while True:
            event = await sub.get()
            try:
                await self.broadcast(event.to_dict())
            except Exception as exc:  # noqa: BLE001
                logger.warning("forward bus → WS (%s) : %s", event.kind, exc)

    def _degraded_components(self) -> int:
        """Combien de briques le superviseur donne pour mortes, maintenant.

        Nourrit l'indice de menace : une sonde déjà dégradée pèse plus lourd
        qu'un CPU chaud, et cette vérité-là existe déjà, il suffit de la lire.
        """
        try:
            return len(self.supervisor.status().get("degraded") or ())
        except Exception:  # noqa: BLE001
            return 0

    def _load_gesture_profile(self) -> dict[str, Any]:
        """Profil gestuel de la session courante — seuils ET bindings."""
        from .auth.profiles import load_gesture_profile, resolve_user_id

        return load_gesture_profile(resolve_user_id(None, self._session_user_id()))

    def _apply_gesture_sensitivity(self, profile: dict[str, Any] | None = None) -> None:
        """Seuils gestuels = préférence utilisateur, pas constante du Core."""
        try:
            if profile is None:
                profile = self._load_gesture_profile()
            self.bus.apply_gesture_profile(profile)
        except Exception as exc:  # noqa: BLE001 — seuils par défaut si ça rate
            logger.warning("profil gestuel non appliqué : %s", exc)

    def emit(self, kind: str, payload: dict[str, Any], *, source: str = "core") -> None:
        """Publie sur le bus. Ne lève jamais, ne bloque jamais."""
        if kind == "component_state":
            self._signal_component(payload)
        self.bus.publish(kind, payload, source=source)

    def _signal_component(self, payload: dict[str, Any]) -> None:
        """Superviseur → séquence : `voice` passe `ready` → signal `voice.ready`.

        C'est le fil qui manquait. Le superviseur connaissait la vérité, la
        séquence de boot déroulait ses minuteries, et les deux ne se parlaient
        pas : six lignes vertes et « tous les systèmes sont opérationnels »
        au-dessus de briques mortes.

        `signal()` est armé même si personne n'attend encore : une brique déjà
        prête avant le début de la séquence ne bloque pas son étape.
        """
        seq = getattr(self, "sequences", None)
        if seq is None:  # émission pendant la construction
            return
        name = payload.get("component")
        state = payload.get("state")
        if not name or state not in (READY, DEGRADED):
            return
        seq.signal(f"{name}.{'ready' if state == READY else 'degraded'}")

    # ── périphériques ────────────────────────────────────────────────────
    #
    # Caméra, microphone, sortie audio. Trois pannes qui ne se réparent pas
    # par logiciel : elles se rebranchent. D'où un traitement séparé de la
    # remise en service — annoncer « je relance la vision » devant une prise
    # USB vide n'aide personne. Voir `dialogues/peripheriques.yaml`.

    #: Phrases par périphérique. Un dict plutôt que des `if` en cascade : les
    #: trois se comportent exactement pareil, seul le nom change.
    _PERIPHERAL_LINES = {
        "camera": ("peripheral_camera_missing", "peripheral_camera_denied",
                   "peripheral_camera_ready", "peripheral_camera_lost"),
        "mic": ("peripheral_mic_missing", "peripheral_mic_denied",
                "peripheral_mic_ready", "peripheral_mic_lost"),
        # `denied` pointait sur la MÊME phrase que `missing` — le cas « accès
        # refusé » n'avait jamais été envisagé pour une sortie. Il existe
        # pourtant, et c'est même le plus fréquent : le navigateur ne liste
        # les sorties audio qu'une fois le micro autorisé.
        "audio_out": ("peripheral_audio_out_missing", "peripheral_audio_out_denied",
                      "peripheral_audio_out_ready", "peripheral_audio_out_hdmi_lost"),
    }

    async def handle_peripheral(self, ws: Any, data: dict[str, Any]) -> None:
        """Le HUD rapporte l'état d'un périphérique. On ne parle qu'au CHANGEMENT.

        Répéter « branchez votre caméra » toutes les dix secondes pendant que
        l'utilisateur cherche le bon câble, c'est la meilleure façon de faire
        débrancher l'enceinte aussi. Le constat est dit une fois ; ensuite,
        silence, jusqu'à ce que l'état change réellement.
        """
        device = str(data.get("device", ""))
        lines = self._PERIPHERAL_LINES.get(device)
        if lines is None:
            return
        missing, denied, ready, lost = lines

        ok = bool(data.get("ok", False))
        reason = str(data.get("reason") or "")
        previous = self._peripherals.get(device)
        self._peripherals[device] = ok

        # La caméra alimente aussi la vérification de démarrage HOLOMAT VISION.
        if device == "camera":
            self.note_camera(ok, None if ok else (reason or "camera_unavailable"))

        if previous == ok:
            return  # rien de neuf : on se tait

        # Pendant auth/boot ou session déjà ouverte : on MET À JOUR l'état
        # mais on ne parle pas. Sinon denied→ready caméra double le monologue
        # d'identification, et continue après unlock.
        running = getattr(self.sequences, "_running", None)
        session_open = bool(self.auth is not None and getattr(self.auth, "active", None))
        quiet = bool(getattr(self, "_voice_quiet", False) or session_open
                     or running in ("auth", "boot", "enrollment", "unlock", "lock", "lock_auto"))
        if quiet:
            return

        if not ok:
            # Le refus d'accès prime sur tout le reste : le matériel EST là,
            # et « rebranchez votre caméra » enverrait chercher un câble déjà
            # en place. Sans ce test en premier, une permission révoquée en
            # cours de session s'annonçait « le flux s'est interrompu ».
            if reason == "denied":
                await self.say(denied)
            else:
                # « Perdu » ≠ « absent » : le premier suppose qu'on l'avait.
                await self.say(lost if previous is True else missing)
            return

        # Premier rapport favorable : c'est l'état NOMINAL, il n'y a rien à
        # annoncer. Dire « Sortie audio rétablie » au démarrage, alors qu'elle
        # n'a jamais manqué, c'est parler d'un incident qui n'a pas eu lieu.
        if previous is None:
            return

        # Retour à la normale. `peripheral_detecting` d'abord : c'est la
        # phrase qui accuse réception du geste, et qui dit à l'utilisateur
        # qu'il peut lâcher le câble.
        #
        # Une webcam à micro intégré fait remonter DEUX périphériques d'un
        # coup : un seul geste, donc une seule annonce de détection. Sans ce
        # garde-fou on entend « Un instant, détection en cours » deux fois de
        # suite, ce qui donne l'impression que le premier essai a raté.
        now = time.monotonic()
        if now - self._detecting_said_at > PERIPHERAL_DETECT_GROUP_S:
            self._detecting_said_at = now
            await self.say("peripheral_detecting")
        await self.say(ready)

        known = [self._peripherals.get(d) for d in self._PERIPHERAL_LINES]
        if all(v is True for v in known):
            await self.say("peripheral_all_ready")
            await self.say("peripheral_resume")

    def note_camera(self, ok: bool, error: str | None = None) -> None:
        """Le HUD rapporte l'état de son flux caméra (HOLOMAT VISION).

        Le Core n'ouvre pas la caméra — c'est `getUserMedia` dans le
        navigateur. Sans ce retour, la seule façon de « vérifier » la vision
        était de recopier l'état du moteur de reconnaissance, ce que faisait
        `handle_holomat` : `"camera": "ok" if face_ready else "missing"`.
        Deux pannes distinctes affichées comme une seule.
        """
        self._camera_ok = ok
        self.supervisor.note("holomat", READY if ok else DEGRADED, error)

    # Les états de composants passent tous par le superviseur : une seule
    # source, et sa règle « n'émettre que sur transition » s'applique partout.
    async def _probe_voice(self) -> None:
        ok = await self.voice.probe()
        self.supervisor.note("voice", READY if ok else "degraded", self.voice.last_error)

    async def _load_face(self) -> None:
        self.supervisor.note("face", LOADING)
        ok = await self.face.load()
        self.supervisor.note("face", READY if ok else DEGRADED, self.face.error)

    async def _probe_agents(self) -> None:
        """Verdict immédiat sur agent-reach, au lieu d'attendre le heartbeat.

        La règle « 3 échecs avant de dégrader » du superviseur protège des
        réseaux qui clignotent. Ici la sonde est un `shutil.which` : la réponse
        est certaine du premier coup, et attendre trois cycles de 60 s ferait
        patienter la séquence de boot jusqu'à son timeout pour une conclusion
        déjà connue. `note()` est fait pour ça.
        """
        from .agent_reach_status import status as agent_status

        try:
            st = await asyncio.to_thread(agent_status)
        except Exception as exc:  # noqa: BLE001 — jamais bloquant
            self.supervisor.note("agents", DEGRADED, str(exc))
            return
        installed = bool(st.get("installed"))
        self.supervisor.note(
            "agents",
            READY if installed else DEGRADED,
            None if installed else "agent-reach non installé",
        )

    async def speak(
        self,
        text: str,
        *,
        user_id: str = "local",
        language: str | None = None,
        preset: str | None = None,
    ) -> dict[str, Any]:
        """TTS → event HUD. Sans Voice Manager, le HUD parle avec ttsDev."""
        if self.voice is None:
            return {
                "type": "tts_fallback",
                "utterance_id": None,
                "text": text,
                "reason": "voice_module_unavailable",
                "language": language or "fr",
            }
        ev = await self.voice.speak(
            text, user_id=user_id, language=language, preset=preset
        )

        # voicebox a rendu la main sans audio (absent, modèle en cours de
        # téléchargement, erreur). Si le repli ElevenLabs est ACTIVÉ, on
        # synthétise avec la MÊME voix que le cache — sinon le HUD parlerait
        # avec la voix du navigateur et on entendrait deux JARVIS différents
        # dans la même conversation.
        if ev.get("type") == "tts_fallback" and self.tts_live is not None:
            try:
                wav = await self.tts_live.synthesize(text)
            except Exception as exc:  # noqa: BLE001 — le repli HUD reste
                logger.info("Repli ElevenLabs indisponible : %s", exc)
                return ev
            import base64

            return {
                "type": "tts_audio",
                "utterance_id": ev.get("utterance_id"),
                "format": "wav",
                "audio_b64": base64.b64encode(wav).decode("ascii"),
                "bytes": len(wav),
                "text": text,
                "user_id": user_id,
                "source": "elevenlabs_live",
                "interruptible": True,
            }
        return ev

    async def say(
        self,
        event: str,
        ws: Any = None,
        *,
        user_id: str = "local",
        address: str | None = None,
        user_role: str | None = None,
        bindings: dict[str, str] | None = None,
        fallback_text: str | None = None,
    ) -> dict[str, Any] | None:
        """Fait parler JARVIS depuis le CACHE, avec repli sur la synthèse.

        C'est le point d'entrée unique pour les phrases connues. L'ordre compte :

          1. cache — instantané, gratuit, marche hors ligne
          2. synthèse (voicebox) — seulement si la phrase n'est pas en cache
          3. rien — l'appelant n'a fourni aucun texte de repli

        `ws` cible un client ; sans lui, l'événement part à tout le monde
        (séquence de boot, alerte maison).
        """
        payload = None
        if self.voice_cache is not None:
            payload = self.voice_cache.play(
                event,
                user_id=user_id,
                address=address,
                user_role=user_role,
                bindings=bindings,
            )

        if payload is None:
            raw = fallback_text or SESSION_SAY_FALLBACKS.get(event)
            if raw:
                titre = (bindings or {}).get("titre") or _ROLE_TITLES.get(
                    (user_role or "").lower(), "monsieur"
                )
                text = raw.format(
                    titre=titre,
                    user=(bindings or {}).get("user", ""),
                )
                payload = await self.speak(text, user_id=user_id)

        if payload is None:
            logger.debug("say(%s) : ni cache ni texte de repli", event)
            return None

        if ws is not None:
            await ws.send(json.dumps(payload))
        else:
            await self.broadcast(payload)
        return payload

    async def _publish_result_surface(
        self,
        surface_id: str,
        *,
        title: str,
        body: str,
        source: str = "",
        items: list[str] | None = None,
    ) -> None:
        """Diffuse un ResultPanel dans la fenêtre d'app — fin de la page vide.

        Hermes / le chat parlaient ; le HUD ouvrait une surface sans document.
        Ici on pousse un snapshot admissible (composant catalogue) sous la clé
        `surface_id` (= id d'app, ex. `reach`).
        """
        from .surface import SurfaceRejected, validate_document

        cid = "result-main"
        document = {
            "surfaces": {
                surface_id: {
                    "root": [cid],
                    "components": {
                        cid: {
                            "name": "ResultPanel",
                            "props": {
                                "title": title[:120],
                                "body": (body or "")[:8000],
                                "source": source[:80],
                                "items": list(items or [])[:40],
                            },
                            "state": "idle",
                        }
                    },
                }
            }
        }
        try:
            permissions, context = self._surface_guards()
            document = validate_document(
                document,
                self.surfaces.catalog,
                permissions=permissions,
                context=context,
                bindings=self.bindings,
            )
        except SurfaceRejected as exc:
            logger.warning("ResultPanel refusé · %s — %s", surface_id, exc)
            return
        except Exception as exc:  # noqa: BLE001
            logger.warning("ResultPanel impossible · %s", exc)
            return

        event = self.surfaces.snapshot(document)
        # Ouvrir la fenêtre AVANT le snapshot : sinon AgentSurface n'est pas
        # monté et rate SURFACE_SNAPSHOT → l'utilisateur voit le fallback
        # « Agent-Reach » vide (bug capture 2026-08-06 Macron).
        await self.broadcast(
            {
                "type": "hud_command",
                "action": "open_space",
                "app": surface_id,
            }
        )
        await asyncio.sleep(0.25)
        await self.broadcast(event)
        # Second envoi : clients qui montent AgentSurface un tick plus tard.
        await asyncio.sleep(0.15)
        again = self.surfaces.resnapshot()
        if again is not None:
            await self.broadcast(again)

    async def _try_streaming_platforms(self, ws: Any, text: str) -> bool:
        """Netflix / Disney+ / Prime — surface agentic + onglet navigateur.

        Pas de contrôle PC distant : on ouvre l'URL sur le client HUD
        (`open_external`). Plex reste le chemin « média maison » (media.video).
        """
        from urllib.parse import quote

        low = " " + " ".join(text.lower().replace("'", " ").split()) + " "
        platforms: list[tuple[str, str, str]] = [
            ("netflix", "Netflix", "https://www.netflix.com/search?q="),
            ("disney", "Disney+", "https://www.disneyplus.com/search?q="),
            ("prime", "Amazon Prime", "https://www.primevideo.com/search/ref=atv_nb_sr?phrase="),
            ("amazon", "Amazon Prime", "https://www.primevideo.com/search/ref=atv_nb_sr?phrase="),
        ]
        hit = next(
            ((k, label, base) for k, label, base in platforms if f" {k} " in low),
            None,
        )
        if not hit:
            # Sans marque explicite → Plex (media.video), pas de vol d'intent.
            return False

        _, label, base = hit
        # Extraire un titre approximatif après le nom de plateforme / « série ».
        q = text
        for token in (
            "netflix", "disney+", "disney plus", "disney", "amazon prime",
            "prime video", "amazon", "prime", "sur", "regarde", "regarder",
            "une série", "un film", "série", "serie", "film", "épisode", "episode",
        ):
            q = re.sub(re.escape(token), " ", q, flags=re.I)
        q = " ".join(q.split()).strip() or label
        url = base + quote(q)

        await self._publish_result_surface(
            "video",
            title=f"{label} — {q}",
            body=f"Ouverture de {label}. Lien aussi dans la surface agentic.",
            source="media.streaming",
            items=[url],
        )
        await self.broadcast({
            "type": "hud_command",
            "action": "open_external",
            "url": url,
        })
        spoken = f"J'ouvre {label}."
        await ws.send(json.dumps({"type": "chat_reply", "text": spoken, "intent": "media.streaming"}))
        ev = await self.speak(spoken, user_id=self._session_user_id() or "local")
        await ws.send(json.dumps(ev))
        return True

    async def _send_boot_state(self, ws: Any, *, spoken: bool) -> None:
        """Encadre le boot pour le HUD — `start` puis `end`, toujours.

        Version muette : aucune séquence vocale n'est jouée, mais le HUD reçoit
        le même contrat, avec l'état RÉEL des sondes lu sur le superviseur. Il
        peint ses lignes et passe à l'identification comme d'habitude.
        """
        checks = ["hermes", "voice", "face", "holomat", "users", "agents"]
        try:
            await ws.send(json.dumps({
                "type": "boot_state", "phase": "start", "checks": checks,
            }))
            degraded = sorted(self.supervisor.status().get("degraded") or ())
            await ws.send(json.dumps({
                "type": "boot_state",
                "phase": "end",
                # Muet ≠ en échec : le boot précédent a déjà eu lieu, et les
                # briques mortes sont rapportées telles quelles. Bloquer ici
                # ferait de « JARVIS s'est tu » un « démarrage interrompu ».
                "ok": True,
                "spoken": spoken,
                "degraded": degraded,
                "pending_actions": [],
            }))
        except Exception as exc:  # noqa: BLE001 — un HUD parti ne casse rien
            logger.debug("boot_state non délivré : %s", exc)

    async def speak_boot_sequence(self, ws: Any) -> None:
        """Démarrage parlé : boot système, puis identification.

        Jouée sur la CONNEXION et non au lancement du Core : sans navigateur,
        personne n'entendrait rien.

        La séquence d'auth enchaîne derrière le boot — scan caméra, voix,
        fusion, salutation. Les étapes dont la brique est absente sont
        sautées : en développement sans caméra, on entend le boot puis la
        salutation, sans fausse annonce d'analyse.
        """
        # ⚠ `boot_state` est le signal de SYNCHRO du HUD, pas un effet de la
        # parole. Il vivait en aval des deux sorties ci-dessous, si bien que
        # « JARVIS ne parle pas » devenait « le HUD ne démarre pas » :
        #
        #   · cache vocal absent      → aucun boot_state
        #   · rejeu dans les 30 s     → aucun boot_state
        #
        # Le second est le pire : recharger la page deux fois de suite — le
        # geste le plus banal en développement, et normal pour un kiosque qui
        # se relance — condamnait l'écran à « NOYAU COGNITIF INJOIGNABLE »
        # pendant 30 secondes, avec HERMES CORE au rouge alors que le Core
        # répondait parfaitement.
        #
        # Le silence est donc découplé : on se tait, mais on signale toujours.
        now = time.monotonic()
        silent = (
            getattr(self, "_boot_skip", False)
            or self.voice_cache is None
            or now - self._boot_spoken_at < BOOT_REPLAY_COOLDOWN_S
        )
        if silent:
            logger.debug("Boot annoncé sans voix (skip/cache/rejeu)")
            await self._send_boot_state(ws, spoken=False)
            self._boot_skip = False
            return
        self._boot_spoken_at = now
        self._boot_skip = False

        async def say_to(event: str, **kw: Any) -> dict[str, Any] | None:
            return await self.say(event, ws, **kw)

        self.sequences._say = say_to

        # Ne pas annoncer avant d'avoir de quoi vérifier (cf. commentaire de
        # `_components_ready`). Le délai est un garde-fou, pas une attente
        # normale : `start_background()` est lancé juste après `serve()`.
        try:
            await asyncio.wait_for(self._components_ready.wait(), timeout=10.0)
        except (asyncio.TimeoutError, TimeoutError):
            logger.warning("Sondes non enregistrées — boot annoncé sans vérification")

        # `boot_state` encadre la séquence : c'est le point de SYNCHRO du HUD.
        # Sans lui, l'écran redeviendrait libre de dérouler ses six lignes à
        # son rythme pendant que le Core parle au sien — le décalage d'origine.
        # Le HUD peint les lignes depuis `component_state` (déjà diffusé sur le
        # bus) et ne passe à la caméra que sur `phase: "end"`.
        await ws.send(json.dumps({
            "type": "boot_state",
            "phase": "start",
            "checks": ["hermes", "voice", "face", "holomat", "users", "agents"],
        }))

        # Rejeu de l'état des briques, JUSTE APRÈS `boot_state` et juste avant
        # que la séquence ne parle.
        #
        # Le Core démarre bien avant le navigateur : quand le HUD arrive — au
        # bout d'une cinématique de près d'une minute — toutes les sondes ont
        # déjà basculé `unknown → ready`, et le superviseur ne parle que sur
        # changement. La checklist restait donc grise pour tout ce qui
        # fonctionnait. Ce n'est pas un cas limite : avec la cinématique, c'est
        # le cas nominal.
        #
        # L'ordre compte. Avant `boot_state`, le HUD n'a pas encore sa liste de
        # lignes et jetterait les états ; après le début de la séquence, les
        # lignes s'allumeraient dans le désordre par rapport à la voix.
        # ⚠ On réserve les briques que la séquence va annoncer. Le rejeu total
        # les allumait toutes ICI, avant la première phrase : les six lignes
        # viraient au vert d'un bloc, puis JARVIS les énumérait pendant vingt
        # secondes au-dessus d'une checklist déjà finie. Le reste — une brique
        # sans étape parlée — est bien rejoué, sinon plus rien ne l'afficherait.
        from .sequences import watched_components

        self.supervisor.replay(exclude=watched_components("boot"))
        self.recovery.reset()
        ok = await self.sequences.run("boot")
        try:
            await ws.send(json.dumps({
                "type": "boot_state",
                "phase": "end",
                "ok": ok,
                "degraded": sorted(self.sequences.degraded),
                "pending_actions": [
                    {"target": s.target, "command": s.command}
                    for s in self.recovery.pending_system
                ],
            }))
        except Exception as exc:  # noqa: BLE001
            # Client parti (1001 going away) pendant le boot — diffuser aux
            # autres HUD plutôt que laisser l'écran sur « NOYAU INJOIGNABLE ».
            logger.warning("boot_state end non délivré au client : %s — broadcast", exc)
            await self.broadcast({
                "type": "boot_state",
                "phase": "end",
                "ok": ok,
                "degraded": sorted(self.sequences.degraded),
                "pending_actions": [],
            })
        if not ok:
            # Étape fatale : on ne lance PAS l'identification. La caméra
            # au-dessus d'une base utilisateurs morte ne mène nulle part, et
            # l'écran doit rester sur l'échec au lieu de défiler.
            logger.warning("Boot interrompu — identification non lancée")
            return

        # ⚠ La séquence d'AUTH n'est PAS lancée ici.
        #
        # Une connexion WebSocket n'est pas une tentative d'authentification :
        # recharger une page, ouvrir un second onglet, une reconnexion Wi-Fi
        # en produisent une. La lancer ici faisait réciter JARVIS pendant que
        # le HUD était déjà passé à autre chose — et elle traînait sur des
        # timeouts caméra qui n'arriveraient jamais.
        #
        # Elle est déclenchée par le VRAI parcours : le HUD envoie
        # `{"type":"auth","action":"sequence_start"}` quand il ouvre son
        # écran d'identification.

    def _session_role(self) -> str | None:
        """Rôle de la session active, en minuscules — `None` si personne.

        Sert à choisir le titre : « monsieur » pour l'admin, « madame » pour
        un adulte, le prénom pour un enfant.
        """
        sess = getattr(self.auth, "active", None) if self.auth else None
        role = getattr(getattr(sess, "role", None), "value", None)
        return role.lower() if isinstance(role, str) else None

    async def _execute_home(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Domotique — chemin déterministe, sans LLM (cahier des charges §11).

        Le contrat trace `Core → Home Assistant Adapter → HA API` ; Hermes n'y
        figure pas. C'est aussi ce qui permet à la maison de répondre en « Mode 3,
        sans LLM » : aucun modèle n'est consulté ici.

        Une ambiguïté n'est pas tranchée au hasard : deux lampes possibles font
        remonter la liste plutôt qu'un choix. Allumer la mauvaise pièce est pire
        que demander une précision.
        """
        from .homeassistant import HomeAssistantAmbiguous, HomeAssistantUnavailable

        prompt = str(payload.get("prompt") or "").strip()
        if not prompt and (approval_id := payload.get("approval_id")):
            prompt = self._pending_prompts.pop(str(approval_id), "")

        try:
            result = await self.hass.execute(prompt or "état de la maison")
        except HomeAssistantAmbiguous as exc:
            await self.say("not_understood", fallback_text=str(exc))
            return {"ok": False, "ambiguous": True, "reason": str(exc)}
        except HomeAssistantUnavailable as exc:
            # `house_unreachable` — la maison ne répond pas. Distinct d'un appareil
            # absent : là c'est la liaison entière qui manque.
            await self.say("house_unreachable", fallback_text=str(exc))
            raise RuntimeError(str(exc)) from exc

        await self._say_home(result)
        return result

    async def _start_kiosk_enrollment(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Admin → ouvre l'UI d'enrôlement sur TOUS les HUD (kiosk NUC inclus).

        La capture face/voix se fait sur la caméra du kiosk maison, pas sur le
        portable distant. Le Core diffuse `hud_command/start_enrollment` puis
        lance la séquence vocale `enrollment`.
        """
        sess = self.auth.active if self.auth is not None else None
        if self.auth is not None and not self.auth.users.is_first_run():
            if not sess or not (
                "user_management" in sess.permissions
                or "dashboard_access" in sess.permissions
            ):
                spoken = "Seul un administrateur peut lancer un enrôlement foyer."
                await self.broadcast(await self.speak(spoken, user_id="local"))
                return {"ok": False, "reason": "admin_required", "spoken": spoken}

        prompt = str(payload.get("prompt") or "")
        # Heuristique légère : « enrôle Léa » / « inscris mon conjoint »
        username = str(payload.get("username") or "").strip()
        display_name = str(payload.get("display_name") or "").strip()
        role = "USER"  # foyer kiosk : jamais ADMIN / CHILD via ce canal vocal
        if display_name and not username:
            username = (
                "".join(c for c in display_name.lower() if c.isalnum() or c in "-_")[:24]
                or "membre"
            )

        await self.broadcast({
            "type": "hud_command",
            "action": "start_enrollment",
            "username": username or None,
            "display_name": display_name or None,
            "role": role,
        })

        # Narration enrollment sur le kiosk.
        self._voice_quiet = False
        try:
            self.sequences.abort()
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(0.05)

        async def say_to(event: str, **kw: Any) -> dict[str, Any] | None:
            return await self.say(event, **kw)

        self.sequences._say = say_to
        task = asyncio.create_task(
            self.sequences.run("enrollment", **self._say_context())
        )
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

        spoken = (
            f"Enrôlement lancé sur le kiosk pour {display_name}."
            if display_name
            else "Enrôlement lancé sur le kiosk. Placez la personne face à la caméra."
        )
        await self.broadcast(await self.speak(spoken, user_id=sess.user_id if sess else "local"))
        return {
            "ok": True,
            "action": "start_enrollment",
            "username": username or None,
            "display_name": display_name or None,
            "role": role,
            "spoken": spoken,
        }

    async def _execute_hud(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Actions quotidiennes HUD — Core décide, le navigateur exécute.

        Verrouiller, mute, veille, caméra, fermer un *espace* (app JARVIS) :
        zéro Hermes. On diffuse `hud_command` à tous les clients ; le HUD
        applique et répond. Sans cet envoi, JARVIS « comprend » mais n'agit pas.
        """
        intent = str(payload.get("intent") or "").strip()
        # L'exécutant est enregistré par intention ; on la reprend du payload
        # si présent, sinon du contexte d'appel via le registre.
        if not intent:
            # Les handlers sont bindés sans intent dans le payload d'origine —
            # `_execute_intent` passe surface_id/app/prompt. On lit l'intention
            # depuis le prompt matché via le registre d'enregistrement.
            intent = str(getattr(self, "_hud_intent_hint", "") or "")

        prompt = str(payload.get("prompt") or "").strip().lower()
        # Deviner depuis le prompt si l'intent n'est pas dans le payload.
        if not intent:
            if any(k in prompt for k in ("verrouill", "lock")):
                intent = "hud.lock"
            elif any(k in prompt for k in ("veille", "repos", "standby")):
                intent = "hud.idle"
            elif any(k in prompt for k in ("ferme", "close")):
                intent = "hud.close_space"
            elif any(k in prompt for k in ("remets le son", "unmute", "écoute", "allume le micro")):
                intent = "hud.unmute"
            elif any(k in prompt for k in ("coupe le son", "mute", "sourdine", "silence")):
                intent = "hud.mute"
            elif any(k in prompt for k in ("allume la cam", "ouvre la cam", "active la cam", "réveille la cam")):
                intent = "hud.camera_on"
            elif any(k in prompt for k in ("coupe la cam", "éteins la cam", "ferme la cam", "arrête la cam")):
                intent = "hud.camera_off"
            elif any(k in prompt for k in (
                "enrôl", "enrol", "inscris", "nouvel utilisateur", "nouveau profil",
                "ajoute un profil", "enrolement", "enrôlement", "family enroll",
            )):
                intent = "hud.enroll"

        action = {
            "hud.lock": "lock",
            "hud.idle": "idle",
            "hud.close_space": "close_spaces",
            "hud.mute": "mute",
            "hud.unmute": "unmute",
            "hud.camera_on": "camera_on",
            "hud.camera_off": "camera_off",
            "hud.enroll": "start_enrollment",
        }.get(intent)

        if not action:
            return {"ok": False, "reason": f"commande HUD inconnue : {intent}"}

        # Enrôlement foyer : admin seulement → broadcast kiosk + séquence Core.
        if action == "start_enrollment":
            return await self._start_kiosk_enrollment(payload)

        close_all = action == "close_spaces" and (
            "tout" in prompt or "espaces" in prompt or "fenêtres" in prompt or "fenetres" in prompt
        )

        # Voix lock/veille AVANT de diffuser (session encore active pour le titre).
        if action == "lock":
            try:
                self.sequences.abort()
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(0.05)

            async def say_to(event: str, **kw: Any) -> dict[str, Any] | None:
                return await self.say(event, **kw)

            self.sequences._say = say_to
            await self.sequences.run("lock", **self._say_context())
        elif action == "idle":
            try:
                self.sequences.abort()
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(0.05)

            async def say_idle(event: str, **kw: Any) -> dict[str, Any] | None:
                return await self.say(event, **kw)

            self.sequences._say = say_idle
            await self.sequences.run("lock_auto", **self._say_context())

        cmd = {
            "type": "hud_command",
            "action": action,
            "close_all": close_all,
            "intent": intent,
        }
        await self.broadcast(cmd)

        # Autres actions : phrase courte (mute, caméra…). Lock/idle déjà parlés.
        if action not in ("lock", "idle"):
            spoken = {
                "close_spaces": "Espaces fermés." if close_all else "Espace fermé.",
                "mute": "Micro coupé.",
                "unmute": "Micro réactivé.",
                "camera_on": "Caméra allumée.",
                "camera_off": "Caméra coupée.",
            }.get(action, "C'est fait.")
            ev = await self.speak(spoken, user_id=self._session_user_id() or "local")
            await self.broadcast(ev)
            await self.broadcast(self.cmd("display_notification", message=spoken, duration=3.0))
        else:
            await self.broadcast(
                self.cmd(
                    "display_notification",
                    message="Session verrouillée." if action == "lock" else "Mode veille.",
                    duration=3.0,
                )
            )
        return {"ok": True, "action": action}

    async def _execute_capabilities(self, payload: dict[str, Any]) -> dict[str, Any]:
        """« Quels outils as-tu ? » → ResultPanel, pas une liste parlée seule."""
        from .capabilities import CAPABILITIES, allows

        role = self._session_role()
        lines: list[str] = []
        for cap in CAPABILITIES.values():
            if not allows(cap, role):
                continue
            note = (cap.note or "").strip()
            lines.append(
                f"{cap.intent} · {cap.app_id}"
                + (f" — {note}" if note else "")
            )
        body = (
            f"{len(lines)} intentions disponibles pour votre profil. "
            "Demandez une action (« cherche… », « verrouille… ») : "
            "JARVIS ouvre une surface composée quand c’est pertinent."
        )
        await self._publish_result_surface(
            "reach",
            title="Outils & capacités",
            body=body,
            source="system.capabilities",
            items=lines[:30],
        )
        spoken = f"J'ai {len(lines)} intentions disponibles. Je les affiche."
        ev = await self.speak(spoken, user_id=self._session_user_id() or "local")
        await self.broadcast(ev)
        return {"ok": True, "count": len(lines)}

    async def _execute_introspect(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Parcourt skills Hermes + catalogue UI + intentions — visible en surface."""
        from pathlib import Path

        from .capabilities import CAPABILITIES, allows

        role = self._session_role()
        prompt = str(payload.get("prompt") or "").lower()

        items: list[str] = []

        # 1 · Intentions Core
        items.append("—— Intentions orchestrateur ——")
        for cap in CAPABILITIES.values():
            if not allows(cap, role):
                continue
            items.append(f"{cap.intent} [{cap.owner.value}] · app={cap.app_id}")

        # 2 · Catalogue UI agentique
        items.append("—— Composants surface (catalogue) ——")
        try:
            for name in sorted(self.surfaces.catalog.names):
                d = self.surfaces.catalog.get(name) or {}
                desc = str(d.get("description") or "")[:80]
                items.append(f"{name} — {desc}")
        except Exception as exc:  # noqa: BLE001
            items.append(f"(catalogue illisible : {exc})")

        # 3 · Skills Hermes (fichiers déployés)
        items.append("—— Compétences Hermes (SKILL.md) ——")
        skill_roots = [
            Path("/opt/jarvis/deploy/hermes/skills"),
            Path(__file__).resolve().parents[2] / "deploy" / "hermes" / "skills",
        ]
        found = False
        for root in skill_roots:
            if not root.is_dir():
                continue
            for skill_md in sorted(root.glob("*/SKILL.md")):
                found = True
                name = skill_md.parent.name
                try:
                    head = skill_md.read_text(encoding="utf-8")[:400]
                    first = next(
                        (ln.strip("# ").strip() for ln in head.splitlines() if ln.strip()),
                        name,
                    )
                except Exception:  # noqa: BLE001
                    first = name
                items.append(f"skill:{name} — {first}")
            if found:
                break
        if not found:
            items.append("(aucun SKILL.md trouvé sous deploy/hermes/skills)")

        body = (
            "Introspection JARVIS : intentions, composants agentiques, compétences Hermes. "
            "Demandez une action précise pour l’exécuter (Policy → autorisation)."
        )
        if "code" in prompt:
            body += " Le code produit vit dans core/jarvis_core et hud/src — pas d’exécution shell libre."

        await self._publish_result_surface(
            "reach",
            title="Introspection JARVIS",
            body=body,
            source="system.introspect",
            items=items[:60],
        )
        spoken = "Voici ce que je peux faire — intentions, surfaces et compétences."
        ev = await self.speak(spoken, user_id=self._session_user_id() or "local")
        await self.broadcast(ev)
        return {"ok": True, "items": len(items)}

    async def _execute_media_pause(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Coupe / pause la musique via HA media_player — sans Hermes."""
        from .homeassistant import HomeAssistantUnavailable

        prompt = str(payload.get("prompt") or "coupe la musique").strip()
        try:
            result = await self.hass.execute(prompt)
        except HomeAssistantUnavailable as exc:
            await self.speak(
                "Je n'ai pas accès à la musique pour le moment.",
                user_id=self._session_user_id() or "local",
            )
            return {"ok": False, "reason": str(exc)}
        except Exception as exc:  # noqa: BLE001
            # Ambiguïté / autre : on dit vrai.
            msg = str(exc) or "Impossible de couper la musique."
            await self.speak(msg, user_id=self._session_user_id() or "local")
            return {"ok": False, "reason": msg}

        if result.get("ok"):
            ev = await self.speak("Musique coupée.", user_id=self._session_user_id() or "local")
            await self.broadcast(ev)
        else:
            ev = await self.speak(
                str(result.get("reason") or "Aucun lecteur trouvé."),
                user_id=self._session_user_id() or "local",
            )
            await self.broadcast(ev)
        return result

    async def _say_home(self, result: dict[str, Any]) -> None:
        """La réponse orale d'une action domestique — depuis le CACHE, sans LLM.

        `dialogues/quotidien.yaml` est décrit comme « réponses aux intentions
        déterministes (sans LLM) — pré-générées et mises en cache ». Les phrases
        existaient donc déjà (`light_on`, `light_off`, `device_unreachable`…) ;
        ce qui manquait, c'était de les déclencher. Une action muette n'est pas
        une action : l'utilisateur ne sait pas si elle a eu lieu.

        `say()` lit le cache d'abord et ne synthétise qu'à défaut — c'est ce qui
        rend la maison bavarde hors ligne, et gratuite.
        """
        # `{room}` et `{device}` viennent du nom convivial de l'entité, celui que
        # l'utilisateur a lui-même donné dans Home Assistant. Reprendre son
        # vocabulaire vaut mieux que de lui réciter un `entity_id`.
        name = str(result.get("entity_id") or "").split(".")[-1].replace("_", " ")

        if not result.get("ok"):
            await self.say(
                "device_unreachable",
                bindings={"device": name or "cet appareil"},
                fallback_text=str(result.get("reason") or "Appareil injoignable."),
            )
            return

        action = str(result.get("action") or "")
        event = {"on": "light_on", "off": "light_off", "open": "light_on",
                 "close": "light_off", "toggle": "ack_done"}.get(action)

        if event is None:
            # Lecture d'état : rien à annoncer, la surface l'affiche déjà. Parler
            # ici doublerait l'écran pour ne rien ajouter.
            return

        await self.say(event, bindings={"room": name or "la pièce"}, fallback_text="C'est fait.")

    async def _execute_video(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Vidéo — chemin déterministe, sans LLM (cahier des charges §11).

        Le §11 range Plex à côté de Home Assistant dans ce qui doit répondre en
        « Mode 3 ». La capacité était pourtant marquée `DEVICE` — déclarée à
        l'utilisateur, sans rien derrière. C'est le même trou que celui qu'avait
        laissé `IntentExecutor` vide, à un étage au-dessus.

        Une ambiguïté ne se tranche pas au hasard, ici moins qu'ailleurs : lancer
        le mauvais épisode le marque comme vu et déplace le marque-page de Plex.
        L'erreur ne se contente pas d'échouer, elle abîme un état.
        """
        from .plex import PlexAmbiguous, PlexUnavailable

        prompt = str(payload.get("prompt") or "").strip()
        if not prompt and (approval_id := payload.get("approval_id")):
            prompt = self._pending_prompts.pop(str(approval_id), "")

        try:
            result = await self.plex.execute(prompt or "qu'est-ce qui joue")
        except PlexAmbiguous as exc:
            await self.say("not_understood", fallback_text=str(exc))
            return {"ok": False, "ambiguous": True, "reason": str(exc)}
        except PlexUnavailable as exc:
            # `device_unreachable` et non `house_unreachable` : c'est un lecteur
            # qui manque, pas la maison entière.
            await self.say(
                "device_unreachable",
                bindings={"device": "le lecteur"},
                fallback_text=str(exc),
            )
            raise RuntimeError(str(exc)) from exc

        await self._say_video(result)
        return result

    async def _say_video(self, result: dict[str, Any]) -> None:
        """La réponse orale d'une demande vidéo — depuis le CACHE, sans LLM.

        `media_launched` existait dans `dialogues/quotidien.yaml` depuis le début,
        avec ses clips déjà générés. Comme les événements domotiques avant
        aujourd'hui, il n'était jamais déclenché : la phrase attendait un
        appelant. Une action muette n'est pas une action.
        """
        if not result.get("ok"):
            await self.say(
                "device_unreachable",
                bindings={"device": "le lecteur"},
                fallback_text=str(result.get("reason") or "Je ne trouve pas ce titre."),
            )
            return

        if result.get("action") != "play":
            # Question d'état : la surface affiche déjà la liste. Parler ici
            # doublerait l'écran sans rien ajouter — même règle que la domotique.
            return

        # `{service}` est le mot du gabarit ; on y met le titre, parce que c'est
        # ce que l'utilisateur reconnaît. « Plex lancé » ne lui apprend rien.
        await self.say(
            "media_launched",
            bindings={"service": str(result.get("title") or "La lecture")},
            fallback_text="C'est parti.",
        )

    async def _open_intent(self, ws: Any, cap: Any, prompt: str = "") -> None:
        """Ouvre une intention — **le seul chemin**, pour le clic comme pour la voix.

        Deux appelants : `surface/open` (tuile du volet) et `handle_user_chat`
        (phrase reconnue). Ils partagent ce corps délibérément. Si la voix avait
        son propre chemin, il finirait par diverger — et ce serait l'un des deux,
        forcément, qui perdrait un contrôle en route.

        L'ordre est celui du contrat, sans exception possible :
        rôle → exécutant existant → Policy → autorisation → exécution.
        """
        from .capabilities import allows

        role = self._session_role()
        base = {"type": "surface_error", "ok": False, "app": cap.app_id, "intent": cap.intent}

        if not allows(cap, role):
            logger.info("intention REFUSÉE (rôle) · %s · rôle=%s", cap.intent, role)
            await ws.send(json.dumps({**base, "reason": "Réservé à l'administrateur."}))
            return

        if not cap.available:
            # Refus honnête plutôt qu'échec silencieux : l'intention existe, rien
            # ne la réalise, et on dit lequel des deux fait défaut.
            await ws.send(
                json.dumps(
                    {**base, "reason": cap.note or "Aucun exécutant pour cette intention."}
                )
            )
            return

        decision = self.policy.evaluate(action=cap.intent, risk=cap.risk)

        if not decision.allowed and not decision.needs_confirmation:
            await ws.send(json.dumps({**base, "reason": decision.reason}))
            return

        if decision.needs_confirmation:
            # La phrase de l'utilisateur ne peut pas voyager dans la carte
            # d'autorisation : celle-ci est diffusée à TOUS les clients, et
            # « allume la chambre de Léa » n'a rien à faire sur l'écran du salon.
            approval_id, event = self.surfaces.open_approval(
                intent=cap.intent,
                gravity=cap.risk.name.lower(),
                reason=decision.reason or "Confirmation requise.",
                surface_id="apps",
            )
            if prompt:
                self._pending_prompts[approval_id] = prompt
            logger.info(
                "intention EN ATTENTE · %s · approval=%s — %s",
                cap.intent, approval_id, decision.reason,
            )
            await self.broadcast(event)
            await ws.send(
                json.dumps(
                    {
                        "type": "surface_result",
                        "ok": True,
                        "app": cap.app_id,
                        "intent": cap.intent,
                        "pending": approval_id,
                    }
                )
            )
            return

        logger.info("intention AUTORISÉE · %s (%s)", cap.intent, cap.risk.name.lower())
        await self._execute_intent(
            ws,
            cap.intent,
            {
                "surface_id": "apps",
                "app": cap.app_id,
                "prompt": prompt,
                "intent": cap.intent,
            },
        )

    def _register_capabilities(self) -> None:
        """Donne un exécutant à chaque intention du volet Applications.

        `IntentExecutor` était vide : toute intention approuvée repartait en
        « aucun exécutant enregistré ». Le refus était correct — c'est ce qui a
        rendu le trou visible — mais il fallait bien finir par le combler.

        Deux familles seulement :

          * **CORE** — le Core sait faire. L'exécutant se contente ici de rendre
            l'état ; le rendu revient à une page produit ou à une composition.
          * **HERMES** — délégué au pont, après Policy. L'exécutant capture la
            capacité par valeur : sans ça, toutes les fermetures partageraient la
            dernière de la boucle, et « Musique » allumerait la maison.

        `DEVICE` n'est pas enregistré du tout : aucun Device Manager n'existe, et
        inscrire un exécutant qui échouerait toujours ferait passer une absence
        d'architecture pour une panne d'exécution.
        """
        from .capabilities import CAPABILITIES, Owner

        # Exécutants Core RÉELS, par intention. Ce qui n'est pas ici retombe sur
        # le rapporteur d'état ci-dessous — lequel ne prétend jamais avoir agi.
        real: dict[str, Any] = {
            "home.control": self._execute_home,
            "media.video": self._execute_video,
            "media.pause": self._execute_media_pause,
            "hud.lock": self._execute_hud,
            "hud.idle": self._execute_hud,
            "hud.close_space": self._execute_hud,
            "hud.mute": self._execute_hud,
            "hud.unmute": self._execute_hud,
            "hud.camera_on": self._execute_hud,
            "hud.camera_off": self._execute_hud,
            "hud.enroll": self._execute_hud,
            "system.capabilities": self._execute_capabilities,
            "system.introspect": self._execute_introspect,
            "core.holomat": self._execute_camera_view,
        }

        for cap in CAPABILITIES.values():
            if cap.owner is Owner.CORE:
                if handler := real.get(cap.intent):
                    self.intents.register(cap.intent, handler)
                    continue

                def _core_handler(payload: dict[str, Any], _cap=cap) -> dict[str, Any]:
                    return {
                        "intent": _cap.intent,
                        "owner": "core",
                        "display": _cap.display.value,
                        "note": _cap.note,
                    }

                self.intents.register(cap.intent, _core_handler)
                continue

            if cap.owner is not Owner.HERMES:
                continue

            async def _hermes_handler(payload: dict[str, Any], _cap=cap) -> dict[str, Any]:
                from .hermes import HermesRefused, HermesUnavailable

                # La décision est refaite ici et non passée par le payload : une
                # autorisation transmise dans un message est une autorisation
                # falsifiable. Le coût est une évaluation de plus, pure et locale.
                decision = self.policy.evaluate(action=_cap.intent, risk=_cap.risk)

                prompt = str(payload.get("prompt") or "").strip()
                if not prompt and (approval_id := payload.get("approval_id")):
                    # Reprise après autorisation : la phrase avait été mise de
                    # côté au moment d'ouvrir la carte. `pop` — une demande
                    # accordée ne se rejoue pas.
                    prompt = self._pending_prompts.pop(str(approval_id), "")
                if not prompt:
                    prompt = _default_prompt(_cap)

                try:
                    reply = await self.hermes.ask(
                        _cap, prompt, role=self._session_role(), decision=decision
                    )
                except (HermesRefused, HermesUnavailable) as exc:
                    # Remonté tel quel : `_execute_intent` distingue déjà « pas
                    # d'exécutant » de « l'exécutant a échoué », et c'est bien du
                    # second qu'il s'agit.
                    raise RuntimeError(str(exc)) from exc

                text = (reply.text or "").strip()
                if text and _cap.app_id:
                    await self._publish_result_surface(
                        _cap.app_id,
                        title=_cap.app_id.replace("-", " ").title(),
                        body=text,
                        source=_cap.intent,
                    )

                return {
                    "intent": _cap.intent,
                    "owner": "hermes",
                    "toolset": _cap.toolset,
                    "display": _cap.display.value,
                    "text": text,
                }

            self.intents.register(cap.intent, _hermes_handler)

        logger.info("capacités enregistrées · %d intentions", len(self.intents.actions))

    def _register_bindings(self) -> None:
        """Sources que le Core accepte de servir à une composition.

        Volontairement **courte**. Chaque entrée est une donnée qu'un agent
        pourra faire afficher : on en ouvre une parce qu'on en a besoin, jamais
        « au cas où ». Chacune porte la permission qu'elle exige, vérifiée à la
        lecture contre la session en cours.

        Rien de sensible ici : charge machine et mémoire. Le jour où une source
        touche au foyer ou aux utilisateurs, sa permission doit être distincte
        de `system.read`.
        """
        from . import metrics

        def _metric(key: str):
            def read():
                sample = metrics.sample()
                return sample.get(key) if isinstance(sample, dict) else None

            return read

        for key in ("cpu", "ram", "disk"):
            self.bindings.register(f"system.{key}", "system.read", _metric(key), "number")
        self.bindings.register("system.uptime_s", "system.read", _metric("uptime_s"), "integer")
        self.bindings.register("system.host", "system.read", _metric("host"), "string")

    def _surface_component_name(self, surface_id: str, component_id: str) -> str | None:
        """Nom catalogue du composant qui émet, retrouvé dans NOTRE document.

        On ne demande pas au client de quel composant il s'agit : on le lit dans
        la copie de vérité côté Core. Sinon la dérivation de gravité se
        contenterait de déplacer la confiance d'un champ à un autre.
        """
        surface = self.surfaces.document.get("surfaces", {}).get(surface_id)
        if not isinstance(surface, dict):
            return None
        node = surface.get("components", {}).get(component_id)
        return node.get("name") if isinstance(node, dict) else None

    def _surface_guards(self) -> tuple[set[str], set[str]]:
        """Ce que la session en cours a le droit de voir, et le matériel présent.

        Retourne `(permissions, contexte)` pour l'admission d'un document (§7.1).
        """
        from .surface import permissions_for

        permissions = permissions_for(self._session_role(), self.surfaces.catalog)

        # Contexte matériel. `camera` = le navigateur peut demander getUserMedia
        # (kiosk NUC → webcam USB LG ; portable distant → caméra du portable).
        # On l'ajoute dès qu'une session est ouverte : sinon CameraPreview est
        # refusé (« contexte absent ») et la voix tombe en chat OpenRouter.
        context: set[str] = {"camera"}
        if getattr(self, "face", None) is not None:
            context.add("face")

        return permissions, context

    async def _execute_camera_view(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Ouvre le flux caméra navigateur dans une surface agentic.

        Pas de ThinQ / RTSP LG pour l'instant : honnêteté dans le ResultPanel.
        Sur le kiosk du NUC, getUserMedia vise en général la webcam USB (LG).
        """
        from .surface import SurfaceRejected, validate_document

        prompt = str(payload.get("prompt") or "").strip().lower()
        lg = any(w in prompt for w in ("lg", "thinq", "chambre", "nuc"))

        # Allume la caméra côté HUD + ouvre Holomat.
        await self.broadcast({"type": "hud_command", "action": "camera_on"})
        await self.broadcast({
            "type": "hud_command",
            "action": "open_space",
            "app": "vision",
        })
        await asyncio.sleep(0.2)

        body = (
            "Aperçu caméra du navigateur (getUserMedia). "
            + (
                "Caméra LG ThinQ / RTSP IP : pas encore câblée — "
                "sur le kiosk NUC, choisissez la webcam USB LG dans les permissions navigateur."
                if lg
                else "Demandez « caméra LG » pour le détail chambre / NUC."
            )
        )
        document = {
            "surfaces": {
                "vision": {
                    "root": ["cam-preview", "cam-note"],
                    "components": {
                        "cam-preview": {
                            "name": "CameraPreview",
                            "props": {"mirrored": True, "opacity": 1},
                            "state": "idle",
                        },
                        "cam-note": {
                            "name": "ResultPanel",
                            "props": {
                                "title": "Visuel caméra",
                                "body": body,
                                "source": "core.holomat",
                                "items": [
                                    "Flux = navigateur (pas ThinQ cloud)",
                                    "Kiosk NUC → webcam USB locale",
                                    "Distant → caméra du portable",
                                ],
                            },
                            "state": "idle",
                        },
                    },
                }
            }
        }
        try:
            permissions, context = self._surface_guards()
            document = validate_document(
                document,
                self.surfaces.catalog,
                permissions=permissions,
                context=context,
                bindings=self.bindings,
            )
        except SurfaceRejected as exc:
            logger.warning("surface caméra refusée · %s", exc)
            await self._publish_result_surface(
                "vision",
                title="Visuel caméra",
                body=f"Impossible d'afficher CameraPreview ({exc}). {body}",
                source="core.holomat",
                items=[],
            )
            spoken = "J'ouvre la caméra, mais la surface a été refusée."
            await self.broadcast(await self.speak(spoken, user_id=self._session_user_id() or "local"))
            return {"ok": False, "reason": str(exc)}

        event = self.surfaces.snapshot(document)
        await self.broadcast(event)
        await asyncio.sleep(0.15)
        again = self.surfaces.resnapshot()
        if again is not None:
            await self.broadcast(again)

        spoken = "Voici le flux caméra."
        ev = await self.speak(spoken, user_id=self._session_user_id() or "local")
        await self.broadcast(ev)
        return {"ok": True, "app": "vision"}

    async def _execute_intent(
        self,
        ws: Any,
        intent: str,
        payload: dict[str, Any],
        *,
        granted: bool | None = None,
    ) -> None:
        """Exécute une intention autorisée, ou refuse bruyamment faute d'exécutant.

        ⚠ Le refus est le comportement important. Une intention sans exécutant
        pourrait repartir avec `ok: True` — l'utilisateur verrait « autorisé »,
        l'écran serait cohérent, et rien ne se serait produit. C'est exactement
        le mode de panne que ce projet paie depuis le début : déclaré, jamais
        appelé, et rien ne le signale.
        """
        from .surface import IntentNotExecutable

        base: dict[str, Any] = {"type": "surface_result", "intent": intent}
        if granted is not None:
            base["granted"] = granted

        try:
            result = await self.intents.execute(intent, payload)
        except IntentNotExecutable as exc:
            logger.error("intention NON EXÉCUTÉE · %s — %s", intent, exc)
            await ws.send(
                json.dumps(
                    {
                        **base,
                        "ok": False,
                        "executed": False,
                        "reason": str(exc),
                        "known_actions": self.intents.actions,
                    }
                )
            )
            return
        except Exception as exc:  # noqa: BLE001
            # L'exécutant a échoué. C'est distinct de « pas d'exécutant » : là
            # quelqu'un a essayé et n'a pas pu, et le HUD doit pouvoir le dire.
            logger.exception("intention EN ÉCHEC · %s", intent)
            await ws.send(
                json.dumps({**base, "ok": False, "executed": True, "reason": f"échec : {exc}"})
            )
            return

        logger.info("intention EXÉCUTÉE · %s", intent)
        await ws.send(
            json.dumps({**base, "ok": True, "executed": True, "result": result if isinstance(result, (str, int, float, bool, list, dict, type(None))) else str(result)})
        )

    def _say_context(self) -> dict[str, Any]:
        """Qui écoute — rôle, adresse et prénom de la session active.

        Le prénom compte autant que le rôle : sans lui, une ligne comme
        `profile_loaded` (« Profil de {user} chargé ») tire au hasard parmi
        les cinq membres du foyer et annonce le mauvais nom.
        """
        sess = getattr(self.auth, "active", None) if self.auth else None
        if sess is None:
            return {}

        ctx: dict[str, Any] = {"user_id": sess.user_id}
        if role := self._session_role():
            ctx["user_role"] = role

        # Prénom tel qu'il apparaît dans les clips — `display_name` est ce que
        # la génération a utilisé ; `username` est en minuscules en base.
        user = self.auth.users.get_by_id(sess.user_id) if self.auth else None
        if name := getattr(user, "display_name", None):
            ctx["bindings"] = {"user": name}

        # Préférence de tutoiement — défaut `vous` tant qu'elle n'a pas été
        # négociée (cf. dialogues/README.md).
        ctx["address"] = getattr(user, "address", None) or "vous"
        return ctx

    async def broadcast(self, payload: dict[str, Any]) -> None:
        text = json.dumps(payload)
        dead: list[Any] = []
        for ws in self.clients:
            try:
                await ws.send(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def _chat_via_capability(self, ws: Any, cap: Any, text: str) -> bool:
        """Délègue à Hermes pour une phrase routée — True si réponse parlée.

        En cas d'échec (toolset off, crédits, timeout), False : l'appelant
        bascule sur `providers.complete` pour ne pas laisser l'utilisateur
        dans le vide après dix secondes de « thinking ».
        """
        from .capabilities import allows
        from .hermes import HermesRefused, HermesUnavailable

        role = self._session_role()
        if not allows(cap, role) or not cap.available:
            return False

        decision = self.policy.evaluate(action=cap.intent, risk=cap.risk)
        if not decision.allowed or decision.needs_confirmation:
            # Confirmation / refus : laisser `_open_intent` gérer l'UI dédiée.
            await self._open_intent(ws, cap, text)
            return True

        try:
            reply = await self.hermes.ask(
                cap, text, role=role, decision=decision
            )
        except (HermesRefused, HermesUnavailable) as exc:
            logger.warning("Hermes chat · %s : %s", cap.intent, exc)
            await ws.send(
                json.dumps(
                    self.cmd(
                        "display_notification",
                        message=f"Hermes indisponible — réponse locale. ({exc})",
                        duration=4.0,
                    )
                )
            )
            return False
        except Exception as exc:  # noqa: BLE001
            logger.exception("Hermes chat · %s", cap.intent)
            await ws.send(
                json.dumps(
                    self.cmd(
                        "display_notification",
                        message=f"Hermes en échec — réponse locale. ({exc})",
                        duration=4.0,
                    )
                )
            )
            return False

        body = (reply.text or "").strip() or "C’est fait."
        uid = self._session_user_id() or "local"
        if getattr(cap, "app_id", None):
            items: list[str] = []
            if cap.intent == "web.search":
                from urllib.parse import quote

                items.append(
                    "https://www.google.com/search?q=" + quote(text.strip()[:200])
                )
            await self._publish_result_surface(
                cap.app_id,
                title=str(cap.app_id).replace("-", " ").title(),
                body=body,
                source=cap.intent,
                items=items or None,
            )
        await ws.send(json.dumps(self.cmd("set_orb_state", state="speaking")))
        await ws.send(
            json.dumps({"type": "chat_reply", "text": body, "intent": cap.intent})
        )
        ev = await self.speak(body, user_id=uid)
        await ws.send(json.dumps(ev))
        if ev.get("type") == "tts_skipped":
            await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))
        return True

    async def _fallback_web_surface(self, ws: Any, text: str) -> None:
        """Hermes web OFF / HS — surface Internet + Google, sans mensonge LLM.

        Observé : toolset `web` hors `platform_toolsets` → OpenRouter disait
        « Je procède à la recherche… » et n'ouvrait rien.
        """
        from urllib.parse import quote

        q = text.strip()[:200] or "actualité"
        # Photos / images → Google Images ; sinon recherche web classique.
        low = q.lower()
        wants_img = any(
            w in low
            for w in ("photo", "photos", "image", "images", "cliché", "cliches", "visuel")
        )
        if wants_img:
            url = "https://www.google.com/search?tbm=isch&q=" + quote(q)
            title = "Recherche images"
        else:
            url = "https://www.google.com/search?q=" + quote(q)
            title = "Recherche web"
        body = (
            "Hermes n'a pas répondu à temps. "
            "Voici le lien Google — résultats aussi dans cette surface."
        )
        await self._publish_result_surface(
            "reach",
            title=title,
            body=body,
            source="web.search.fallback",
            items=[url],
        )
        await self.broadcast({
            "type": "hud_command",
            "action": "open_external",
            "url": url,
        })
        spoken = "J'ouvre la recherche sur Google."
        await ws.send(json.dumps({
            "type": "chat_reply",
            "text": spoken,
            "intent": "web.search",
        }))
        await ws.send(json.dumps(self.cmd("set_orb_state", state="speaking")))
        ev = await self.speak(spoken, user_id=self._session_user_id() or "local")
        await ws.send(json.dumps(ev))
        if ev.get("type") == "tts_skipped":
            await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))

    async def handle_user_chat(self, ws: Any, text: str) -> None:
        from .auth.profiles import load_hud_preferences, resolve_user_id, save_hud_preferences
        from .capabilities import match_intent
        from .locale import resolve_reply_language, system_prompt_language

        # ── Commande avant conversation ──────────────────────────────────────
        #
        # « Jarvis, allume le salon » partait droit dans la complétion, évaluée
        # `action="chat", risk=INFO`. La phrase était donc jugée au risque d'une
        # question, alors qu'elle demande d'agir sur la maison. Aucune lampe ne
        # s'allumait — mais le jour où le pont a existé, c'est ce chemin-là qui
        # aurait contourné la Policy.
        #
        # Une phrase reconnue emprunte maintenant EXACTEMENT le chemin d'un clic
        # sur la tuile, à son vrai niveau de risque. `match_intent` refuse de
        # deviner en cas d'ambiguïté : dans le doute, la phrase reste une
        # conversation, ce qui est le repli sûr.

        # Streaming (Netflix / Disney / Prime) avant Plex / Hermes.
        if await self._try_streaming_platforms(ws, text):
            return

        if cap := match_intent(text):
            logger.info("phrase ROUTÉE · « %s » → %s", text[:48], cap.intent)
            await ws.send(json.dumps(self.cmd("set_orb_state", state="thinking")))
            # Hermes (web, etc.) peut être down / toolset off / crédits morts :
            # on tente, et si ça échoue on RETOMBE en conversation Ollama —
            # sinon l'utilisateur attend longtemps puis silence.
            from .capabilities import Owner

            if getattr(cap, "owner", None) is Owner.HERMES:
                handled = await self._chat_via_capability(ws, cap, text)
                if handled:
                    return
                logger.info(
                    "Hermes indisponible pour %s — repli surface / local",
                    cap.intent,
                )
                # Recherche web : ne JAMAIS laisser OpenRouter feindre (« Je
                # procède… ») sans surface. Ouvrir ResultPanel + Google.
                if cap.intent == "web.search":
                    await self._fallback_web_surface(ws, text)
                    return
            else:
                await self._open_intent(ws, cap, text)
                return

        # Filet : « cherche / trouve / propose / nouvelles… » sans trigger exact
        # ne doit PAS tomber en chat nu OpenRouter (coquille vide).
        lowered = " " + " ".join(text.lower().replace("'", " ").split()) + " "
        research_words = (
            " cherche ", " trouve ", " propose ", " recherche ",
            " nouvelles ", " actualité ", " actualites ", " actualités ",
            " sur internet ", " sur le web ",
        )
        if any(w in lowered for w in research_words):
            from .capabilities import CAPABILITIES, Owner

            cap = CAPABILITIES.get("reach")
            if cap is not None:
                logger.info("phrase FORCÉE web.search · « %s »", text[:48])
                await ws.send(json.dumps(self.cmd("set_orb_state", state="thinking")))
                handled = await self._chat_via_capability(ws, cap, text)
                if handled:
                    return
                await self._fallback_web_surface(ws, text)
                return

        decision = self.policy.evaluate(action="chat", text=text, risk=RiskLevel.INFO)
        await ws.send(json.dumps(self.cmd("set_orb_state", state="thinking")))

        if not decision.allowed:
            refusal = decision.reason or "Action refusée par la Policy Engine."
            await ws.send(
                json.dumps(
                    self.cmd("display_notification", message=refusal, duration=4.0)
                )
            )
            ev = await self.speak(refusal, user_id=self._session_user_id() or "local")
            await ws.send(json.dumps(ev))
            if ev.get("type") == "tts_skipped":
                await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))
            return

        uid = self._session_user_id() or "local"
        prefs = load_hud_preferences(uid) or {}
        locale = prefs.get("locale") if isinstance(prefs.get("locale"), dict) else {}
        lang_res = resolve_reply_language(locale=locale, utterance=text)
        reply_lang = lang_res["language"]

        # Sticky « passe en anglais » → persist
        if lang_res.get("stickyUpdate"):
            next_locale = {
                **locale,
                "stickyLanguage": lang_res["stickyUpdate"],
                "mode": "sticky",
            }
            prefs = {**prefs, "locale": next_locale, "userId": resolve_user_id(uid)}
            save_hud_preferences(uid, prefs)

        await ws.send(json.dumps({
            "type": "locale_resolved",
            "user_id": uid,
            "language": reply_lang,
            "voicePreset": lang_res.get("voicePreset"),
            "detected": lang_res.get("detected"),
            "switchAck": bool(lang_res.get("switchAck")),
        }))

        prompt = (
            f"{system_prompt_language(reply_lang)} "
            f"L'utilisateur dit : {text}"
        )
        reply = await self.providers.complete(prompt)
        logger.info(
            "chat libre · provider=%s · « %s » → %d car.",
            self.providers.current_mode(),
            text[:48],
            len(reply or ""),
        )
        await ws.send(json.dumps(self.cmd("set_orb_state", state="speaking")))
        await ws.send(
            json.dumps(self.cmd(
                "display_notification",
                message=reply,
                duration=5.0,
            ))
        )
        await ws.send(json.dumps({
            "type": "chat_reply",
            "text": reply,
            "language": reply_lang,
            "voicePreset": lang_res.get("voicePreset"),
        }))

        # TTS voicebox. L'orbe repasse en standby sur le vrai `voice/playback
        # end` renvoyé par le HUD — plus de sleep(0.4) à l'aveugle.
        ev = await self.speak(
            reply,
            user_id=uid,
            language=reply_lang,
            preset=lang_res.get("voicePreset"),
        )
        await ws.send(json.dumps(ev))
        if ev.get("type") == "tts_skipped":
            await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))

    async def handle_auth(self, ws: Any, data: dict[str, Any]) -> None:
        """Events type=auth — n'altère pas ping/chat existants."""
        if self.auth is None:
            await ws.send(json.dumps({"type": "auth_error", "error": "auth_module_unavailable"}))
            return

        # Narration de l'identification — déclenchée par le HUD quand il ouvre
        # son écran d'auth, PAS par la connexion WebSocket. C'est la seule
        # façon que le récit colle à ce que l'utilisateur voit à l'écran.
        if data.get("action") == "sequence_stop":
            # Login réussi / refresh session : coupe le monologue immédiatement.
            self._voice_quiet = True
            try:
                self.sequences.abort()
            except Exception as exc:  # noqa: BLE001
                logger.debug("sequence abort : %s", exc)
            if self.voice is not None:
                try:
                    await ws.send(json.dumps(self.voice.cancel()))
                except Exception:  # noqa: BLE001
                    pass
            await ws.send(json.dumps({"type": "auth_sequence_stop", "ok": True}))
            return

        if data.get("action") == "sequence_start":
            # ⚠ Le nom était figé sur « auth ». Les scénarios `enrollment`,
            # `unlock`, `lock` et `admin` existaient dans `sequences.py` sans
            # que RIEN ne les lance : l'enrôlement se déroulait donc en silence
            # et le déverrouillage de session n'avait aucune voix. Ce n'était
            # pas un réglage à corriger, c'était un câble jamais posé.
            #
            # Liste blanche plutôt que nom libre : un client ne choisit pas
            # d'exécuter n'importe quoi dans le Core.
            wanted = str(data.get("sequence") or "auth")
            if wanted not in ("auth", "enrollment", "unlock", "lock", "lock_auto", "admin"):
                await ws.send(json.dumps({
                    "type": "auth_error", "error": f"séquence inconnue : {wanted}",
                }))
                return

            # Narration autorisée pour cette séquence (après un stop précédent).
            self._voice_quiet = False

            # Une séquence en cours (souvent auth après face OK) : on la coupe
            # avant d'en lancer une autre, sinon le monologue continue.
            try:
                self.sequences.abort()
            except Exception:  # noqa: BLE001
                pass
            # Laisse l'ancienne tâche sortir de son sleep/await avant de
            # relancer — sinon run() voit encore `_running` et ignore.
            await asyncio.sleep(0.05)

            async def say_to(event: str, **kw: Any) -> dict[str, Any] | None:
                return await self.say(event, ws, **kw)

            self.sequences._say = say_to
            task = asyncio.create_task(
                self.sequences.run(wanted, **self._say_context())
            )
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
            return

        # Faits d'enrôlement rapportés par le HUD. `enroll.name` et
        # `enroll.profile` n'étaient émis NULLE PART : les deux étapes qui les
        # attendent restaient bloquées jusqu'à leur délai de trente secondes,
        # sans phrase de repli — une minute de silence au milieu du scénario.
        # Le Core ne peut pas les deviner : le nom se saisit à l'écran.
        if data.get("action") == "enroll_signal":
            step = str(data.get("step") or "")
            if step in ("name", "profile", "voice", "face"):
                self.sequences.signal(f"enroll.{step}")
                await ws.send(json.dumps({
                    "type": "auth_enroll_signal", "ok": True, "step": step,
                }))
            else:
                await ws.send(json.dumps({
                    "type": "auth_error", "error": f"étape d'enrôlement inconnue : {step}",
                }))
            return

        action = str(data.get("action", "status"))
        result: dict[str, Any]

        if action == "status":
            result = {"type": "auth_status", **self.auth.status()}
        elif action == "start_enrollment":
            # Hermes / chat admin → même chemin que hud.enroll
            out = await self._start_kiosk_enrollment(data)
            result = {"type": "auth_enrollment_started", **out}
            await ws.send(json.dumps(result))
            return
        elif action == "enroll":
            try:
                # Après first_run : seul un ADMIN connecté peut enroler le foyer
                if not self.auth.users.is_first_run():
                    sess = self.auth.active
                    if not sess or not (
                        "user_management" in sess.permissions
                        or "dashboard_access" in sess.permissions
                    ):
                        result = {
                            "type": "auth_enroll_result",
                            "ok": False,
                            "error": "enrollment foyer réservé à l'admin",
                        }
                        await ws.send(json.dumps(result))
                        return
                # Après first_run : foyer = USER uniquement (jamais ADMIN ici).
                enroll_role = data.get("role")
                if not self.auth.users.is_first_run():
                    enroll_role = "USER"
                result = {
                    "type": "auth_enroll_result",
                    **self.auth.enroll(
                        str(data.get("username", "")),
                        display_name=data.get("display_name"),
                        pin=data.get("pin"),
                        face=bool(data.get("face", False)),
                        voice=bool(data.get("voice", False)),
                        gesture=bool(data.get("gesture", False)),
                        role=enroll_role,
                    ),
                }
            except ValueError as exc:
                result = {"type": "auth_enroll_result", "ok": False, "error": str(exc)}
        elif action == "login":
            result = {
                "type": "auth_login_result",
                **self.auth.login(
                    username=data.get("username"),
                    user_id=data.get("user_id"),
                    method=str(data.get("method", "stub")),
                    confidence=float(data.get("confidence", 0.0)),
                    pin=data.get("pin"),
                ),
            }
            if result.get("ok") and result.get("event"):
                await ws.send(json.dumps(result["event"]))
                # Session ouverte : coupe immédiatement le monologue auth.
                self._voice_quiet = True
                try:
                    self.sequences.abort()
                except Exception:  # noqa: BLE001
                    pass
                if self.voice is not None:
                    try:
                        await ws.send(json.dumps(self.voice.cancel()))
                    except Exception:  # noqa: BLE001
                        pass
        elif action == "recovery_login":
            # Niveau 0 (docs/RECOVERY.md) : PIN seul, sans caméra ni micro.
            # Le seul chemin qui fonctionne quand la biométrie est morte.
            result = {
                "type": "auth_recovery_result",
                **self.auth.recovery_login(
                    str(data.get("pin") or ""),
                    username=data.get("username"),
                ),
            }
            if result.get("ok") and result.get("event"):
                await ws.send(json.dumps(result["event"]))
                # Annoncé à voix haute : une entrée en secours ne doit jamais
                # être discrète. La maison doit entendre que quelqu'un est
                # entré par la porte de service.
                ev = await self.speak(
                    "Mode administrateur activé.",
                    user_id=self.auth.active.user_id if self.auth.active else "local",
                )
                await ws.send(json.dumps(ev))
        elif action == "elevate":
            result = {
                "type": "auth_elevate_result",
                **self.auth.elevate_admin(method=str(data.get("method", "stub"))),
            }
            if result.get("ok") and result.get("event"):
                await ws.send(json.dumps(result["event"]))
        elif action == "revoke_admin":
            result = {"type": "auth_revoke_result", **self.auth.revoke_admin()}
        elif action == "logout":
            result = {"type": "auth_logout_result", **self.auth.logout()}
        elif action == "list_users":
            # Foyer / enrollment — réservé admin (dashboard_access ou user_management)
            sess = self.auth.active
            if not sess or not (
                "dashboard_access" in sess.permissions or "user_management" in sess.permissions
            ):
                result = {
                    "type": "auth_users",
                    "ok": False,
                    "error": "permission refusée (admin)",
                    "users": [],
                }
            else:
                result = {
                    "type": "auth_users",
                    "ok": True,
                    "users": [u.to_public_dict() for u in self.auth.users.list_users()],
                }
        else:
            result = {"type": "auth_error", "error": f"action inconnue: {action}"}

        await ws.send(json.dumps(result))

    def _session_user_id(self) -> str | None:
        if self.auth is None:
            return None
        try:
            sess = self.auth.status().get("session") or {}
            user = sess.get("user") or {}
            uid = user.get("id")
            return str(uid) if uid else None
        except Exception:  # noqa: BLE001
            return None

    async def handle_gesture(self, ws: Any, data: dict[str, Any]) -> None:
        """Confidences MediaPipe → bus. Le HUD mesure, le bus décide.

        Rien n'est renvoyé sur `ws` : c'est le seul handler muet, et c'est
        voulu. Le HUD apprendra qu'un geste a été retenu en recevant
        `GESTURE_DETECTED` par le forwarder, comme n'importe quel client.
        """
        from .gestures import signals_from_hud

        for kind, payload in signals_from_hud(data):
            self.bus.publish(kind, payload, source="hud")

    async def handle_preferences(self, ws: Any, data: dict[str, Any]) -> None:
        """save/get hud_preferences + gesture_profile → core/data/users/<id>/."""
        from .auth.profiles import (
            load_gesture_profile,
            load_hud_preferences,
            resolve_user_id,
            save_gesture_profile,
            save_hud_preferences,
        )

        action = str(data.get("action", "get"))
        user_id = resolve_user_id(
            str(data.get("user_id") or data.get("userId") or "") or None,
            self._session_user_id(),
        )

        if action in ("get", "get_hud_preferences", "load"):
            prefs = load_hud_preferences(user_id)
            gesture = load_gesture_profile(user_id)
            await ws.send(json.dumps({
                "type": "preferences_result",
                "ok": True,
                "user_id": user_id,
                "prefs": prefs,
                "gesture": gesture,
            }))
            return

        if action in ("save_hud_preferences", "save_prefs"):
            prefs = data.get("prefs")
            if not isinstance(prefs, dict):
                await ws.send(json.dumps({"type": "preferences_result", "ok": False, "error": "prefs requis"}))
                return
            result = save_hud_preferences(user_id, prefs)
            await ws.send(json.dumps({"type": "preferences_result", "action": "save_hud_preferences", **result}))
            return

        if action in ("save_gesture_profile", "save_gesture"):
            profile = data.get("profile")
            if not isinstance(profile, dict):
                await ws.send(json.dumps({"type": "preferences_result", "ok": False, "error": "profile requis"}))
                return
            result = save_gesture_profile(user_id, profile)
            # La sensibilité prend effet tout de suite : pas besoin de relancer.
            self._apply_gesture_sensitivity(profile)
            # …et les bindings aussi, sinon le routeur servirait son cache.
            self.gestures.invalidate()
            if self.auth is not None and user_id != "local":
                try:
                    self.auth.users.mark_biometrics(user_id, gesture=True)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("mark gesture_enrolled: %s", exc)
            await ws.send(json.dumps({"type": "preferences_result", "action": "save_gesture_profile", **result}))
            return

        await ws.send(json.dumps({"type": "preferences_result", "ok": False, "error": f"action inconnue: {action}"}))

    async def handle_memory(self, ws: Any, data: dict[str, Any]) -> None:
        """Memory Manager local — type=memory → memories.json par user."""
        from .auth.profiles import resolve_user_id
        from . import memory as mem

        action = str(data.get("action", "list"))
        user_id = resolve_user_id(
            str(data.get("user_id") or data.get("userId") or "") or None,
            self._session_user_id(),
        )

        if action in ("list", "get", "status"):
            items = mem.list_items(user_id)
            await ws.send(json.dumps({
                "type": "memory_result",
                "ok": True,
                "action": "list",
                "user_id": user_id,
                "items": items,
                "sync": {
                    "local": True,
                    "cloud": False,
                    "git": False,
                },
            }))
            return

        if action in ("add", "create"):
            title = str(data.get("title") or "Souvenir")
            content = str(data.get("content") or "")
            tags = data.get("tags") if isinstance(data.get("tags"), list) else ["notes"]
            if not content.strip():
                await ws.send(json.dumps({"type": "memory_result", "ok": False, "error": "content requis"}))
                return
            item = mem.add_item(user_id, title=title, content=content, tags=[str(t) for t in tags])
            await ws.send(json.dumps({
                "type": "memory_result",
                "ok": True,
                "action": "add",
                "item": item,
                "items": mem.list_items(user_id),
                "sync": {"local": True, "cloud": False, "git": False},
            }))
            return

        if action == "delete":
            item_id = str(data.get("id") or data.get("item_id") or "")
            ok = mem.delete_item(user_id, item_id) if item_id else False
            await ws.send(json.dumps({
                "type": "memory_result",
                "ok": ok,
                "action": "delete",
                "items": mem.list_items(user_id),
                "error": None if ok else "introuvable",
            }))
            return

        await ws.send(json.dumps({"type": "memory_result", "ok": False, "error": f"action inconnue: {action}"}))

    async def handle_holomat(self, ws: Any, data: dict[str, Any]) -> None:
        """Events type=holomat — face + calibration machine (§6.8)."""
        from .auth.profiles import load_calibration, save_calibration

        action = str(data.get("action", "status"))
        calib = load_calibration()

        # Le moteur se charge en tâche de fond : distinguer « pas encore prêt »
        # de « indisponible », sinon le HUD affiche « missing » pendant le boot.
        face_ready = self.face is not None and self.face.ready
        face_state = self.face.status() if self.face is not None else {"state": "absent"}
        # La caméra est celle du NAVIGATEUR : le Core ne la voit qu'à travers
        # ce que le HUD lui rapporte. Recopier `face_ready` ici affichait
        # « caméra ok » avec la webcam débranchée dès que les modèles étaient
        # chargés — et l'inverse pendant les 20 s de chargement.
        camera = "unknown" if self._camera_ok is None else ("ok" if self._camera_ok else "missing")

        if action == "camera":
            # Le HUD vient d'obtenir (ou de perdre) getUserMedia.
            ok = bool(data.get("ok", False))
            self.note_camera(ok, None if ok else str(data.get("error") or "camera_unavailable"))
            await ws.send(json.dumps({
                "type": "holomat_status",
                "camera": "ok" if ok else "missing",
                "calibrated": bool(calib.get("calibrated")),
                "face_engine": face_ready,
                "face": face_state,
            }))
            return

        if action == "status":
            await ws.send(json.dumps({
                "type": "holomat_status",
                "camera": camera,
                "calibrated": bool(calib.get("calibrated")),
                "calibration": calib,
                "face_engine": face_ready,
                "algo": "opencv_sface" if face_ready else None,
                "face": face_state,
            }))
            return

        if action in ("calibrate_start", "calibrate"):
            # MVP : enregistre que la calib a été lancée avec caméra ON (Charuco full = Holomat Manager plus tard)
            camera_on = bool(data.get("camera_on", False))
            if not camera_on:
                await ws.send(json.dumps({
                    "type": "holomat_calibrate_result",
                    "ok": False,
                    "error": "camera_required",
                    "message": "Active la caméra (Settings → Vision) avant calibration Holomat.",
                }))
                return
            saved = save_calibration({
                "calibrated": True,
                "cameraDeviceId": data.get("cameraDeviceId") or data.get("camera_device_id"),
                "method": data.get("method", "charuco_stub"),
                "source": "hud_settings",
                "note": "Stub calib — remplacer par pipeline Charuco vendor/vision/Holomat",
            })
            await ws.send(json.dumps({
                "type": "holomat_calibrate_result",
                "ok": True,
                "calibrated": True,
                "calibration": saved,
                "path": "core/data/holomat/calibration.json",
            }))
            await ws.send(json.dumps({
                "type": "holomat_status",
                "camera": "ok",
                "calibrated": True,
                "calibration": saved,
                "face_engine": face_ready,
            }))
            return

        if action == "get_calibration":
            await ws.send(json.dumps({
                "type": "holomat_calibrate_result",
                "ok": True,
                "calibration": calib,
            }))
            return

        if self.face is None:
            await ws.send(json.dumps({"type": "holomat_error", "error": "face_engine_unavailable"}))
            return

        # Les actions suivantes ont besoin des modèles. Si le chargement de fond
        # n'est pas fini, on l'attend au lieu de refuser : tous les appelants
        # partagent la même tâche, et le reste du Core (chat, voix, PIN) est
        # resté disponible pendant ce temps — c'était l'inverse avant.
        if not self.face.ready and not await self.face.load():
            await ws.send(json.dumps({
                "type": "holomat_error",
                "error": "face_engine_unavailable",
                "face": self.face.status(),
            }))
            return

        if action == "face_enroll_begin":
            username = str(data.get("username", "")).strip()
            if not username:
                await ws.send(json.dumps({"type": "holomat_error", "error": "username requis"}))
                return
            await self.face.enroll_begin(username)
            await ws.send(json.dumps({
                "type": "FACE_PROGRESS",
                "progress": 0,
                "confidence": 0,
                "phase": "camera_on",
                "mode": "enroll",
                "hudText": "OPTICAL SENSOR ONLINE",
                "hudSubtext": "Acquisition biométrique",
            }))
            return

        if action == "face_frame":
            mode = str(data.get("mode", "verify"))
            jpeg_b64 = str(data.get("jpeg_b64", ""))
            if not jpeg_b64:
                await ws.send(json.dumps({"type": "holomat_error", "error": "jpeg_b64 manquant"}))
                return

            if mode == "enroll":
                username = str(data.get("username", "")).strip()
                ev = await self.face.enroll_add_frame(username, jpeg_b64)
                # Enrôlement : les points de référence sont trouvés dès qu'une
                # trame est acceptée, le modèle quand le lot est complet.
                if ev.get("ok"):
                    self.sequences.signal("face.landmarks")
                if ev.get("ready") or ev.get("complete"):
                    self.sequences.signal("face.model")
            else:
                ev = await self.face.verify_frame(
                    jpeg_b64,
                    username=data.get("username"),
                    user_id=data.get("user_id"),
                )
                # `face.matched` n'est émis QUE sur une reconnaissance réelle :
                # la séquence doit attendre le vrai verdict, pas la simple
                # arrivée d'une image. Sinon JARVIS annonce « identité
                # confirmée » devant n'importe qui.
                if ev.get("type") == "FACE_SUCCESS" and ev.get("user_id"):
                    self.sequences.signal("face.matched")
                    # SEUL endroit du programme où naît une attestation
                    # biométrique. C'est ici que le Core CONSTATE une
                    # identité ; `login()` exigera cette note et refusera un
                    # `user_id` que le HUD se contenterait d'affirmer.
                    matched_id = str(ev.get("user_id") or "")
                    if self.auth is not None and matched_id:
                        self.auth.attest_biometric(
                            matched_id, "face", float(ev.get("confidence") or 0.0)
                        )

            # ⚠ Présence = VISAGE YuNet stable, pas « une trame JPEG est arrivée ».
            # 3 hits consécutifs : un faux positif isolé (reflet TV, poster) ne
            # doit pas lancer le speech d'authentification dans une pièce vide.
            from .holomat.face_engine import PRESENCE_HITS_NEEDED

            if ev.get("face_found"):
                self._presence_hits += 1
                if self._presence_hits >= PRESENCE_HITS_NEEDED:
                    self.sequences.signal("face.presence")
                    self.sequences.signal("face.scanning")
            else:
                self._presence_hits = 0

            await ws.send(json.dumps(ev))
            return

        if action == "face_enroll_commit":
            username = str(data.get("username", "")).strip()
            user_id = str(data.get("user_id", "")).strip()
            if not username or not user_id:
                await ws.send(json.dumps({"type": "auth_enroll_result", "ok": False, "error": "username+user_id requis"}))
                return
            commit = await self.face.enroll_commit(username, user_id)
            if commit.get("ok"):
                self.sequences.signal("face.model")
            if commit.get("ok") and self.auth is not None:
                try:
                    self.auth.users.mark_biometrics(user_id, face=True)
                except Exception as exc:  # noqa: BLE001
                    commit = {"ok": False, "error": str(exc)}
            await ws.send(json.dumps({"type": "face_enroll_commit_result", **commit}))
            return

        await ws.send(json.dumps({"type": "holomat_error", "error": f"action inconnue: {action}"}))

    async def handle_voice(self, ws: Any, data: dict[str, Any]) -> None:
        """Events type=voice — TTS voicebox, barge-in, retour de lecture (§3.4)."""
        from .auth.profiles import resolve_user_id

        if self.voice is None:
            await ws.send(json.dumps({"type": "voice_error", "error": "voice_module_unavailable"}))
            return

        action = str(data.get("action", "status"))
        user_id = resolve_user_id(
            str(data.get("user_id") or data.get("userId") or "") or None,
            self._session_user_id(),
        )

        if action == "status":
            payload: dict[str, Any] = {"type": "voice_status", **self.voice.status()}
            if bool(data.get("probe")):
                payload["available"] = await self.voice.probe()
                payload.update(self.voice.status())
            if payload.get("available"):
                try:
                    payload["profiles"] = [
                        {"id": p.get("id"), "name": p.get("name")}
                        for p in await self.voice.client.profiles(refresh=True)
                    ]
                except Exception as exc:  # noqa: BLE001 — le status ne doit pas échouer
                    payload["profiles_error"] = str(exc)
            from .voice import resolve_voice

            payload["resolved"] = resolve_voice(user_id).to_dict()
            await ws.send(json.dumps(payload))
            return

        if action == "speak":
            ev = await self.speak(
                str(data.get("text") or ""),
                user_id=user_id,
                language=data.get("language"),
                preset=data.get("preset") or data.get("voicePreset"),
            )
            await ws.send(json.dumps(ev))
            return

        if action in ("cancel", "stop"):
            await ws.send(json.dumps(self.voice.cancel()))
            await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))
            return

        if action == "playback":
            phase = str(data.get("phase", "end"))
            ev = self.voice.on_playback(phase, data.get("utterance_id"))
            await ws.send(json.dumps(ev))
            if phase == "end" and not self.voice.speaking:
                await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))
            return

        if action == "transcribe":
            result = await self.voice.transcribe(
                str(data.get("audio_b64") or ""),
                filename=str(data.get("filename") or "capture.webm"),
                language=data.get("language"),
            )
            # Voix captée et transcrite : fait réel. On exige du TEXTE, pas
            # seulement un `ok` — une transcription vide veut dire que
            # personne n'a parlé, et la séquence ne doit pas avancer dessus.
            if result.get("ok") and (result.get("text") or "").strip():
                self.sequences.signal("voice.captured")
                self.sequences.signal("enroll.voice")
            await ws.send(json.dumps({"type": "voice_transcript", **result}))
            return

        if action == "save_profile":
            from .voice import save_voice_profile

            patch = data.get("voice")
            if not isinstance(patch, dict):
                await ws.send(json.dumps({"type": "voice_error", "error": "voice requis"}))
                return
            saved = save_voice_profile(user_id, patch)
            # ⚠ NE PAS poser `voice_enrolled` ici.
            #
            # `save_profile` enregistre un PRESET TTS : le timbre que JARVIS
            # emploie pour PARLER à cette personne. Ça n'a rien à voir avec
            # une empreinte vocale permettant de LA RECONNAÎTRE.
            #
            # Le drapeau était mis ici, si bien que choisir une voix de
            # synthèse faisait afficher « biométrie vocale : enrôlée » sur le
            # profil. Un drapeau de sécurité qui ment est pire que pas de
            # drapeau du tout : il sera lu comme une garantie.
            #
            # Il ne sera reposé que par un enrôlement d'empreinte réel, quand
            # la vérification du locuteur existera.
            await ws.send(json.dumps({"type": "voice_profile_saved", **saved}))
            return

        await ws.send(json.dumps({"type": "voice_error", "error": f"action inconnue: {action}"}))

    def _boot_requested(self, ws: Any) -> asyncio.Event:
        """Signal « ce client est prêt à entendre le boot », un par connexion."""
        events = getattr(self, "_boot_events", None)
        if events is None:
            events = {}
            self._boot_events = events
        key = id(ws)
        if key not in events:
            events[key] = asyncio.Event()
        return events[key]

    async def handle_boot(self, ws: Any, data: dict[str, Any]) -> None:
        """Le HUD signale la fin de sa cinématique — l'annonce peut partir.

        C'est ce qui SYNCHRONISE la voix avec l'image : le Core ne devine pas
        la durée de la cinématique, il attend qu'on la lui dise. Changer la
        durée du voyage, ajouter un acte, mettre une machine plus lente — rien
        de tout cela ne désynchronise quoi que ce soit.
        """
        action = str(data.get("action") or "announce")
        if action == "skip":
            # Refresh / session déjà ouverte : pas de monologue boot.
            # On arme quand même le signal pour ne pas bloquer le grace timer,
            # et on envoie un boot_state end silencieux.
            self._boot_requested(ws).set()
            self._boot_skip = True
            logger.info("boot skip demandé par le HUD (session déjà ouverte)")
            await self._send_boot_state(ws, spoken=False)
            return
        if action != "announce":
            await ws.send(json.dumps({"type": "core_error", "reason": f"action boot inconnue : {action}"}))
            return
        self._boot_skip = False
        logger.info("cinématique terminée — annonce du boot demandée par le HUD")
        self._boot_requested(ws).set()

    async def handle_surface(self, ws: Any, data: dict[str, Any]) -> None:
        """Admet un document de surface et le diffuse au HUD.

        Le Core est le SEUL chemin entre un agent et l'écran : rien n'atteint
        le HUD sans passer par cette validation. En P0 l'émetteur est un
        fichier JSON écrit à la main ; en P3 ce sera Hermes. Le contrôle est le
        même — c'est tout l'intérêt de le poser maintenant.

        Un refus repart à l'appelant avec sa raison, et n'est jamais diffusé :
        une composition invalide ne doit pas atteindre l'écran, même
        partiellement.
        """
        from .surface import SurfaceRejected, validate_document

        action = str(data.get("action") or "snapshot")

        if action == "catalog":
            await ws.send(
                json.dumps(
                    {
                        "type": "surface_catalog",
                        "ok": True,
                        "components": self.surfaces.catalog.names,
                    }
                )
            )
            return

        if action == "intent":
            # Une intention remontée par un composant. Elle n'exécute RIEN par
            # elle-même : la Policy tranche, et seule une autorisation permet
            # d'aller plus loin. C'est l'invariant du produit :
            #   IA → Proposition → Policy Engine → Autorisation → Exécution
            from .surface import gravity_for, risk_of

            intent = str(data.get("intent") or "")
            surface_id = str(data.get("surface_id") or "")
            component_id = str(data.get("component_id") or "")

            # ⚠ La gravité est DÉRIVÉE du catalogue, jamais reçue du client.
            # Elle était lue dans `data["gravity"]` : n'importe quel WebSocket
            # pouvait donc annoncer `gravity: "info"` pour une action `admin` et
            # traverser la Policy sans confirmation. Le HUD calculait bien la
            # bonne valeur, mais un contrôle appliqué du côté contrôlé n'est pas
            # un contrôle.
            component_name = self._surface_component_name(surface_id, component_id)
            gravity = gravity_for(self.surfaces.catalog, component_name, intent)

            claimed = data.get("gravity")
            if isinstance(claimed, str) and claimed.lower() != gravity:
                logger.warning(
                    "gravité annoncée « %s » ignorée · %s → %s (catalogue, composant %s)",
                    claimed,
                    intent,
                    gravity,
                    component_name or "?",
                )

            decision = self.policy.evaluate(action=intent, risk=RiskLevel(risk_of(gravity)))

            if not decision.allowed and not decision.needs_confirmation:
                logger.warning("intention REFUSÉE · %s (%s) — %s", intent, gravity, decision.reason)
                await ws.send(
                    json.dumps(
                        {"type": "surface_error", "ok": False, "intent": intent, "reason": decision.reason}
                    )
                )
                return

            if decision.needs_confirmation:
                approval_id, event = self.surfaces.open_approval(
                    intent=intent,
                    gravity=gravity,
                    reason=decision.reason or "Confirmation requise.",
                    surface_id=surface_id,
                )
                logger.info(
                    "intention EN ATTENTE · %s (%s) · approval=%s — %s",
                    intent,
                    gravity,
                    approval_id,
                    decision.reason,
                )
                await self.broadcast(event)
                await ws.send(
                    json.dumps({"type": "surface_result", "ok": True, "pending": approval_id})
                )
                return

            # Autorisée sans confirmation — gravité faible uniquement.
            logger.info("intention AUTORISÉE · %s (%s)", intent, gravity)
            await self._execute_intent(ws, intent, {"surface_id": surface_id, "component_id": component_id})
            return

        if action == "approval":
            approval_id = str(data.get("approval_id") or "")
            granted = bool(data.get("granted"))
            closed = self.surfaces.close_approval(approval_id, granted)
            if closed is None:
                await ws.send(
                    json.dumps({"type": "surface_error", "ok": False, "reason": "demande inconnue ou déjà traitée"})
                )
                return
            event, record = closed
            # Tracé dans les deux sens : une autorisation comme un refus doivent
            # laisser une trace. Un refus silencieux est indistinguable d'un bug.
            logger.info("approbation %s · approval=%s", "ACCORDÉE" if granted else "REFUSÉE", approval_id)
            await self.broadcast(event)

            if not granted:
                # Une phrase mise de côté pour cette demande n'a plus de raison
                # d'exister. La garder ferait s'accumuler en mémoire ce que
                # l'utilisateur vient précisément de refuser.
                self._pending_prompts.pop(approval_id, None)
                await ws.send(json.dumps({"type": "surface_result", "ok": True, "granted": False}))
                return

            # ⚠ Le maillon qui manquait. L'intention approuvée était perdue ici :
            # la carte disparaissait, l'état était rediffusé, et rien ne
            # s'exécutait. « Autorisation → Exécution » s'arrêtait à la flèche.
            await self._execute_intent(
                ws,
                str(record.get("intent") or ""),
                {"surface_id": record.get("surface_id", ""), "approval_id": approval_id},
                granted=True,
            )
            return

        if action == "open":
            # Une tuile du volet Applications. C'est une INTENTION, pas une app :
            # ce qui l'exécute derrière (Core, Hermes, agent d'appareil) ne
            # remonte jamais à l'utilisateur.
            #
            # Le chemin est identique à celui d'une intention émise par un
            # composant — même Policy, même carte d'autorisation, même exécution.
            # Le lanceur ne bénéficie d'aucun raccourci : c'est ce qui empêche
            # « cliquer sur Maison » d'être plus permissif que « demander à
            # Hermes d'allumer le salon ».
            from .capabilities import for_app

            app_id = str(data.get("app") or "")
            cap = for_app(app_id)
            if cap is None:
                await ws.send(
                    json.dumps(
                        {
                            "type": "surface_error",
                            "ok": False,
                            "app": app_id,
                            "reason": f"intention inconnue : « {app_id} »",
                        }
                    )
                )
                return

            await self._open_intent(ws, cap, str(data.get("prompt") or "").strip())
            return

        if action == "compose":
            # P3 — une question produit une surface. Le chemin est volontairement
            # identique à celui d'un document écrit à la main : la proposition du
            # LLM ne bénéficie d'AUCUN passe-droit, elle traverse la même
            # admission. C'est tout l'intérêt d'avoir fait P2 avant.
            from .composer import CompositionRejected, SurfaceComposer

            question = str(data.get("question") or "").strip()
            if not question:
                await ws.send(
                    json.dumps({"type": "surface_error", "ok": False, "reason": "question vide"})
                )
                return

            # La fenêtre visée. Sans elle, la composition atterrissait sous la
            # clé « main » du gabarit tandis que le HUD cherchait l'id de l'app :
            # admise, diffusée, et invisible. On l'exige donc explicitement.
            target = str(data.get("surface_id") or "").strip()
            if not target:
                await ws.send(
                    json.dumps(
                        {"type": "surface_error", "ok": False, "reason": "`surface_id` absent — on ne compose pas dans le vide"}
                    )
                )
                return

            permissions, context = self._surface_guards()
            composer = SurfaceComposer(self.surfaces.catalog, self.providers)

            try:
                proposal = await composer.propose(
                    question,
                    surface_id=target,
                    permissions=permissions,
                    binding_sources=self.bindings.describe(permissions),
                )
                document = validate_document(
                    proposal["document"],
                    self.surfaces.catalog,
                    permissions=permissions,
                    context=context,
                    bindings=self.bindings,
                )
            except (CompositionRejected, SurfaceRejected) as exc:
                # Critère de sortie P3 : « une proposition invalide est rejetée
                # ET VISIBLE ». Journal serveur et retour client, comme un refus
                # d'admission ordinaire.
                logger.warning("composition refusée · « %s » — %s", question[:60], exc)
                await ws.send(
                    json.dumps(
                        {
                            "type": "surface_error",
                            "ok": False,
                            "reason": str(exc),
                            "question": question,
                        }
                    )
                )
                return
            except Exception as exc:  # noqa: BLE001
                # Pas de LLM joignable, réseau coupé… `JARVIS BASE` doit survivre
                # sans IA : on refuse la composition, on ne casse pas le Core.
                logger.error("composition impossible · %s", exc)
                await ws.send(
                    json.dumps(
                        {"type": "surface_error", "ok": False, "reason": f"composition indisponible : {exc}"}
                    )
                )
                return

            event = self.surfaces.snapshot(document)
            await self.broadcast(event)
            logger.info(
                "surface COMPOSÉE · run=%s · surface=%s · confiance=%.2f · « %s »",
                event["run_id"][:8],
                target,
                proposal["confidence"],
                question[:60],
            )
            await ws.send(
                json.dumps(
                    {
                        "type": "surface_result",
                        "ok": True,
                        "composed": True,
                        "surface_id": target,
                        "confidence": proposal["confidence"],
                        "reasoning": proposal["reasoning"],
                    }
                )
            )
            return

        if action == "resync":
            # Le HUD a détecté un trou de séquence et jeté son état. On lui
            # renvoie l'état RÉEL (deltas compris), sans changer de `run_id` :
            # ce n'est pas une nouvelle composition, c'est la même, retrouvée.
            event = self.surfaces.resnapshot()
            if event is None:
                await ws.send(json.dumps({"type": "surface_error", "ok": False, "reason": "aucune surface en cours"}))
                return
            logger.info("resynchronisation · run=%s", event["run_id"][:8])
            await ws.send(json.dumps(event))
            return

        if action == "delta":
            ops = data.get("ops")
            if not isinstance(ops, list) or not ops:
                await ws.send(json.dumps({"type": "surface_error", "ok": False, "reason": "`ops` vide ou absent"}))
                return
            try:
                permissions, context = self._surface_guards()
                event = self.surfaces.delta(ops)
                # Le document patché doit rester admissible : un delta ne doit
                # pas pouvoir introduire par la bande un composant hors
                # catalogue — ni une permission, une prop ou une liaison de
                # données — que le snapshot aurait refusé.
                validate_document(
                    self.surfaces.document,
                    self.surfaces.catalog,
                    permissions=permissions,
                    context=context,
                    bindings=self.bindings,
                )
            except SurfaceRejected as exc:
                logger.warning("delta refusé : %s", exc)
                await ws.send(json.dumps({"type": "surface_error", "ok": False, "reason": str(exc)}))
                return
            await self.broadcast(event)
            logger.info("delta diffusé · run=%s · seq=%s · %d op(s)", event["run_id"][:8], event["seq"], len(ops))
            await ws.send(json.dumps({"type": "surface_result", "ok": True, "seq": event["seq"]}))
            return

        if action != "snapshot":
            await ws.send(
                json.dumps({"type": "surface_error", "ok": False, "reason": f"action inconnue : {action}"})
            )
            return

        try:
            permissions, context = self._surface_guards()
            document = validate_document(
                data.get("document"),
                self.surfaces.catalog,
                permissions=permissions,
                context=context,
                bindings=self.bindings,
            )
        except SurfaceRejected as exc:
            # Bruyant des deux côtés : journal serveur ET retour au client.
            logger.warning("surface refusée : %s", exc)
            await ws.send(json.dumps({"type": "surface_error", "ok": False, "reason": str(exc)}))
            return

        event = self.surfaces.snapshot(document)
        await self.broadcast(event)
        logger.info(
            "surface diffusée · run=%s · surfaces=%s",
            event["run_id"][:8],
            ", ".join(document.get("surfaces", {})),
        )
        await ws.send(json.dumps({"type": "surface_result", "ok": True, "run_id": event["run_id"]}))

    async def handle_ping(self, ws: Any, data: dict[str, Any]) -> None:
        await ws.send(
            json.dumps(
                self.cmd(
                    "display_notification",
                    message="Core en ligne — lien HUD établi.",
                    duration=3.0,
                )
            )
        )

    async def handle_chat(self, ws: Any, data: dict[str, Any]) -> None:
        if data.get("event") != "chat":
            return
        await self.handle_user_chat(ws, str(data.get("text", "")))

    async def handle_stop_run(self, ws: Any, data: dict[str, Any]) -> None:
        """Barge-in : coupe la parole + annule la mission DEV en cours."""
        if self.mission_dev.running:
            self.mission_dev.abort()
        if self.voice is not None:
            await ws.send(json.dumps(self.voice.cancel()))
        await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))

    async def handle_mission_dev(self, ws: Any, data: dict[str, Any]) -> None:
        """Mission Control DEV — start / abort (scenario cursor Phase A).

        Cockpit de développement uniquement. Le cockpit maison (Mission Control
        HOME) aura son propre type WS ; les deux ne se croisent jamais ici.
        """
        action = str(data.get("action", "start"))

        async def send(payload: dict[str, Any]) -> None:
            await ws.send(json.dumps(payload))

        async def speak(text: str) -> None:
            uid = self._session_user_id() or "local"
            await ws.send(json.dumps(self.cmd("set_orb_state", state="speaking")))
            ev = await self.speak(text, user_id=uid)
            await ws.send(json.dumps(ev))
            if ev.get("type") == "tts_skipped":
                await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))

        if action == "abort":
            self.mission_dev.abort()
            await send({"type": "mission_dev_finished", "ok": False, "error": "aborted"})
            return

        if action != "start":
            await send({"type": "mission_dev_error", "error": f"action inconnue: {action}"})
            return

        decision = self.policy.evaluate(
            action="mission_dev_start",
            text=str(data.get("project_name", "")),
            risk=RiskLevel.INFO,
        )
        if not decision.allowed:
            await send({
                "type": "mission_dev_error",
                "error": decision.reason or "Action refusée par la Policy Engine.",
            })
            return

        hermes_ok: bool | None = None
        hermes = self.supervisor.components.get("hermes")
        if hermes is not None:
            from .supervisor import READY

            hermes_ok = hermes.state == READY

        pname = str(data.get("project_name") or "").strip()
        if not pname:
            await send({
                "type": "mission_dev_error",
                "error": "Nom de projet manquant — dites « nouveau projet MonNom ».",
            })
            return

        await self.mission_dev.start(
            send=send,
            speak=speak,
            project_name=pname,
            scenario=str(data.get("scenario") or "cursor"),
            owner_user_id=self._session_user_id(),
            hermes_ok=hermes_ok,
        )

    async def handle_supervisor(self, ws: Any, data: dict[str, Any]) -> None:
        """État réel de chaque brique — ce que le HUD affiche au boot."""
        action = str(data.get("action", "status"))
        if action == "status":
            await ws.send(json.dumps({
                "type": "supervisor_status",
                **self.supervisor.status(),
                "bus": self.bus.stats(),
            }))
            return
        if action == "check":
            # Sonde tout de suite au lieu d'attendre le prochain tick.
            for comp in self.supervisor.components.values():
                comp.last_check = float("-inf")
            await self.supervisor.tick()
            await ws.send(json.dumps({
                "type": "supervisor_status",
                **self.supervisor.status(),
            }))
            return
        await ws.send(json.dumps({
            "type": "supervisor_status",
            "ok": False,
            "error": f"action inconnue: {action}",
        }))

    async def handle_agent_reach(self, ws: Any, data: dict[str, Any]) -> None:
        from .agent_reach_status import status as reach_status

        action = str(data.get("action", "status"))
        if action in ("status", "doctor"):
            await ws.send(json.dumps({"type": "agent_reach_status", **reach_status()}))
            return
        await ws.send(json.dumps({
            "type": "agent_reach_status",
            "ok": False,
            "error": f"action inconnue: {action}",
        }))

    async def handle_usage(self, ws: Any, data: dict[str, Any]) -> None:
        """Dashboard tokens — summary + séries + snapshots OpenRouter/ElevenLabs/Ollama."""
        import asyncio

        from .usage import dashboard_payload_async, series

        action = str(data.get("action", "summary"))
        gran = str(data.get("granularity", "day"))
        if gran not in ("hour", "day", "week", "month"):
            gran = "day"
        if action in ("summary", "dashboard", "status"):
            payload = await dashboard_payload_async(gran)
            await ws.send(json.dumps({"type": "usage_result", **payload}))
            return
        if action == "series":
            pts = await asyncio.to_thread(series, gran)
            await ws.send(json.dumps({
                "type": "usage_result",
                "ok": True,
                "granularity": gran,
                "series": pts,
            }))
            return
        await ws.send(json.dumps({
            "type": "usage_result",
            "ok": False,
            "error": f"action inconnue: {action}",
        }))

    async def on_message(self, ws: Any, raw: str) -> None:
        try:
            if isinstance(raw, (bytes, bytearray)):
                raw = raw.decode("utf-8", errors="replace")
            data = json.loads(raw)
        except json.JSONDecodeError:
            return
        if not isinstance(data, dict):
            return

        kind = str(data.get("type") or "")
        route = ROUTES.get(kind)
        if route is None:
            logger.debug("type WS ignoré : %r", kind)
            return

        payload = route.rewrite(data) if route.rewrite else data
        handler = getattr(self, route.handler)
        try:
            await handler(ws, payload)
        except Exception as exc:  # noqa: BLE001 — un handler cassé ne tue pas la connexion
            logger.exception("handler %s (%s) : %s", route.handler, kind, exc)
            await ws.send(json.dumps({
                "type": route.error_type,
                **route.error_extra,
                "error": str(exc),
            }))


async def handler(orchestrator: Orchestrator, ws: Any) -> None:
    orchestrator.clients.add(ws)
    logger.info("HUD connecté (%s client(s))", len(orchestrator.clients))
    try:
        await ws.send(json.dumps(orchestrator.cmd("boot")))
        mode = orchestrator.providers.current_mode()
        auth_hint = ""
        if orchestrator.auth is not None:
            st = orchestrator.auth.status()
            auth_hint = (
                " · first_run"
                if st.get("first_run")
                else f" · {st.get('user_count', 0)} user(s)"
            )
        await ws.send(
            json.dumps(
                orchestrator.cmd(
                    "display_notification",
                    message=f"JARVIS Core prêt · mode IA : {mode}{auth_hint}",
                    duration=4.0,
                )
            )
        )
        if orchestrator.auth is not None:
            await ws.send(json.dumps({"type": "auth_status", **orchestrator.auth.status()}))
        if orchestrator.voice is not None:
            # État connu sans sonder : la sonde vit dans start_background().
            await ws.send(json.dumps({"type": "voice_status", **orchestrator.voice.status()}))
        # État réel des briques dès la connexion → séquence de boot HUD sur des
        # faits, pas sur une animation scriptée.
        await ws.send(json.dumps({
            "type": "supervisor_status",
            **orchestrator.supervisor.status(),
        }))
        # Séquence de boot parlée — en tâche de fond pour ne pas retarder la
        # boucle de messages : le HUD doit rester réactif pendant que JARVIS
        # se présente.
        #
        # On GARDE une référence et on LOGGE les exceptions : un
        # `create_task()` nu peut être ramassé par le GC avant d'avoir tourné,
        # et son exception disparaît en silence — ce qui donne exactement le
        # symptôme « rien ne se passe, aucune erreur ».
        # ⚠ Annonce DIFFÉRÉE, pas immédiate.
        #
        # Le HUD joue une cinématique de près d'une minute avant d'afficher la
        # checklist. Il se connecte au tout début du raccord, pour que la
        # liaison soit établie quand l'écran apparaît — mais si le Core parlait
        # dès la connexion, JARVIS annoncerait les vérifications par-dessus la
        # fin de la cinématique, décalé de plusieurs secondes.
        #
        # Le HUD envoie donc `{"type": "boot", "action": "announce"}` quand la
        # cinématique se termine réellement. Le repli ci-dessous existe pour
        # tout client qui ne le fait pas — kiosque sans cinématique, outil de
        # diagnostic, `?boot=0` : sans lui, un HUD muet resterait bloqué.
        async def _boot_when_ready() -> None:
            try:
                await asyncio.wait_for(
                    orchestrator._boot_requested(ws).wait(), timeout=BOOT_ANNOUNCE_GRACE_S
                )
            except (asyncio.TimeoutError, TimeoutError):
                logger.debug("aucune demande d'annonce en %.0f s — boot joué d'office", BOOT_ANNOUNCE_GRACE_S)
            await orchestrator.speak_boot_sequence(ws)

        boot_task = asyncio.create_task(_boot_when_ready())
        orchestrator._tasks.add(boot_task)
        boot_task.add_done_callback(orchestrator._tasks.discard)
        boot_task.add_done_callback(
            lambda t: t.cancelled()
            or (t.exception() and logger.exception("séquence de boot", exc_info=t.exception()))
        )
        async for message in ws:
            await orchestrator.on_message(ws, message)
    finally:
        orchestrator.clients.discard(ws)
        logger.info("HUD déconnecté (%s client(s))", len(orchestrator.clients))


async def main() -> None:
    try:
        from websockets.asyncio.server import serve
    except ImportError:
        from websockets.server import serve  # type: ignore

    # `force=True` est indispensable : Alembic installe ses propres handlers
    # sur le logger racine pendant les migrations, qui tournent dans
    # `Orchestrator.__init__` — donc AVANT ce point. Sans `force`, basicConfig
    # est un no-op silencieux et TOUS les INFO du Core disparaissent, ce qui
    # donne un démarrage muet impossible à diagnostiquer.
    logging.basicConfig(
        level=logging.INFO, format="[%(name)s] %(message)s", force=True
    )
    orch = Orchestrator()
    logger.info("JARVIS Core → ws://%s:%s · mode=%s", HOST, PORT, orch.providers.current_mode())

    async with serve(lambda ws: handler(orch, ws), HOST, PORT):
        await orch.start_background()
        await asyncio.Future()


def run() -> None:
    try:
        from pathlib import Path

        from dotenv import load_dotenv

        env_path = Path(__file__).resolve().parents[1] / ".env"
        load_dotenv(env_path)
    except ImportError:
        pass
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nArrêt Core.")


if __name__ == "__main__":
    run()
