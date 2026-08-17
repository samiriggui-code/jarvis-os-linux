"""Phase 1 — lifecycle Orchestrator."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from typing import Any, Callable

from .bus import Bus
from .intents.registry import register_bindings, register_capabilities
from .policy import PolicyEngine, RiskLevel
from .providers import AIProviderManager
from .recovery import RecoveryManager
from .supervisor import DEGRADED, LOADING, READY, Supervisor
from .ws.connection import ConnectionRegistry

logger = logging.getLogger("jarvis.core")


class OrchestratorLifecycleMixin:

    def __init__(self) -> None:
        self.policy = PolicyEngine()
        self.providers = AIProviderManager()
        self.clients: set[Any] = set()
        self.connections = ConnectionRegistry()
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
        register_bindings(self)
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
        # Hôte (nuc/vps/pi) d'une demande d'approbation Terminal admin en
        # attente, indexé par `approval_id` — `open_approval()` ne garde pas
        # de champ libre pour ça dans son enregistrement.
        self._terminal_hosts: dict[str, str] = {}
        # Remplit `self.intents`, resté vide jusqu'ici. Une intention déclarée
        # sans exécutant reste refusée bruyamment — c'est l'invariant, pas un
        # défaut à masquer.
        register_capabilities(self)
        # Memory V2 + Verification §7 (M2.1) — pipeline live ; Memory seulement
        # après RESULT_VALIDATED. Un LLM ne produit jamais cette décision.
        from .memory import get_memory_api
        from .verification import VerificationPipeline

        memory_api = get_memory_api(emit=self.emit)
        self.verification = VerificationPipeline(
            memory_api=memory_api,
            emit=self.emit,
        )
        # Device Capability Discovery (Phase 0) — registre mémoire.
        # IntentCapability inchangé ; HostCapability vit dans devices.py.
        from .devices import DeviceRegistry

        self.devices = DeviceRegistry()
        self.devices.register_local_core()
        from .routing.router import CapabilityRouter

        self.router = CapabilityRouter(self.devices)
        from .device_dispatch import DeviceDispatch
        from .dev_agent.dispatch import DevAgentDispatch
        from .dev_agent.registry import DevRunRegistry
        from .workspace.registry import WorkspaceRegistry

        self.device_dispatch = DeviceDispatch(self.connections)
        self.dev_runs = DevRunRegistry()
        self.workspaces = WorkspaceRegistry()
        from .workspace.conventions import ensure_jarvis_main

        ensure_jarvis_main(self.workspaces)
        self.dev_agent_dispatch = DevAgentDispatch(
            self.connections,
            self.dev_runs,
            self.workspaces,
            self.router,
            emit=self.emit,
        )
        from .perception_dispatch import PerceptionDispatch
        from .vision_objects import SceneStore

        self.perception = PerceptionDispatch()
        # Scène objets (Worker isolé) — distincte de FaceEngine / holomat.
        self.scene = SceneStore()
        self.vision_objects = None
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
            from .vision import FaceRunner

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
        from .vision_objects import VisionObjectRouter

        self.gestures = GestureRouter(self.bus, self._load_gesture_profile)
        self.vision_objects = VisionObjectRouter(self.bus, self.scene)

        from .alerts import AlertRouter, DevicePresenceWatcher, ThresholdEngine

        self.thresholds = ThresholdEngine(emit=self.emit)
        self.device_watch = DevicePresenceWatcher(self.devices, emit=self.emit)
        self.alert_router: AlertRouter | None = None  # câblé dans start_background

        # Métriques système. `disk_path` : la racine porte /var, /storage et
        # les logs sur le NUC — c'est ce disque-là qui fait tomber JARVIS.
        from .metrics import MetricsSampler

        self.metrics = MetricsSampler(
            self.emit,
            degraded_count=self._degraded_components,
            disk_path=os.environ.get("JARVIS_DISK_PATH", "C:\\" if os.name == "nt" else "/"),
        )

        from .mission_dev import MissionDevRunner
        from .mission_dev.board import MissionDevBoardService

        self.mission_dev = MissionDevRunner()
        self.mission_board = MissionDevBoardService()

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
        # que le cache parle avec `jarvis3` : deux voix dans la même phrase.
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

        try:
            from .voice.tts_config import voicebox_tts_enabled

            vb_tts = "ENABLED" if voicebox_tts_enabled() else "DISABLED"
            el_dyn = "ACTIVE" if self.tts_live is not None else "inactive"
            logger.info(
                "TTS routing · dynamic=ElevenLabs (%s) · voicebox_tts=%s · voicebox_service=probe_deferred",
                el_dyn,
                vb_tts,
            )
        except Exception:  # noqa: BLE001
            pass

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

        self.recovery = RecoveryManager(
            self.say,
            policy=self.policy,
            soft_probes={
                "voice": soft_voice,
                "face": soft_face,
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
                # Phrase d'accès (STT) = facteur vocal réel. Pas de speaker-ID.
                # face_ready reste pour Holomat gestes/objets — hors auth.
                "speaker_verified": lambda: (
                    self.voice is not None and bool(getattr(self.voice, "available", False))
                ),
                **{
                    f"{name}_watched": watched(name)
                    for name in ("voice", "face", "holomat", "users", "agents")
                },
                # Auth = micro + voicebox. Caméra hors facteur d'accès.
                "no_biometrics": lambda: (
                    self.voice is None
                    or not bool(getattr(self.voice, "available", False))
                    or self._peripherals.get("mic") is False
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
        #: True le temps d'une utterance venue du Pi salon (Freebox / recherche).
        self._salon_turn = False
        #: Device cible pour le TTS satellite (ex. `pi-salon`).
        #: None = sortie locale du client qui a déclenché (HUD WS / navigateur).
        #: Ce n'est PAS un Capability Router : on répond sur le device qui a
        #: parlé, et on vérifie qu'il a `audio.output` dans le DeviceRegistry.
        #: Router multi-device = Phase ultérieure (DECISIONS Device Intelligence).
        self._tts_output_device_id: str | None = None
    async def start_background(self) -> None:
        """Chargements lents — appelé après serve(), jamais dans __init__.

        Le WS accepte déjà les connexions : chaque brique annonce son état au
        fur et à mesure au lieu de retarder le boot.
        """
        asyncio.create_task(self._forward_bus())
        asyncio.create_task(self.gestures.run())
        if self.vision_objects is not None:
            asyncio.create_task(self.vision_objects.run())
        asyncio.create_task(self.metrics.run())
        asyncio.create_task(self.thresholds.run(self.bus))
        asyncio.create_task(self.device_watch.run())
        self.alert_router = self._build_alert_router()
        if self.alert_router is not None:
            asyncio.create_task(self.alert_router.run())
        self._apply_gesture_sensitivity()
        self._register_components()
        self._components_ready.set()
        await self.supervisor.start()
        if self.voice is not None:
            asyncio.create_task(self._probe_voice())
        if self.face is not None:
            asyncio.create_task(self._load_face())
        asyncio.create_task(self._probe_agents())
        self._start_salon_ingest()

    def _build_alert_router(self):
        """AlertRouter V1 — notif HUD + voix, sans Hermes."""
        from .alerts import AlertRouter

        async def notify(message: str, level: str) -> None:
            await self.broadcast(
                self.cmd(
                    "display_notification",
                    message=message,
                    level=level,
                    duration=5.0,
                )
            )

        async def speak_alert(message: str) -> None:
            uid = self._session_user_id() or "local"
            ev = await self.speak(message, user_id=uid)
            if ev:
                await self.broadcast(ev)

        return AlertRouter(self.bus, notify=notify, speak=speak_alert)
    def _start_salon_ingest(self) -> None:
        """HTTP Pi → Core (loopback :8766, nginx proxifie `/v1/salon/` + `/v1/devices/`)."""
        try:
            from .salon_ingest import start_salon_ingest

            start_salon_ingest(
                asyncio.get_running_loop(),
                self.handle_salon_utterance,
                devices=self.devices,
            )
        except Exception:  # noqa: BLE001
            logger.warning("salon ingest non démarré", exc_info=True)
    def cmd(self, command: str, **kwargs: Any) -> dict[str, Any]:
        return {"command": command, **kwargs}
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

            # HOLOMAT = moteur CV partagé (écosystème), PAS la webcam d'un device.
            #
            #   face     → modèles YuNet + SFace chargés
            #   holomat  → FaceEngine prêt à traiter des frames de N'IMPORTE
            #              quel client (NUC, laptop, tablette…)
            #
            # La caméra est un PÉRIPHÉRIQUE par appareil (getUserMedia local).
            # Un kiosk qui monopolise /dev/video0 ou refuse la permission ne
            # doit PAS passer Holomat en degraded pour tout le monde —
            # `handle_peripheral` / `note_camera` racontent ça à part.
            async def holomat_check() -> bool:
                return self.face.ready

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
    async def _probe_voice(self) -> None:
        ok = await self.voice.probe()
        self.supervisor.note("voice", READY if ok else "degraded", self.voice.last_error)
    async def _load_face(self) -> None:
        self.supervisor.note("face", LOADING)
        self.supervisor.note("holomat", LOADING)
        ok = await self.face.load()
        state = READY if ok else DEGRADED
        err = self.face.error
        self.supervisor.note("face", state, err)
        # Holomat = même moteur, dispo pour tout client dès que chargé.
        self.supervisor.note("holomat", state, err)
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
