"""JARVIS Core — orchestrateur minimal (dev)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
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

# Fenêtre pendant laquelle plusieurs périphériques qui reviennent comptent
# pour UN seul geste. Brancher une webcam à micro intégré fait remonter deux
# périphériques à quelques millisecondes d'intervalle : c'est un branchement,
# pas deux, et ça mérite une seule phrase de détection.
PERIPHERAL_DETECT_GROUP_S = 3.0


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
    "peripheral": Route("handle_peripheral", "core_error"),
    "preferences": Route("handle_preferences", "preferences_result", {"ok": False}),
    "memory": Route("handle_memory", "memory_result", {"ok": False}),
    "voice": Route("handle_voice", "voice_error"),
    "agent_reach": Route("handle_agent_reach", "agent_reach_status", {"ok": False}),
    "supervisor": Route("handle_supervisor", "supervisor_status", {"ok": False}),
    "usage": Route("handle_usage", "usage_result", {"ok": False}),
    "user_event": Route("handle_chat", "core_error"),
    "stop_run": Route("handle_stop_run", "core_error"),
    "mission": Route("handle_mission", "mission_error"),
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

        from .mission import MissionRunner

        self.mission = MissionRunner()

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
        #: État des périphériques rapporté par le HUD — `None` = jamais vu.
        #: Sert à ne parler qu'au changement, cf. `handle_peripheral`.
        self._peripherals: dict[str, bool] = {}
        #: Dernière annonce « détection en cours », pour regrouper les
        #: périphériques qui reviennent ensemble (webcam + micro intégré).
        self._detecting_said_at = 0.0
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

    def cmd(self, command: str, **kwargs: Any) -> dict[str, Any]:
        return {"command": command, **kwargs}

    async def start_background(self) -> None:
        """Chargements lents — appelé après serve(), jamais dans __init__.

        Le WS accepte déjà les connexions : chaque brique annonce son état au
        fur et à mesure au lieu de retarder le boot.
        """
        asyncio.create_task(self._forward_bus())
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
            async def holomat_check() -> bool:
                return self._camera_ok is True

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

            st = await asyncio.to_thread(agent_status)
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

    def _apply_gesture_sensitivity(self, profile: dict[str, Any] | None = None) -> None:
        """Seuils gestuels = préférence utilisateur, pas constante du Core."""
        try:
            if profile is None:
                from .auth.profiles import load_gesture_profile, resolve_user_id

                profile = load_gesture_profile(
                    resolve_user_id(None, self._session_user_id())
                )
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
        "audio_out": ("peripheral_audio_out_missing", "peripheral_audio_out_missing",
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

        if payload is None and fallback_text:
            # Pas en cache : phrase inédite ou domaine pas encore généré.
            payload = await self.speak(fallback_text, user_id=user_id)

        if payload is None:
            logger.debug("say(%s) : ni cache ni texte de repli", event)
            return None

        if ws is not None:
            await ws.send(json.dumps(payload))
        else:
            await self.broadcast(payload)
        return payload

    async def speak_boot_sequence(self, ws: Any) -> None:
        """Démarrage parlé : boot système, puis identification.

        Jouée sur la CONNEXION et non au lancement du Core : sans navigateur,
        personne n'entendrait rien.

        La séquence d'auth enchaîne derrière le boot — scan caméra, voix,
        fusion, salutation. Les étapes dont la brique est absente sont
        sautées : en développement sans caméra, on entend le boot puis la
        salutation, sans fausse annonce d'analyse.
        """
        if self.voice_cache is None:
            return

        # Rejouée à CHAQUE nouvelle connexion : une connexion = un HUD qui
        # démarre, et il doit s'annoncer. Un verrou définitif donnerait le
        # symptôme inverse — le premier onglet ouvert consomme la séquence et
        # plus personne ne l'entend jamais.
        #
        # Le garde-fou est temporel : une reconnexion en boucle (Wi-Fi qui
        # sautille, kiosque qui recharge) ne doit pas déclencher la séquence
        # toutes les deux secondes.
        now = time.monotonic()
        if now - self._boot_spoken_at < BOOT_REPLAY_COOLDOWN_S:
            logger.debug("Séquence de boot ignorée — rejouée trop récemment")
            return
        self._boot_spoken_at = now

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
        self.recovery.reset()
        ok = await self.sequences.run("boot")
        await ws.send(json.dumps({
            "type": "boot_state",
            "phase": "end",
            "ok": ok,
            "degraded": sorted(self.sequences.degraded),
            # Actions système retenues faute d'autorisation. Le HUD les
            # présente à un admin identifié — elles ne partent jamais seules.
            "pending_actions": [
                {"target": s.target, "command": s.command}
                for s in self.recovery.pending_system
            ],
        }))
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

    async def handle_user_chat(self, ws: Any, text: str) -> None:
        from .auth.profiles import load_hud_preferences, resolve_user_id, save_hud_preferences
        from .locale import resolve_reply_language, system_prompt_language

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
        if data.get("action") == "sequence_start":
            async def say_to(event: str, **kw: Any) -> dict[str, Any] | None:
                return await self.say(event, ws, **kw)

            self.sequences._say = say_to
            task = asyncio.create_task(
                self.sequences.run("auth", **self._say_context())
            )
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
            return

        action = str(data.get("action", "status"))
        result: dict[str, Any]

        if action == "status":
            result = {"type": "auth_status", **self.auth.status()}
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
                result = {
                    "type": "auth_enroll_result",
                    **self.auth.enroll(
                        str(data.get("username", "")),
                        display_name=data.get("display_name"),
                        pin=data.get("pin"),
                        face=bool(data.get("face", False)),
                        voice=bool(data.get("voice", False)),
                        gesture=bool(data.get("gesture", False)),
                        role=data.get("role"),
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
            # Une trame reçue = la caméra tourne et quelqu'un est devant.
            # C'est le premier fait réel de la séquence d'identification.
            self.sequences.signal("face.presence")
            self.sequences.signal("face.scanning")

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
                if ev.get("ok") and ev.get("match"):
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
        """Barge-in : coupe la parole + annule mission en cours."""
        if self.mission.running:
            self.mission.abort()
        if self.voice is not None:
            await ws.send(json.dumps(self.voice.cancel()))
        await ws.send(json.dumps(self.cmd("set_orb_state", state="idle")))

    async def handle_mission(self, ws: Any, data: dict[str, Any]) -> None:
        """Mission Control — start / abort (scenario cursor Phase A)."""
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
            self.mission.abort()
            await send({"type": "mission_finished", "ok": False, "error": "aborted"})
            return

        if action != "start":
            await send({"type": "mission_error", "error": f"action inconnue: {action}"})
            return

        decision = self.policy.evaluate(
            action="mission_start",
            text=str(data.get("project_name", "")),
            risk=RiskLevel.INFO,
        )
        if not decision.allowed:
            await send({
                "type": "mission_error",
                "error": decision.reason or "Action refusée par la Policy Engine.",
            })
            return

        hermes_ok: bool | None = None
        hermes = self.supervisor.components.get("hermes")
        if hermes is not None:
            from .supervisor import READY

            hermes_ok = hermes.state == READY

        await self.mission.start(
            send=send,
            speak=speak,
            project_name=str(data.get("project_name") or "HoloControl"),
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
        boot_task = asyncio.create_task(orchestrator.speak_boot_sequence(ws))
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
