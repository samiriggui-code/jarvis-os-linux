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
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

logger = logging.getLogger("jarvis.sequences")

# Débit du cache : PCM 24 kHz, 16 bits, mono.
BYTES_PER_SECOND = 24000 * 2

#: Relances d'attente, en secondes depuis le début de l'attente.
#:
#: DEUX MAXIMUM, puis silence — même règle que Mission Control DEV
#: (`dialogues/mission_dev.yaml`, § RELANCES D'ATTENTE). Un chargement de modèle de
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
    #: Si vrai : un timeout joue `on_timeout` puis RE-ATTEND le même signal,
    #: sans tuer la branche. Utile pour `face.presence` : la caméra navigateur
    #: peut démarrer après la séquence ; un échec définitif ici bloquait tout
    #: le reste de la narration face alors que le scan HUD continue.
    soft_timeout: bool = False
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
    #: `"never"` — silence : étape technique / préparation sans voix.
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
        # Holomat = moteur CV Core prêt (pas « webcam kiosk ouverte »).
        # Caméra = périphérique par appareil, rapportée à part.
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
        # Auth = phrase vocale (STT). Holomat face hors de ce chemin
        # (gestes / objets uniquement — décision 2026-08-07).
        Step("auth_started", min_hold_s=0.15, announce="never"),
        Step("peripheral_auth_degraded", when="no_biometrics", min_hold_s=0.6),
        Step("biometric_modules_sync", announce="never"),
        Step("sensors_calibrated", announce="never"),
        Step("voice_channel_open", when="speaker_verified", branch="voice"),
        Step("voice_prompt", awaits="voice.matched", timeout_s=45.0,
             on_timeout="voice_no_match", wait_event="voice_prompt_wait",
             when="speaker_verified", branch="voice", soft_timeout=True),
        Step("voice_analyzing", when="speaker_verified", branch="voice"),
        Step("voice_validated", min_hold_s=0.4, when="speaker_verified", branch="voice"),
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
        # ⚠ RELANCES D'ATTENTE — ajoutées le 2026-08-06.
        #
        # Cinq étapes de cette séquence attendent un signal, pour un total de
        # 105 s de délai possible. Aucune n'avait de `wait_event` : pendant ces
        # attentes JARVIS se taisait, puis reprenait son texte comme si de rien
        # n'était. Vu de l'écran, il récitait sans jamais regarder ce qui s'y
        # passait — c'est le défaut rapporté, et ce n'était pas du réseau.
        #
        # Les événements choisis sont DÉJÀ dans le cache vocal (`ack_working`
        # 6 clips, `voice_prompt_wait` 1). C'est délibéré : une phrase inédite
        # serait muette jusqu'à régénération du cache, et chaque clip est un
        # appel ElevenLabs facturé. On réutilise donc l'existant, ça parle tout
        # de suite et ça ne coûte rien.
        #
        # `WAIT_RELANCES_S = (8, 30)` : deux relances maximum, puis silence.
        # Le majordome ne commente pas son attente.
        Step("enrollment_start", min_hold_s=0.5),
        Step("enrollment_ask_name", awaits="enroll.name", timeout_s=30.0,
             wait_event="ack_working"),
        Step("enrollment_name_saved"),
        Step("enrollment_ask_profile_type", awaits="enroll.profile", timeout_s=30.0,
             wait_event="ack_working"),
        # -- Empreinte vocale
        Step("voice_enroll_start", when="voice_ready"),
        # `voice_prompt_wait` plutôt que `ack_working` : ici la personne est
        # censée PARLER. Si rien ne vient, « Rapprochez-vous du microphone »
        # est un diagnostic, pas une politesse d'attente.
        Step("voice_enroll_repeat", awaits="enroll.voice", timeout_s=25.0, when="voice_ready",
             wait_event="voice_prompt_wait"),
        Step("voice_sample_saved", when="voice_ready"),
        Step("voice_analysis_done", when="voice_ready"),
        # -- Profil facial. Séquence chorégraphiée avec le scan à l'écran :
        # l'ordre des étapes suit l'animation, ne pas le réordonner.
        Step("face_scan_init", when="face_ready"),
        Step("face_scan_landmarks", awaits="face.landmarks", timeout_s=15.0,
             when="face_ready", announce="after", wait_event="ack_working"),
        Step("face_scan_features", when="face_ready"),
        Step("face_scan_model", awaits="face.model", timeout_s=20.0,
             when="face_ready", announce="after", wait_event="ack_working"),
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
        # Pas de profile_loaded ici : sans binding user fiable ça tirait
        # « Inès » au hasard. Le welcome_back porte le titre (monsieur…).
        Step("session_opened", min_hold_s=0.25),
        Step("session_welcome_back", min_hold_s=0.6),
    ],
)

LOCK = Sequence(
    "lock",
    [
        Step("session_locked_manual", min_hold_s=0.5),
        Step("session_closed", min_hold_s=0.3),
    ],
)

