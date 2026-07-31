"""Remise en service — ce que JARVIS tente avant de déclarer une brique perdue.

═══ DEUX ÉTAGES, ET LA FRONTIÈRE EST UNE RÈGLE DE SÉCURITÉ ═══════════════

    SOFT    — dans le processus. Recharger un modèle, resonder un service,
              rouvrir une connexion. Aucun privilège, aucune trace sur la
              machine, réversible par nature → tenté AUTOMATIQUEMENT.

    SYSTÈME — `systemctl restart`, `docker restart`, installer un paquet.
              Ça touche la machine → PROPOSÉ, jamais exécuté d'autorité.

Le cahier est sans ambiguïté : « L'IA ne reçoit jamais les droits root/admin
directement. Proposition → Policy Engine → Autorisation → Exécution. » Un
assistant qui s'auto-répare en lançant des commandes root pendant que personne
n'est identifié, c'est exactement le scénario que cette règle interdit — et le
moment où il le ferait (le démarrage) est celui où il y a le moins de monde
devant l'écran pour s'y opposer.

D'où le comportement au boot : les recouvrements SOFT sont tentés et annoncés,
les recouvrements SYSTÈME sont retenus et annoncés comme nécessitant une
intervention. Un admin identifié pourra les déclencher depuis le HUD.

═══ CE QUI N'EST PAS RÉCUPÉRABLE ═════════════════════════════════════════

Une caméra débranchée ne se répare pas par logiciel. Les périphériques n'ont
PAS de stratégie ici : ils relèvent de `dialogues/peripheriques.yaml`, qui dit
quel câble brancher. Confondre les deux, c'est annoncer « je relance la
vision » devant une prise USB vide.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from .policy import PolicyEngine, RiskLevel

logger = logging.getLogger("jarvis.recovery")

SOFT = "soft"
SYSTEM = "system"

#: Durée maximale d'une tentative. Au-delà, on rend la main : la séquence de
#: boot a ses propres délais et ne doit pas être prise en otage par une
#: remise en service qui pend.
ATTEMPT_TIMEOUT_S = 25.0


@dataclass(frozen=True)
class Strategy:
    """Comment on tente de remettre une brique en service."""

    #: `soft` (dans le processus) ou `system` (touche la machine).
    tier: str
    #: Phrase qui décrit la nature de la panne, dite avant la tentative.
    #: `None` = on enchaîne directement sur « Je relance … ».
    announce: str | None = None
    #: Cible pour l'étage système : unité systemd, conteneur, paquet.
    target: str | None = None
    #: Niveau de risque soumis à la Policy Engine.
    risk: RiskLevel = RiskLevel.INFO
    #: Commande proposée — jamais exécutée sans décision favorable.
    command: str | None = None


#: Table des stratégies, indexée par nom de composant du superviseur.
#:
#: `holomat` n'y figure PAS, volontairement : c'est la caméra, elle se
#: rebranche à la main. `users` non plus : une base injoignable au démarrage
#: est soit un fichier absent, soit une migration en attente — deux cas où
#: retenter en boucle abîme plus qu'il ne répare.
STRATEGIES: dict[str, Strategy] = {
    # Les modèles ONNX sont sur le disque : un `load()` qui a échoué sur une
    # erreur transitoire (mémoire, verrou) réussit souvent au second essai, et
    # ça ne coûte que quelques centaines de millisecondes.
    "face": Strategy(SOFT),
    # Sonde HTTP : voicebox a pu finir de charger ses modèles entre-temps
    # (`TimeoutStartSec=180` dans l'unité systemd — trois minutes de marge).
    "voice": Strategy(SOFT),
    "hermes": Strategy(SOFT),
    # Étage système : voicebox tourne en conteneur, piloté par son unité.
    "voice_container": Strategy(
        SYSTEM,
        announce="recovery_container_down",
        target="jarvis-voicebox",
        risk=RiskLevel.ADMIN,
        command="systemctl restart jarvis-voicebox",
    ),
    # agent-reach est un CLI absent : installation, donc paquet.
    "agents": Strategy(
        SYSTEM,
        announce="recovery_dependency_missing",
        target="agent-reach",
        risk=RiskLevel.ADMIN,
        command="npm install -g agent-reach",
    ),
}

#: Nom parlé de chaque brique — c'est le `{module}` de `cache_config.yaml`.
#:
#: Le SERVICE RENDU, jamais le logiciel : jamais « voicebox », jamais
#: « Hermes ». Sans article : ces noms n'apparaissent qu'en lecture à
#: deux-points (« Module : synthèse vocale. »), le registre de `auth.yaml`.
#:
#: ⚠ Doit correspondre AU CARACTÈRE PRÈS aux valeurs de `cache_config.yaml` :
#: la sélection du clip se fait sur la chaîne rendue. Un accent manquant et
#: le cache tire une variante au hasard — donc annonce le mauvais module.
MODULE_NAMES = {
    "voice": "synthèse vocale",
    "face": "reconnaissance faciale",
    "holomat": "capteurs optiques",
    "users": "base d'identités",
    "agents": "réseau d'agents",
    "hermes": "noyau cognitif",
}


@dataclass
class Attempt:
    """Trace d'une tentative — alimente le mode de secours et le journal."""

    component: str
    tier: str
    ok: bool
    detail: str | None = None


