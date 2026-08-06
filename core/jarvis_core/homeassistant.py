"""Adaptateur Home Assistant — côté Core, sans LLM.

Le contrat est explicite (`JARVIS-Satellites.md` §, schéma repris tel quel) :

    Core → Home Assistant Adapter → HA API → Raspberry Pi → Zigbee / capteurs

**Hermes n'est pas dans ce chemin.** Et le cahier des charges §11 va plus loin :
« Mode 3 — Sans LLM : le Core continue (HA, Plex, Holomat, monitoring…) ». La
domotique doit fonctionner quand aucun modèle n'est joignable.

Ce module existe parce que la première version faisait l'inverse : `home.control`
partait chez Hermes, qui demandait à un modèle 8B de deviner quel outil appeler.
Ça marchait — en **475 secondes**, et seulement si on réduisait la surface d'outils
pour que le modèle cesse d'inventer. Une lampe ne se pilote pas par inférence.

Ici, tout est déterministe :

  * l'inventaire vient de `/api/states`, pas d'un raisonnement ;
  * la résolution « salon » + « lumière » → `light.salon_*` est un filtre, pas une
    interprétation ;
  * l'action est un POST sur `/api/services/{domain}/{service}`.

Ce qui reste à Hermes : ce qui **demande vraiment un jugement** — « prépare le salon
cinéma », une demande ambiguë, un arbitrage entre plusieurs options. C'est la
frontière que `JARVIS-Satellites.md` trace déjà entre réflexe et interprétation.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import unicodedata
from dataclasses import dataclass
from typing import Any
from urllib import error, parse, request

logger = logging.getLogger("jarvis.homeassistant")

DEFAULT_URL = "http://192.168.1.27:8123"

# L'inventaire change peu à l'échelle d'une commande vocale, et le relire à chaque
# fois ajouterait un aller-retour avant CHAQUE action. Trente secondes : assez
# court pour qu'un appareil nouvellement appairé apparaisse vite, assez long pour
# que « allume, éteins, rallume » ne fasse pas trois inventaires.
INVENTORY_TTL_S = 30.0

# Domaines qu'on accepte de piloter. Liste fermée et volontairement courte : un
# `ha_call_service` libre laisserait appeler `shell_command.*` ou `hassio.*`, qui
# ne sont pas de la domotique mais de l'administration système.
CONTROLLABLE = {"light", "switch", "fan", "cover", "climate", "media_player", "scene", "script"}

# Ce qu'on sait faire dire à HA, et rien d'autre. Le Core ne relaie pas une chaîne
# venue de l'extérieur vers l'API de la maison.
SERVICES = {
    "on": "turn_on",
    "off": "turn_off",
    "toggle": "toggle",
    "open": "open_cover",
    "close": "close_cover",
    "stop": "stop_cover",
}


class HomeAssistantUnavailable(RuntimeError):
    """HA n'est pas joignable ou pas configuré. Jamais silencieux."""


class HomeAssistantAmbiguous(RuntimeError):
    """Plusieurs cibles correspondent — on ne devine pas quelle lampe allumer."""


@dataclass(frozen=True)
class Entity:
    entity_id: str
    name: str
    state: str
    area: str | None

    @property
    def domain(self) -> str:
        return self.entity_id.split(".", 1)[0]


def _fold(text: str) -> str:
    """Minuscule sans accent — « Séjour » et « sejour » doivent se rencontrer.

    La reconnaissance vocale ne restitue pas les accents de façon fiable, et un
    utilisateur qui tape « salon » ne doit pas rater `Salon`.
    """
    normalized = unicodedata.normalize("NFD", str(text or "").lower())
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