LOCK_AUTO = Sequence(
    "lock_auto",
    [
        Step("session_locked_auto", min_hold_s=0.5),
        Step("session_goodbye", min_hold_s=0.3),
    ],
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


def watched_components(name: str) -> set[str]:
    """Briques dont une séquence révèle la ligne elle-même, à son rythme.

    Déduit des `awaits` plutôt qu'écrit à la main : ajouter une vérification au
    démarrage ne doit pas obliger à penser à une seconde liste ailleurs, sous
    peine de voir cette ligne-là s'allumer d'avance pendant que les autres
    attendent leur phrase.
    """
    seq = SEQUENCES.get(name)
    if seq is None:
        return set()
    return {s.awaits.split(".", 1)[0] for s in seq.steps if s.awaits}


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
        # `state=None` → laisser le superviseur donner l'état réel.
        reveal: Callable[[str, str | None], None] | None = None,
    ) -> None:
        self._say = say
        self._conditions = conditions or {}
        #: Allume la ligne d'une brique au HUD — `(composant, état)`.
        #:
        #: Le superviseur connaît la vérité bien avant qu'on la prononce : au
        #: démarrage nominal, tout est prêt depuis longtemps quand le
        #: navigateur arrive. Diffuser cet état en bloc allumait les six lignes
        #: d'un coup, puis JARVIS les énumérait pendant vingt secondes dans le
        #: vide. On révèle donc chaque ligne AU MOMENT de sa phrase : une
        #: action, un chargement, une voix.
        self._reveal = reveal
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
        self._abort = False
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

    def abort(self) -> None:
        """Coupe la séquence en cours (login réussi, refresh session, etc.).

        Arme aussi un signal interne pour débloquer une éventuelle attente.
        """
        if not self._running:
            self._abort = True
            return
        logger.info("séquence « %s » annulée", self._running)
        self._abort = True
        # Débloque toute attente en cours.
        for ev in self._waiters.values():
            ev.set()
        self._waiters.setdefault("__abort__", asyncio.Event()).set()

    async def _sleep(self, seconds: float) -> None:
        """Sleep interruptible par `abort()` — sinon un WAV coupe mais la
        séquence attend encore toute la durée estimée avant de s'arrêter."""
        if seconds <= 0 or self._abort:
            return
        end = time.monotonic() + seconds
        while not self._abort:
            remaining = end - time.monotonic()
            if remaining <= 0:
                return
            await asyncio.sleep(min(0.15, remaining))

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
        """Attend le succès OU l'échec. Renvoie `ok` / `failed` / `timeout` / `abort`.

        Sans `fail_name`, une brique qui se déclare morte tout de suite ferait
        quand même patienter jusqu'au timeout — quinze secondes de silence pour
        une réponse déjà connue.

        ⚠ `abort()` arme TOUS les waiters pour débloquer. Sans test `_abort`
        ici, l'annulation était lue comme un succès → greeting / systems_ready
        continuaient après un login réussi.
        """
        if self._abort:
            return "abort"
        ok_ev = self._waiters.setdefault(ok_name, asyncio.Event())
        if fail_name is None:
            got = await self._wait(ok_name, timeout)
            if self._abort:
                return "abort"
            return "ok" if got else "timeout"

        fail_ev = self._waiters.setdefault(fail_name, asyncio.Event())
        abort_ev = self._waiters.setdefault("__abort__", asyncio.Event())
        tasks = {
            asyncio.create_task(ok_ev.wait()): "ok",
            asyncio.create_task(fail_ev.wait()): "failed",
            asyncio.create_task(abort_ev.wait()): "abort",
        }
        try:
            done, _ = await asyncio.wait(
                tasks, timeout=timeout, return_when=asyncio.FIRST_COMPLETED
            )
        finally:
            for task in tasks:
                task.cancel()
        if self._abort:
            return "abort"
        if not done:
            logger.info("étape en attente de « %s » — délai dépassé", ok_name)
            return "timeout"
        outcomes = {tasks[t] for t in done}
        if "abort" in outcomes:
            return "abort"
        # Les deux d'un coup (transition immédiate) : le succès l'emporte.
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
        self._abort = False
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
                if self._abort:
                    logger.info("séquence « %s » stoppée (abort)", name)
                    return False
                if step.branch and step.branch in self._failed:
                    # La branche a déjà échoué : annoncer « analyse terminée »
                    # après « utilisateur non reconnu » serait absurde.
                    logger.debug("étape %s sautée (branche %s en échec)", step.event, step.branch)
                    continue
                if not self._allowed(step):
                    logger.debug("étape %s sautée (%s indisponible)", step.event, step.when)
                    continue
                ok = await self._play(step, say_kwargs)
                if self._abort:
                    logger.info("séquence « %s » stoppée après étape (abort)", name)
                    return False
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
            self._abort = False

    @property
    def degraded(self) -> set[str]:
        """Étapes en échec de la dernière séquence — pour le HUD et les logs."""
        return set(self._degraded)

    async def _play(self, step: Step, say_kwargs: dict[str, Any]) -> bool:
        if self._abort:
            return False
        # `announce="after"` : la phrase affirme un fait, elle attend donc que
        # le fait soit établi. On ne joue rien maintenant.
        # `announce="never"` : étape muette (préparation technique).
        deferred = step.awaits is not None and step.announce == "after"
        silent = step.announce == "never"

        # `awaits="voice.ready"` → la brique surveillée est « voice ». La
        # ligne passe en attente au moment où la phrase la nomme, et ne
        # tranchera qu'une fois la phrase finie.
        watched = step.awaits.split(".", 1)[0] if step.awaits else None
        if watched and self._reveal is not None:
            self._reveal(watched, "loading")

        payload = None if (deferred or silent) else await self._say(step.event, **say_kwargs)

        # Durée de l'audio : le Core ne sait pas quand le HUD a fini de jouer
        # tant que le retour `voice/playback end` n'est pas câblé. On estime
        # depuis la taille — exact, puisque le format est connu et constant.
        audio_s = (payload.get("bytes", 0) / BYTES_PER_SECOND) if payload else 0.0
        pause_s = ((payload or {}).get("pause_ms") or 0) / 1000

        if step.awaits:
            # On attend le fait réel PENDANT que l'audio joue : la caméra n'a
            # aucune raison de patienter que JARVIS ait fini sa phrase.
            started = time.monotonic()
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

            if outcome == "abort" or self._abort:
                return False

            ok = outcome == "ok"

            # ── Timeout souple (présence caméra, etc.) ──────────────────
            # La caméra est côté navigateur : elle peut arriver après le
            # démarrage de la séquence. On invite, puis on reprend l'attente
            # sans marquer la branche en échec.
            while (
                not ok
                and step.soft_timeout
                and step.on_timeout
                and not self._abort
            ):
                logger.info(
                    "attente soft « %s » — délai dépassé, relance",
                    step.awaits,
                )
                await self._say(step.on_timeout, **say_kwargs)
                self.signal_clear(step.awaits)
                if step.fails_on:
                    self.signal_clear(step.fails_on)
                outcome = await self._wait_outcome(
                    step.awaits, step.fails_on, step.timeout_s
                )
                if outcome == "abort" or self._abort:
                    return False
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
                    if outcome == "abort" or self._abort:
                        return False
                    ok = outcome == "ok"

            if ok and step.announce == "after":
                # Le fait est confirmé : on peut enfin l'affirmer.
                if self._abort:
                    return False
                payload = await self._say(step.event, **say_kwargs)
                audio_s = (payload.get("bytes", 0) / BYTES_PER_SECOND) if payload else 0.0
                pause_s = ((payload or {}).get("pause_ms") or 0) / 1000
                await self._sleep(max(audio_s + pause_s, step.min_hold_s))
            elif silent:
                await self._sleep(step.min_hold_s)
            else:
                # Laisser la phrase se terminer avant d'enchaîner.
                #
                # ⚠ On retranche le temps RÉELLEMENT passé à attendre, pas
                # `timeout_s`. L'ancien calcul (`- step.timeout_s`) partait du
                # principe que l'attente durait toujours son maximum. Or c'est
                # l'inverse au démarrage nominal : le superviseur a réarmé les
                # signaux (`_prime`), l'attente se résout en quelques
                # microsecondes, et `remaining` tombait donc à zéro pour un
                # `timeout_s` de 12 à 45 secondes.
                #
                # Conséquence observée : les six annonces de boot partaient
                # collées, chacune coupant la précédente. Ce qu'on entendait ne
                # correspondait plus à ce que l'écran cochait — « une action,
                # un chargement, une voix » n'était plus tenu.
                elapsed = time.monotonic() - started
                remaining = max(audio_s + pause_s, step.min_hold_s) - elapsed
                if remaining > 0:
                    await self._sleep(remaining)
                if self._abort:
                    return False
            # Verdict de la ligne, une fois la phrase terminée : l'écran
            # tranche au moment où la voix a fini de le dire.
            #
            # ⚠ En cas d'échec on NE force PAS « dégradé » : on demande son
            # état réel au superviseur (`state=None`). Une étape peut expirer
            # sans qu'il y ait panne — HOLOMAT VISION attend un flux caméra que
            # le Core ne tient pas, et qu'aucun navigateur n'a encore rapporté.
            # Forcer le rouge ici revenait à contredire la seule brique qui
            # sache, et à afficher une avarie là où il n'y a qu'un silence.
            if watched and self._reveal is not None:
                self._reveal(watched, "ready" if ok else None)

            if not ok:
                self._degraded.add(step.event)
                if step.branch:
                    # Marquer AVANT de jouer la ligne d'échec : c'est ce qui
                    # empêche la suite de la branche de contredire l'annonce.
                    self._failed.add(step.branch)
                    logger.info("branche « %s » en échec sur %s", step.branch, step.event)
                if step.on_timeout and not self._abort:
                    await self._say(step.on_timeout, **say_kwargs)
            return ok

        await self._sleep(max(audio_s + pause_s, step.min_hold_s))
        return not self._abort