class RecoveryManager:
    """Tente, annonce, et retient ce qui n'a pas pu être réparé.

    `soft_probes` associe un composant à une coroutine qui REFAIT le travail
    de démarrage (recharger, resonder). Elle renvoie `True` si la brique
    répond enfin. C'est l'Orchestrator qui les fournit : le gestionnaire ne
    connaît aucune brique, il ne connaît que des stratégies.
    """

    def __init__(
        self,
        say: Callable[..., Awaitable[Any]],
        *,
        policy: PolicyEngine | None = None,
        soft_probes: dict[str, Callable[[], Awaitable[bool]]] | None = None,
    ) -> None:
        self._say = say
        self._policy = policy or PolicyEngine()
        self._probes = soft_probes or {}
        #: Ce qui reste cassé après tentative — lu pour le mode de secours.
        self.unrecovered: list[Attempt] = []
        #: Actions système retenues faute d'autorisation. Le HUD les propose
        #: à un admin identifié ; elles ne partent jamais toutes seules.
        self.pending_system: list[Strategy] = []

    def reset(self) -> None:
        self.unrecovered.clear()
        self.pending_system.clear()

    # ── entrée principale ────────────────────────────────────────────────

    async def attempt(self, component: str, **say_kwargs: Any) -> bool:
        """Tente de remettre `component` en service. Annonce chaque étape.

        Renvoie `True` seulement si la brique répond à l'issue de la
        tentative — jamais « j'ai lancé la commande, donc c'est réparé ».
        """
        strategy = STRATEGIES.get(component)
        module = MODULE_NAMES.get(component)
        if strategy is None or module is None:
            logger.debug("aucune stratégie pour « %s »", component)
            return False

        bindings = {"module": module}

        if strategy.announce:
            await self._say(strategy.announce, **say_kwargs)

        if strategy.tier == SOFT:
            return await self._soft(component, bindings, say_kwargs)
        return await self._system(component, strategy, bindings, say_kwargs)

    # ── étage soft ───────────────────────────────────────────────────────

    async def _soft(
        self, component: str, bindings: dict[str, str], say_kwargs: dict[str, Any]
    ) -> bool:
        probe = self._probes.get(component)
        if probe is None:
            logger.debug("« %s » : stratégie soft sans sonde câblée", component)
            return False

        await self._say("recovery_restart_start", bindings=bindings, **say_kwargs)
        try:
            ok = await asyncio.wait_for(probe(), timeout=ATTEMPT_TIMEOUT_S)
        except (asyncio.TimeoutError, TimeoutError):
            ok, detail = False, "délai dépassé"
        except Exception as exc:  # noqa: BLE001 — une tentative ratée n'est pas un crash
            ok, detail = False, str(exc)
        else:
            detail = None

        if ok:
            await self._say("recovery_restart_ok", **say_kwargs)
            logger.info("« %s » rétabli (soft)", component)
            return True

        await self._say("recovery_restart_failed", bindings=bindings, **say_kwargs)
        self.unrecovered.append(Attempt(component, SOFT, False, detail))
        logger.info("« %s » non rétabli (soft) : %s", component, detail or "sans réponse")
        return False

    # ── étage système ────────────────────────────────────────────────────

    async def _system(
        self,
        component: str,
        strategy: Strategy,
        bindings: dict[str, str],
        say_kwargs: dict[str, Any],
    ) -> bool:
        """Propose. N'exécute pas.

        La Policy Engine renvoie `needs_confirmation` sur tout ce qui touche
        au système : il FAUT un humain. Au démarrage il n'y en a pas encore —
        personne n'est identifié, la caméra n'a même pas commencé. On retient
        donc l'action et on le dit, plutôt que de la lancer dans le vide.
        """
        decision = self._policy.evaluate(
            f"recovery_{component}", strategy.command or "", strategy.risk
        )
        self.pending_system.append(strategy)
        self.unrecovered.append(
            Attempt(component, SYSTEM, False, decision.reason)
        )
        logger.info(
            "« %s » : %s retenue — %s",
            component, strategy.command, decision.reason or "confirmation requise",
        )
        await self._say("recovery_manual_required", **say_kwargs)
        return False

    # ── exécution différée, après autorisation explicite ─────────────────

    async def run_authorized(self, strategy: Strategy) -> bool:
        """Exécute une action système DÉJÀ autorisée par un humain.

        Appelée depuis le HUD par un admin identifié, jamais par la séquence
        de boot. Sépare volontairement la décision de l'exécution : c'est ce
        qui rend impossible qu'un chemin de code oublie la confirmation.
        """
        if strategy.command is None:
            return False
        binary = strategy.command.split()[0]
        if shutil.which(binary) is None:
            logger.warning("« %s » indisponible sur cette machine", binary)
            return False
        proc = await asyncio.create_subprocess_exec(
            *strategy.command.split(),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, err = await asyncio.wait_for(proc.communicate(), timeout=ATTEMPT_TIMEOUT_S)
        except (asyncio.TimeoutError, TimeoutError):
            proc.kill()
            logger.warning("« %s » : délai dépassé", strategy.command)
            return False
        if proc.returncode == 0:
            logger.info("« %s » exécutée", strategy.command)
            return True
        logger.warning("« %s » a échoué : %s", strategy.command, err.decode(errors="replace")[:200])
        return False