class HomeAssistantAdapter:
    """Seule voie du Core vers Home Assistant.

    Aucun LLM, aucune dépendance HTTP supplémentaire : `urllib` +
    `asyncio.to_thread`, comme `providers.py` et `hermes.py`.
    """

    def __init__(self, url: str | None = None, token: str | None = None,
                 timeout: float = 8.0) -> None:
        self.url = (url or os.environ.get("JARVIS_HASS_URL") or DEFAULT_URL).rstrip("/")
        self.token = token or os.environ.get("JARVIS_HASS_TOKEN") or ""
        self.timeout = timeout
        self._inventory: tuple[float, list[Entity]] | None = None

    @property
    def configured(self) -> bool:
        return bool(self.token)

    # ── Lecture ──────────────────────────────────────────────────────────────

    def _get(self, path: str) -> Any:
        req = request.Request(
            f"{self.url}{path}",
            method="GET",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        with request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    async def health(self) -> bool:
        if not self.configured:
            return False
        try:
            return bool(await asyncio.to_thread(self._get, "/api/"))
        except Exception:
            return False

    async def inventory(self, *, force: bool = False) -> list[Entity]:
        """L'inventaire, fabriqué à partir des entités découvertes (§ contrat)."""
        if not self.configured:
            raise HomeAssistantUnavailable(
                "JARVIS_HASS_TOKEN absente — la maison n'est pas raccordée."
            )

        now = time.monotonic()
        if not force and self._inventory and now - self._inventory[0] < INVENTORY_TTL_S:
            return self._inventory[1]

        try:
            states = await asyncio.to_thread(self._get, "/api/states")
        except error.HTTPError as exc:
            raise HomeAssistantUnavailable(f"HTTP {exc.code} depuis Home Assistant") from exc
        except Exception as exc:  # noqa: BLE001
            raise HomeAssistantUnavailable(f"Home Assistant injoignable : {exc}") from exc

        entities = [
            Entity(
                entity_id=str(s.get("entity_id") or ""),
                name=str((s.get("attributes") or {}).get("friendly_name") or s.get("entity_id") or ""),
                state=str(s.get("state") or ""),
                area=(s.get("attributes") or {}).get("area") or None,
            )
            for s in states
            if isinstance(s, dict) and s.get("entity_id")
        ]
        self._inventory = (now, entities)
        logger.info("inventaire HA · %d entités", len(entities))
        return entities

    # ── Résolution ───────────────────────────────────────────────────────────

    async def resolve(self, phrase: str, *, domain: str | None = None) -> list[Entity]:
        """Quelles entités cette phrase désigne-t-elle ?

        Un filtre, pas une interprétation : on cherche les mots de la phrase dans
        le nom convivial et l'identifiant. Ce qui n'est pas trouvé n'est pas
        deviné — c'est le point : mieux vaut « je ne trouve pas cette lampe »
        qu'allumer celle de la chambre de l'enfant.
        """
        folded = _fold(phrase)
        wanted = domain or _domain_of(folded)

        out: list[Entity] = []
        for ent in await self.inventory():
            if ent.domain not in CONTROLLABLE:
                continue
            if wanted and ent.domain != wanted:
                continue
            haystack = _fold(f"{ent.name} {ent.entity_id} {ent.area or ''}")
            # Un mot de la pièce doit apparaître. Sans cette exigence, « allume la
            # lumière » viserait TOUTES les lampes de la maison.
            if any(len(w) > 3 and w in haystack for w in folded.split()):
                out.append(ent)
        return out

    # ── Action ───────────────────────────────────────────────────────────────

    async def call(self, entity: Entity, action: str) -> dict[str, Any]:
        """Appelle un service HA. `action` vient de `SERVICES`, jamais du dehors."""
        service = SERVICES.get(action)
        if service is None:
            raise HomeAssistantUnavailable(f"action « {action} » inconnue de l'adaptateur")
        if entity.domain not in CONTROLLABLE:
            raise HomeAssistantUnavailable(f"domaine « {entity.domain} » non pilotable")

        body = json.dumps({"entity_id": entity.entity_id}).encode("utf-8")
        # `quote` sur les deux segments : ils sont validés par les listes fermées
        # ci-dessus, mais l'interpolation dans un chemin d'URL est exactement
        # l'endroit où une validation oubliée devient une traversée.
        path = f"/api/services/{parse.quote(entity.domain)}/{parse.quote(service)}"

        def _post() -> Any:
            req = request.Request(
                f"{self.url}{path}",
                data=body,
                method="POST",
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                },
            )
            with request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8") or "[]")

        try:
            result = await asyncio.to_thread(_post)
        except error.HTTPError as exc:
            raise HomeAssistantUnavailable(f"HTTP {exc.code} sur {path}") from exc
        except Exception as exc:  # noqa: BLE001
            raise HomeAssistantUnavailable(f"Home Assistant injoignable : {exc}") from exc

        # L'inventaire vient de changer d'état — le relire à la prochaine demande.
        self._inventory = None
        logger.info("HA · %s → %s", entity.entity_id, service)
        return {"entity_id": entity.entity_id, "service": f"{entity.domain}.{service}",
                "changed": result if isinstance(result, list) else []}

    async def execute(self, phrase: str) -> dict[str, Any]:
        """Chemin complet d'une commande domestique — sans LLM, en millisecondes.

        Rend un résultat structuré ; c'est l'appelant (le Core) qui parle, jamais
        cet adaptateur ni Home Assistant (règle produit : *HA ne parle jamais*).
        """
        action = _action_of(_fold(phrase))
        targets = await self.resolve(phrase)

        if not targets:
            return {"ok": False, "reason": "aucun appareil ne correspond", "phrase": phrase}

        if action is None:
            # Pas d'ordre → c'est une question d'état, pas une commande.
            return {
                "ok": True,
                "action": "read",
                "entities": [{"id": e.entity_id, "name": e.name, "state": e.state} for e in targets],
            }

        if len(targets) > 1:
            # On ne choisit pas à la place de l'utilisateur. Le Core peut demander
            # une précision — c'est mieux qu'allumer la mauvaise pièce.
            raise HomeAssistantAmbiguous(
                "plusieurs appareils correspondent : "
                + ", ".join(e.name for e in targets[:5])
            )

        return {"ok": True, "action": action, **await self.call(targets[0], action)}


def _domain_of(folded: str) -> str | None:
    """Le mot employé désigne-t-il une famille d'appareils ?"""
    for words, domain in (
        (("lumiere", "lumieres", "lampe", "lampes", "eclairage"), "light"),
        (("volet", "volets", "store", "stores", "rideau", "rideaux"), "cover"),
        (("chauffage", "thermostat", "temperature"), "climate"),
        (("ventilateur", "ventilation"), "fan"),
        (("prise", "prises", "interrupteur"), "switch"),
        (("scene", "ambiance"), "scene"),
    ):
        if any(w in folded for w in words):
            return domain
    return None


def _action_of(folded: str) -> str | None:
    """L'ordre donné, ou `None` si la phrase ne demande rien à changer."""
    for words, action in (
        (("allume", "allumer", "active", "demarre", "ouvre la lumiere"), "on"),
        (("eteins", "eteindre", "coupe", "arrete", "desactive"), "off"),
        (("bascule", "inverse"), "toggle"),
        (("ouvre", "leve", "monte"), "open"),
        (("ferme", "baisse", "descend"), "close"),
        (("stoppe", "stop"), "stop"),
    ):
        if any(w in folded for w in words):
            return action
    return None
