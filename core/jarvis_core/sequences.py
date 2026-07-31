"""Experience Orchestrator — enchaîne les séquences parlées (cahier §3.5).

Une séquence, c'est une suite d'étapes : chacune fait dire une phrase à JARVIS
(depuis le cache) et pilote l'orbe. C'est ce qui transforme 642 clips isolés en
une expérience.

═══ LA RÈGLE QUI COMPTE ═════════════════════════════════════════════════════

    ON AVANCE SUR ÉVÉNEMENT RÉEL, PAS SUR MINUTERIE.

Une étape qui attend `face.detected` attend la caméra, pas un `sleep(2)`.
Sinon JARVIS annonce « Analyse terminée » avant que la caméra ait démarré, et
l'illusion tombe au premier incident — celui où l'utilisateur regarde vraiment.

Tant qu'une brique n'existe pas (caméra, micro, gestes), l'étape retombe sur
sa durée nominale : la séquence reste jouable en développement, et devient
juste au fur et à mesure que les briques arrivent. `awaits` documente ce qui
DEVRA être branché — ce n'est pas un détail à retrouver plus tard.

Corollaire, et c'est là que le développement gagne : une brique ABSENTE en dev
se comporte exactement comme une brique TOMBÉE en prod. Le mode dégradé est
donc éprouvé tous les jours, au lieu d'être découvert le soir de la mise en
service.

═══ TROIS BORNES PAR ÉTAPE ══════════════════════════════════════════════════

    durée = max(durée_audio, min_hold)  ∧  attente(événement, timeout)

Le minimum évite les étapes qui défilent trop vite pour être lues. Le timeout
évite qu'une brique bloquée fige toute la séquence : au bout, on tombe sur la
ligne d'échec plutôt que de laisser l'utilisateur devant une orbe muette.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

logger = logging.getLogger("jarvis.sequences")

# Débit du cache : PCM 24 kHz, 16 bits, mono.
BYTES_PER_SECOND = 24000 * 2

#: Relances d'attente, en secondes depuis le début de l'attente.
#:
#: DEUX MAXIMUM, puis silence — même règle que Mission Control
#: (`dialogues/mission.yaml`, § RELANCES D'ATTENTE). Un chargement de modèle de
#: vingt secondes ponctué de « un instant » toutes les cinq secondes, et la
#: maison débranche l'enceinte. Le majordome ne commente pas son attente.
WAIT_RELANCES_S = (8.0, 30.0)


@dataclass(frozen=True)
class Step:
    """Une étape : une phrase, éventuellement une attente réelle."""

    event: str
    #: Nom du signal attendu avant de passer à la suite. `None` = purement
    #: narratif, on enchaîne dès la fin de l'audio.
    awaits: str | None = None
    #: Signal d'ÉCHEC. Sans lui, une brique qui se déclare morte en deux
    #: secondes ferait quand même patienter la séquence jusqu'au timeout :
    #: quinze secondes de silence pour une réponse déjà connue.
    fails_on: str | None = None
    #: Délai maximal d'attente du signal. Dépassé → `on_timeout`.
    timeout_s: float = 8.0
    #: Événement de repli si le signal n'arrive jamais.
    on_timeout: str | None = None
    #: Phrase de patience jouée pendant l'attente, aux instants
    #: `WAIT_RELANCES_S`. Ne remplace pas la ligne d'étape : quand le signal
    #: arrive, l'annonce prévue sort et la séquence reprend où elle en était.
    wait_event: str | None = None
    #: Échec ici = on n'a plus rien à annoncer. La séquence s'ARRÊTE, au lieu
    #: de continuer à cocher des lignes au-dessus d'une brique morte.
    #: Réservé à ce sans quoi la suite n'a aucun sens (base utilisateurs pour
    #: l'authentification). Tout le reste se dégrade et continue — le cahier
    #: §11 dit que JARVIS BASE survit à la perte de n'importe quel module.
    fatal: bool = False
    #: Composant à tenter de remettre en service avant de déclarer l'échec.
    #: `None` = pas de seconde chance (un câble débranché ne se relance pas).
    #: La tentative est annoncée — cf. `dialogues/recovery.yaml`.
    recovers: str | None = None
    #: Délai de la SECONDE attente, après la tentative de relance. Plus court
    #: que le premier : la brique vient d'être relancée, si elle ne répond
    #: pas vite c'est qu'elle ne répondra pas.
    retry_timeout_s: float = 10.0
    #: Durée d'affichage minimale, même si l'audio est plus court.
    min_hold_s: float = 0.0
    #: Étape sautée si le prédicat est faux (brique absente, droit manquant).
    when: str | None = None
    #: Branche à laquelle l'étape appartient. Si une étape de la branche
    #: ÉCHOUE (timeout), toutes les suivantes de la MÊME branche sont sautées.
    #:
    #: Sans ça on obtient l'absurdité observée en test : « Utilisateur non
    #: reconnu. » suivi de « Analyse terminée. » puis d'une salutation — la
    #: séquence continue comme si de rien n'était après avoir annoncé un
    #: échec.
    branch: str | None = None
    #: Quand prononcer la phrase par rapport à l'attente.
    #:
    #: `"before"` (défaut) — la phrase ANNONCE une action en cours :
    #:   « Comparaison avec la base… » puis on attend le résultat.
    #: `"after"` — la phrase AFFIRME un fait :
    #:   « Présence humaine détectée. » ne doit sortir qu'une fois la présence
    #:   réellement détectée. L'annoncer avant, c'est mentir — et c'est
    #:   exactement ce qui trahit une séquence scriptée.
    announce: str = "before"


@dataclass
class Sequence:
    name: str
    steps: list[Step] = field(default_factory=list)


# ═══ SÉQUENCE DE DÉMARRAGE ═══════════════════════════════════════════════
#
# Boot système, puis identification. L'ordre est celui de l'expérience, pas
# celui du code : l'utilisateur entend JARVIS s'éveiller, puis le voit le
# reconnaître.

# Six vérifications, six SONDES RÉELLES. Les `event` sont ceux de
# `dialogues/boot.yaml`, eux-mêmes calés sur les `boot_*` de `AuthScene.tsx` —
# la voix annonce ce que l'écran coche.
#
# ⚠ Ces étapes étaient six minuteries : `Step("boot_voice", min_hold_s=0.4)`.
# Elles cochaient six lignes vertes et annonçaient « Tous les systèmes sont
# opérationnels » avec voicebox éteint, la caméra débranchée et la base
# inaccessible. C'est le symptôme qui a motivé toute cette réécriture : le
# seul écran que l'utilisateur regarde vraiment mentait sur toute la ligne.
#
# `awaits` reçoit les signaux poussés par le superviseur (`<composant>.ready`
# / `.degraded`, cf. `Orchestrator.emit`). Un composant non enregistré
# n'émettra jamais : c'est le rôle du `when`, qui saute l'étape au lieu de la
# faire échouer. « Pas de ligne » vaut mieux que « éternellement KO ».
#
# `announce="after"` partout : ces phrases AFFIRMENT un fait (« Synthèse
# vocale active »). Les dire avant la sonde, c'est exactement le mensonge
# qu'on vient de retirer.
BOOT = Sequence(
    "boot",
    [
        Step("boot_hermes", awaits="hermes.ready", fails_on="hermes.degraded",
             timeout_s=12.0, on_timeout="boot_hermes_failed",
             wait_event="boot_wait", when="hermes_watched",
             recovers="hermes", announce="after", min_hold_s=0.4),
        Step("boot_voice", awaits="voice.ready", fails_on="voice.degraded",
             timeout_s=20.0, on_timeout="boot_voice_failed",
             wait_event="boot_wait", when="voice_watched",
             recovers="voice", announce="after", min_hold_s=0.4),
        # Chargement YuNet + SFace : ~20 s annoncées dans holomat/runner.py.
        # D'où le timeout le plus large et la relance de patience : c'est
        # l'étape où l'utilisateur se demande si ça a planté.
        Step("boot_face", awaits="face.ready", fails_on="face.degraded",
             timeout_s=45.0, on_timeout="boot_face_failed",
             wait_event="boot_wait", when="face_watched",
             recovers="face", announce="after", min_hold_s=0.4),
        # Le flux caméra est ouvert par le NAVIGATEUR : le Core ne peut que
        # l'apprendre. Le HUD le rapporte (`holomat/camera`), et tant qu'il
        # n'a rien dit le composant reste `unknown` — donc on attend.
        Step("boot_holomat", awaits="holomat.ready", fails_on="holomat.degraded",
             timeout_s=15.0, on_timeout="boot_holomat_failed",
             wait_event="boot_wait", when="holomat_watched",
             announce="after", min_hold_s=0.4),
        # SEULE étape fatale : sans base utilisateurs il n'y a personne à
        # reconnaître, et enchaîner sur la caméra n'a aucun sens.
        Step("boot_users", awaits="users.ready", fails_on="users.degraded",
             timeout_s=15.0, on_timeout="boot_users_failed",
             wait_event="boot_wait", when="users_watched",
             announce="after", min_hold_s=0.4, fatal=True),
        Step("boot_agents", awaits="agents.ready", fails_on="agents.degraded",
             timeout_s=15.0, on_timeout="boot_agents_failed",
             wait_event="boot_wait", when="agents_watched",
             recovers="agents", announce="after", min_hold_s=0.4),
        # La conclusion dépend de ce qui s'est réellement passé. « Tous les
        # systèmes sont opérationnels » n'est vrai que si RIEN n'a échoué —
        # sinon on le dit, à voix haute, plutôt que de laisser six lignes
        # vertes couvrir une brique morte.
        Step("boot_complete", when="nothing_degraded", min_hold_s=0.7),
        Step("boot_degraded", when="something_degraded", min_hold_s=0.7),
        # Mode de secours : les autres services ONT démarré, la maison
        # fonctionne, en retrait. Ce n'est pas un échec de démarrage, et la
        # phrase doit le dire — d'où deux lignes distinctes de `boot_degraded`.
        Step("recovery_mode_entered", when="something_degraded", min_hold_s=0.5),
        Step("recovery_mode_diagnostic", when="something_degraded", min_hold_s=0.4),
    ],
)

AUTH = Sequence(
    "auth",
    [
        # -- Préparation des capteurs. Purement narratif : rien à attendre.
        Step("auth_started", min_hold_s=0.4),
        # Ni caméra ni micro : la biométrie est hors de portée. Le dire tout
        # de suite et orienter vers le code, au lieu de laisser l'écran sur
        # « Veuillez rester immobile » devant un port USB vide. Les phrases
        # qui demandent de rebrancher, elles, sont déjà parties — c'est
        # `handle_peripheral` qui les envoie, au moment du débranchement.
        Step("peripheral_auth_degraded", when="no_biometrics", min_hold_s=0.6),
        Step("biometric_modules_sync"),
        Step("perception_ready", when="face_ready"),
        Step("sensors_calibrated"),
        # -- Caméra. C'est ici que la règle « événement réel » compte le plus.
        Step("environment_scan", when="face_ready", branch="face"),
        # `on_timeout` ne duplique PLUS l'étape suivante : personne devant la
        # caméra → on invite à se présenter, et la branche s'arrête là.
        # « Présence humaine détectée » n'est dite QU'APRÈS la détection.
        Step("presence_detected", awaits="face.presence", timeout_s=15.0,
             on_timeout="face_scan_prompt", when="face_ready", branch="face",
             announce="after"),
        # « Extraction des vecteurs » n'est dite qu'une fois le scan confirmé.
        Step("face_scan_active", awaits="face.scanning", timeout_s=10.0,
             when="face_ready", branch="face", announce="after"),
        Step("face_embedding", when="face_ready", branch="face"),
        Step("face_match_search", awaits="face.matched", timeout_s=12.0,
             on_timeout="face_denied", when="face_ready", branch="face"),
        Step("face_authenticated", min_hold_s=0.5, when="face_ready", branch="face"),
        # -- Voix. BRANCHE DÉSACTIVÉE tant que la vérification du locuteur
        # n'existe pas.
        #
        # `speaker_verified` renvoie False aujourd'hui, donc ces quatre étapes
        # sont sautées. Ce n'est pas un oubli, c'est le correctif :
        #
        # Ce qui validait la voix, c'était `voice.captured` — signalé dès que
        # la transcription rendait un texte non vide. Autrement dit :
        # N'IMPORTE QUI QUI PARLE validait le facteur, puis JARVIS annonçait
        # « Signature vocale validée » et « Authentification multimodale
        # confirmée ». Aucune empreinte vocale n'est stockée nulle part, et
        # aucune brique de vérification du locuteur n'existe dans le Core.
        #
        # Demander à quelqu'un de parler pour ensuite ne rien vérifier, c'est
        # du théâtre — et du théâtre qui compte comme facteur d'accès. On se
        # tait jusqu'à ce que la vérification soit réelle.
        #
        # Les phrases restent en cache : le jour où l'embedding locuteur
        # arrive (cf. discussion WeSpeaker / CAM++), il suffira que
        # `speaker_verified` dise vrai et que `awaits` pointe sur un signal de
        # CORRESPONDANCE, pas de simple captation.
        Step("voice_channel_open", when="speaker_verified", branch="voice"),
        Step("voice_prompt", awaits="voice.matched", timeout_s=12.0,
             on_timeout="voice_no_match", wait_event="voice_prompt_wait",
             when="speaker_verified", branch="voice"),
        Step("voice_analyzing", when="speaker_verified", branch="voice"),
        Step("voice_validated", min_hold_s=0.4, when="speaker_verified", branch="voice"),
        # -- Fusion et salutation : UNIQUEMENT si quelqu'un est identifié.
        # Saluer sans session, c'est dire « Ravi de vous revoir » à un inconnu
        # et tirer un titre au hasard entre monsieur, madame et mademoiselle.
        Step("auth_fusion", min_hold_s=0.5, when="identified"),
        Step("systems_ready", min_hold_s=0.5, when="identified"),
        Step("greeting", min_hold_s=0.6, when="identified"),
        Step("awaiting_instructions", when="identified"),
    ],
)

# ═══ ENRÔLEMENT ══════════════════════════════════════════════════════════
#
# « Jarvis, enrôle un nouvel utilisateur ». Deux règles non négociables, déjà
# posées dans `dialogues/enrolement.yaml` :
#   • cette séquence NE PEUT PAS produire un administrateur
#   • elle est lancée par un adulte identifié, jamais par une voix inconnue
#
# Tout est au vouvoiement : JARVIS ne sait pas encore à qui il parle, ou il
# est en train de l'apprendre.

ENROLLMENT = Sequence(
    "enrollment",
    [
        Step("enrollment_start", min_hold_s=0.5),
        Step("enrollment_ask_name", awaits="enroll.name", timeout_s=30.0),
        Step("enrollment_name_saved"),
        Step("enrollment_ask_profile_type", awaits="enroll.profile", timeout_s=30.0),
        # -- Empreinte vocale
        Step("voice_enroll_start", when="voice_ready"),
        Step("voice_enroll_repeat", awaits="enroll.voice", timeout_s=25.0, when="voice_ready"),
        Step("voice_sample_saved", when="voice_ready"),
        Step("voice_analysis_done", when="voice_ready"),
        # -- Profil facial. Séquence chorégraphiée avec le scan à l'écran :
        # l'ordre des étapes suit l'animation, ne pas le réordonner.
        Step("face_scan_init", when="face_ready"),
        Step("face_scan_landmarks", awaits="face.landmarks", timeout_s=15.0,
             when="face_ready", announce="after"),
        Step("face_scan_features", when="face_ready"),
        Step("face_scan_model", awaits="face.model", timeout_s=20.0,
             when="face_ready", announce="after"),
        Step("face_scan_done", min_hold_s=0.4, when="face_ready"),
        # -- Clôture
        Step("enrollment_configuring"),
        Step("enrollment_security_check"),
        Step("enrollment_done", min_hold_s=0.5),
    ],
)

# ═══ SESSION ═════════════════════════════════════════════════════════════

UNLOCK = Sequence(
    "unlock",
    [
        Step("session_opened", min_hold_s=0.3),
        Step("profile_loaded"),
        Step("greeting", min_hold_s=0.5),
    ],
)

LOCK = Sequence(
    "lock",
    [
        Step("session_locked_manual"),
        Step("session_closed", min_hold_s=0.4),
    ],
)

LOCK_AUTO = Sequence(
    "lock_auto",
    [Step("session_locked_auto", min_hold_s=0.4)],
)

# ═══ ACCÈS ADMIN ═════════════════════════════════════════════════════════
#
# Toujours ANNONCÉ à voix haute — c'est une exigence de `docs/RECOVERY.md` :
# une entrée en administration ne doit jamais être discrète, la maison doit
# l'entendre. Vaut pour l'élévation normale comme pour l'entrée de secours
# par PIN.

ADMIN = Sequence(
    "admin",
    [
        Step("admin_mode", min_hold_s=0.5),
        Step("admin_config_open"),
    ],
)

SEQUENCES = {
    s.name: s
    for s in (BOOT, AUTH, ENROLLMENT, UNLOCK, LOCK, LOCK_AUTO, ADMIN)
}


class SequenceRunner:
    """Exécute une séquence : parle, attend, enchaîne.

    `say` reçoit un nom d'événement et renvoie le payload envoyé au HUD (ou
    `None` si rien n'était en cache). `signal()` est appelé par les briques —
    caméra, micro — quand un fait réel se produit.
    """

    def __init__(
        self,
        say: Callable[..., Awaitable[dict[str, Any] | None]],
        *,
        conditions: dict[str, Callable[[], bool]] | None = None,
        prime: Callable[[Callable[[str], None]], None] | None = None,
        recover: Callable[[str], Awaitable[bool]] | None = None,
    ) -> None:
        self._say = say
        self._conditions = conditions or {}
        #: Tentative de remise en service, appelée avant de déclarer un échec.
        #: Renvoie `True` si la brique répond enfin. Absent = pas de seconde
        #: chance, comportement d'avant.
        self._recover = recover
        #: Ré-arme les faits DÉJÀ VRAIS juste après `reset_signals()`.
        #:
        #: Sans ça, une séquence rejouée n'entend que les transitions futures.
        #: Or le superviseur n'émet QUE sur transition : un Core démarré depuis
        #: dix minutes a fini de tout charger, et le HUD qui se connecte
        #: n'apprend plus rien. La séquence attendait alors `face.ready` pour
        #: une caméra prête depuis longtemps, jusqu'au timeout, et annonçait
        #: « Reconnaissance faciale indisponible ». Faux dans l'autre sens,
        #: mais tout aussi faux.
        self._prime = prime
        self._waiters: dict[str, asyncio.Event] = {}
        self._running: str | None = None
        #: Branches dont une étape a échoué pendant la séquence en cours.
        self._failed: set[str] = set()
        #: Étapes ayant échoué, branche ou pas. C'est ce qui permet de choisir
        #: entre « Tous les systèmes sont opérationnels » et l'aveu de panne :
        #: `_failed` ne voit que les branches, et le boot n'en a aucune.
        self._degraded: set[str] = set()

    # ── signaux venus des briques ───────────────────────────────────────

    def signal(self, name: str) -> None:
        """Un fait réel s'est produit — la séquence peut avancer.

        Appelable depuis n'importe où, y compris avant que quiconque attende :
        l'événement reste armé, et une étape qui arrive après passera sans
        bloquer.
        """
        self._waiters.setdefault(name, asyncio.Event()).set()
        logger.debug("signal %s", name)

    def reset_signals(self) -> None:
        self._waiters.clear()

    def signal_clear(self, name: str) -> None:
        """Désarme un signal avant de le réattendre.

        Indispensable entre les deux attentes d'une seconde chance : le
        `<x>.degraded` du premier échec est toujours armé, et la nouvelle
        attente se résoudrait instantanément dessus — on annoncerait la panne
        sans avoir laissé à la brique relancée la moindre occasion de
        répondre.
        """
        ev = self._waiters.get(name)
        if ev is not None:
            ev.clear()

    async def _wait(self, name: str, timeout: float) -> bool:
        ev = self._waiters.setdefault(name, asyncio.Event())
        try:
            await asyncio.wait_for(ev.wait(), timeout)
            return True
        except (asyncio.TimeoutError, TimeoutError):
            logger.info("étape en attente de « %s » — délai dépassé", name)
            return False

    async def _wait_outcome(
        self, ok_name: str, fail_name: str | None, timeout: float
    ) -> str:
        """Attend le succès OU l'échec. Renvoie `ok` / `failed` / `timeout`.

        Sans `fail_name`, une brique qui se déclare morte tout de suite ferait
        quand même patienter jusqu'au timeout — quinze secondes de silence pour
        une réponse déjà connue.
        """
        ok_ev = self._waiters.setdefault(ok_name, asyncio.Event())
        if fail_name is None:
            return "ok" if await self._wait(ok_name, timeout) else "timeout"

        fail_ev = self._waiters.setdefault(fail_name, asyncio.Event())
        tasks = {
            asyncio.create_task(ok_ev.wait()): "ok",
            asyncio.create_task(fail_ev.wait()): "failed",
        }
        try:
            done, _ = await asyncio.wait(
                tasks, timeout=timeout, return_when=asyncio.FIRST_COMPLETED
            )
        finally:
            for task in tasks:
                task.cancel()
        if not done:
            logger.info("étape en attente de « %s » — délai dépassé", ok_name)
            return "timeout"
        # Les deux d'un coup (transition immédiate) : le succès l'emporte.
        outcomes = {tasks[t] for t in done}
        return "ok" if "ok" in outcomes else "failed"

    async def _relances(self, event: str, say_kwargs: dict[str, Any]) -> None:
        """Phrases de patience pendant une attente longue, puis SILENCE.

        Annulée dès que l'attente se résout : une relance qui sortirait après
        l'annonce de résultat donnerait « Vision opérationnelle. Un instant. »
        """
        try:
            previous = 0.0
            for at in WAIT_RELANCES_S:
                await asyncio.sleep(at - previous)
                previous = at
                await self._say(event, **say_kwargs)
        except asyncio.CancelledError:
            raise

    # ── exécution ───────────────────────────────────────────────────────

    def _allowed(self, step: Step) -> bool:
        if step.when is None:
            return True
        # Conditions internes : elles portent sur la séquence en cours, pas sur
        # l'état du Core. L'appelant n'a aucun moyen de les fournir.
        if step.when == "nothing_degraded":
            return not self._degraded
        if step.when == "something_degraded":
            return bool(self._degraded)
        check = self._conditions.get(step.when)
        if check is None:
            # Condition inconnue = brique pas encore déclarée. On saute
            # plutôt que d'annoncer une analyse qui n'aura pas lieu.
            return False
        try:
            return bool(check())
        except Exception:  # noqa: BLE001
            return False

    async def run(self, name: str, **say_kwargs: Any) -> bool:
        """Joue une séquence de bout en bout. Renvoie False si interrompue."""
        seq = SEQUENCES.get(name)
        if seq is None:
            logger.warning("séquence inconnue : %s", name)
            return False
        if self._running:
            logger.info("séquence « %s » ignorée — « %s » en cours", name, self._running)
            return False

        self._running = name
        self._failed.clear()
        self._degraded.clear()
        self.reset_signals()
        if self._prime is not None:
            # Après le reset, jamais avant : sinon on efface ce qu'on vient
            # d'armer.
            try:
                self._prime(self.signal)
            except Exception as exc:  # noqa: BLE001 — jamais bloquant
                logger.warning("amorçage des signaux : %s", exc)
        logger.info("Séquence « %s » — %d étapes", name, len(seq.steps))
        try:
            for step in seq.steps:
                if step.branch and step.branch in self._failed:
                    # La branche a déjà échoué : annoncer « analyse terminée »
                    # après « utilisateur non reconnu » serait absurde.
                    logger.debug("étape %s sautée (branche %s en échec)", step.event, step.branch)
                    continue
                if not self._allowed(step):
                    logger.debug("étape %s sautée (%s indisponible)", step.event, step.when)
                    continue
                ok = await self._play(step, say_kwargs)
                if not ok and step.fatal:
                    # Rien à annoncer au-dessus d'une brique dont tout le reste
                    # dépend. On s'arrête ici, la ligne d'échec a été dite.
                    logger.warning(
                        "séquence « %s » interrompue — %s indisponible",
                        name, step.event,
                    )
                    return False
            return True
        finally:
            self._running = None

    @property
    def degraded(self) -> set[str]:
        """Étapes en échec de la dernière séquence — pour le HUD et les logs."""
        return set(self._degraded)

    async def _play(self, step: Step, say_kwargs: dict[str, Any]) -> bool:
        # `announce="after"` : la phrase affirme un fait, elle attend donc que
        # le fait soit établi. On ne joue rien maintenant.
        deferred = step.awaits is not None and step.announce == "after"
        payload = None if deferred else await self._say(step.event, **say_kwargs)

        # Durée de l'audio : le Core ne sait pas quand le HUD a fini de jouer
        # tant que le retour `voice/playback end` n'est pas câblé. On estime
        # depuis la taille — exact, puisque le format est connu et constant.
        audio_s = (payload.get("bytes", 0) / BYTES_PER_SECOND) if payload else 0.0
        pause_s = ((payload or {}).get("pause_ms") or 0) / 1000

        if step.awaits:
            # On attend le fait réel PENDANT que l'audio joue : la caméra n'a
            # aucune raison de patienter que JARVIS ait fini sa phrase.
            relances = (
                asyncio.create_task(self._relances(step.wait_event, say_kwargs))
                if step.wait_event and step.timeout_s > WAIT_RELANCES_S[0]
                else None
            )
            try:
                outcome = await self._wait_outcome(
                    step.awaits, step.fails_on, step.timeout_s
                )
            finally:
                if relances is not None:
                    relances.cancel()
                    # Attendre l'annulation : sinon une relance déjà en train de
                    # parler double la ligne de résultat.
                    try:
                        await relances
                    except asyncio.CancelledError:
                        pass

            ok = outcome == "ok"

            # ── Seconde chance ──────────────────────────────────────────
            # Une brique qui n'a pas répondu n'est pas encore perdue : on
            # tente de la remettre en service, à voix haute, puis on
            # RE-ATTEND son signal. Sans cette seconde attente on annoncerait
            # « Rétabli » sur la seule foi d'avoir lancé une commande — le
            # même mensonge qu'avant, déplacé d'un cran.
            if not ok and step.recovers and self._recover is not None:
                self.signal_clear(step.awaits)
                if step.fails_on:
                    self.signal_clear(step.fails_on)
                if await self._recover(step.recovers):
                    outcome = await self._wait_outcome(
                        step.awaits, step.fails_on, step.retry_timeout_s
                    )
                    ok = outcome == "ok"

            if ok and step.announce == "after":
                # Le fait est confirmé : on peut enfin l'affirmer.
                payload = await self._say(step.event, **say_kwargs)
                audio_s = (payload.get("bytes", 0) / BYTES_PER_SECOND) if payload else 0.0
                pause_s = ((payload or {}).get("pause_ms") or 0) / 1000
                await asyncio.sleep(max(audio_s + pause_s, step.min_hold_s))
            else:
                remaining = max(0.0, audio_s + pause_s - step.timeout_s)
                if remaining:
                    await asyncio.sleep(remaining)
            if not ok:
                self._degraded.add(step.event)
                if step.branch:
                    # Marquer AVANT de jouer la ligne d'échec : c'est ce qui
                    # empêche la suite de la branche de contredire l'annonce.
                    self._failed.add(step.branch)
                    logger.info("branche « %s » en échec sur %s", step.branch, step.event)
                if step.on_timeout:
                    await self._say(step.on_timeout, **say_kwargs)
            return ok

        await asyncio.sleep(max(audio_s + pause_s, step.min_hold_s))
        return True
