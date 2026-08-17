"""Adaptateur Home Assistant — côté Core, sans LLM.

Le contrat est explicite (`JARVIS-Satellites.md` §, schéma repris tel quel) :

    Core → Home Assistant Adapter → HA API (NUC) → LAN → Zigbee radio (Pi) / appareils

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
from dataclasses import dataclass, field
from typing import Any
from urllib import error, parse, request

logger = logging.getLogger("jarvis.homeassistant")

from .gateway import HASS_DEFAULT_URL as DEFAULT_URL

# L'inventaire change peu à l'échelle d'une commande vocale, et le relire à chaque
# fois ajouterait un aller-retour avant CHAQUE action. Trente secondes : assez
# court pour qu'un appareil nouvellement appairé apparaisse vite, assez long pour
# que « allume, éteins, rallume » ne fasse pas trois inventaires.
INVENTORY_TTL_S = 30.0

# Domaines qu'on accepte de piloter. Liste fermée et volontairement courte : un
# `ha_call_service` libre laisserait appeler `shell_command.*` ou `hassio.*`, qui
# ne sont pas de la domotique mais de l'administration système.
CONTROLLABLE = {"light", "switch", "fan", "cover", "climate", "media_player", "scene", "script"}

# Doublon observé lors de la sonde réelle du 2026-08-13 : la Freebox Player
# expose DEUX entités media_player HA pour le même appareil physique —
# `freebox_player_pop` (intégration `freebox` : ni volume ni select_source) et
# `freebox_player_pop_2` (intégration `androidtv_remote` : volume mute/step en
# plus). On ignore la première pour ne jamais lever d'ambiguïté sur un appareil
# ne jamais lever d'ambiguïté sur un appareil unique — décision Core, aucune
# entité désactivée côté Home Assistant.
EXCLUDED_ENTITY_IDS: frozenset[str] = frozenset({"media_player.freebox_player_pop"})

# Services universels — présents sur tous les domaines pilotables.
_SERVICES_COMMON: dict[str, str] = {"on": "turn_on", "off": "turn_off", "toggle": "toggle"}

# Ce qu'on sait faire dire à HA, et rien d'autre. Par domaine : un même mot
# d'action (« stop ») ne pointe pas le même service selon l'appareil visé
# (volet vs lecteur média), donc pas de table plate. Chaque service ci-dessous
# correspond à une capacité réellement déclarée par un appareil de la maison
# (bitmask `supported_features` vérifié le 2026-08-13) — rien d'inventé.
SERVICES_BY_DOMAIN: dict[str, dict[str, str]] = {
    # cover n'a pas de service turn_on/turn_off côté HA — seulement toggle.
    "cover": {
        "toggle": "toggle",
        "open": "open_cover",
        "close": "close_cover",
        "stop": "stop_cover",
    },
    "media_player": {
        **_SERVICES_COMMON,
        "play": "media_play",
        "pause": "media_pause",
        "stop": "media_stop",
        "mute": "volume_mute",
    },
}


def _services_for_domain(domain: str) -> dict[str, str]:
    return SERVICES_BY_DOMAIN.get(domain, _SERVICES_COMMON)


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
    # Attributs bruts HA (ex. is_volume_muted) — nécessaires à M2.2 pour les
    # actions qui ne changent pas `state` lui-même (mute). Pas exposé avant
    # cette dataclass ; ajout additif, aucun consommateur existant ne le lisait.
    attributes: dict[str, Any] = field(default_factory=dict)

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
                attributes=dict(s.get("attributes") or {}),
            )
            for s in states
            if isinstance(s, dict)
            and s.get("entity_id")
            and str(s.get("entity_id")) not in EXCLUDED_ENTITY_IDS
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

    async def _post_service(self, domain: str, service: str, payload: dict[str, Any]) -> Any:
        """POST /api/services/{domain}/{service} — corps JSON arbitraire (play_media, etc.)."""
        if domain not in CONTROLLABLE and domain != "script":
            raise HomeAssistantUnavailable(f"domaine « {domain} » non pilotable")
        body = json.dumps(payload).encode("utf-8")
        path = f"/api/services/{parse.quote(domain)}/{parse.quote(service)}"

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
            return await asyncio.to_thread(_post)
        except error.HTTPError as exc:
            raise HomeAssistantUnavailable(f"HTTP {exc.code} sur {path}") from exc
        except Exception as exc:  # noqa: BLE001
            raise HomeAssistantUnavailable(f"Home Assistant injoignable : {exc}") from exc

    async def call(self, entity: Entity, action: str) -> dict[str, Any]:
        """Appelle un service HA. `action` vient de `SERVICES_BY_DOMAIN`, jamais du dehors."""
        service = _services_for_domain(entity.domain).get(action)
        if service is None:
            raise HomeAssistantUnavailable(f"action « {action} » inconnue de l'adaptateur")
        if entity.domain not in CONTROLLABLE:
            raise HomeAssistantUnavailable(f"domaine « {entity.domain} » non pilotable")

        result = await self._post_service(entity.domain, service, {"entity_id": entity.entity_id})
        self._inventory = None
        logger.info("HA · %s → %s", entity.entity_id, service)
        return {
            "entity_id": entity.entity_id,
            "service": f"{entity.domain}.{service}",
            "changed": result if isinstance(result, list) else [],
        }

    async def house_status(self) -> dict[str, Any]:
        """Snapshot lisible pour HUD / voix — inventaire réel, pas un rapport LLM.

        Sert « ouvre la maison » et les échecs honnêtes (0 lumière, lecteurs offline).
        """
        entities = await self.inventory(force=True)
        return build_house_status(entities)

    async def execute(self, phrase: str) -> dict[str, Any]:
        """Chemin complet d'une commande domestique — sans LLM, en millisecondes.

        Rend un résultat structuré ; c'est l'appelant (le Core) qui parle, jamais
        cet adaptateur ni Home Assistant (règle produit : *HA ne parle jamais*).
        """
        action = _action_of(_fold(phrase))
        wanted = _domain_of(_fold(phrase))
        targets = await self.resolve(phrase)

        if not targets:
            status = await self.house_status()
            reason = "aucun appareil ne correspond"
            if wanted == "light" and int(status.get("counts", {}).get("light") or 0) == 0:
                reason = (
                    "aucune lumière dans Home Assistant — "
                    "ajoute une intégration light, ou pilote un media_player (Apple TV…)"
                )
            return {
                "ok": False,
                "reason": reason,
                "phrase": phrase,
                "wanted_domain": wanted,
                "house_status": status,
            }

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

        # pre_state : nécessaire à M2.2 (re-observation) pour les actions dont
        # la cible n'est pas déterministe (toggle) — état lu AVANT l'appel,
        # jamais retouché après.
        return {
            "ok": True,
            "action": action,
            "pre_state": targets[0].state,
            **await self.call(targets[0], action),
        }

    async def resolve_streaming(self, phrase: str) -> list[Entity]:
        """Cible `media_player` pour Netflix / Disney / etc. — filtres pièce explicites."""
        folded = _fold(phrase)
        room = _room_of(folded)
        hints = _streaming_entity_hints(folded, room)
        app_key = _streaming_app_of(folded)
        source_name = _STREAMING_SOURCE_NAMES.get(app_key or "", "")

        candidates: list[Entity] = []
        for ent in await self.inventory():
            if ent.domain != "media_player":
                continue
            if ent.entity_id in EXCLUDED_ENTITY_IDS:
                continue
            hay = _fold(f"{ent.name} {ent.entity_id} {ent.area or ''}")
            if hints and not any(h in hay for h in hints):
                continue
            if hints and any(h in hay for h in hints):
                candidates.append(ent)
            elif any(len(w) > 3 and w in hay for w in folded.split()):
                candidates.append(ent)

        if not candidates and room:
            for ent in await self.inventory():
                if ent.domain != "media_player":
                    continue
                if ent.entity_id in EXCLUDED_ENTITY_IDS:
                    continue
                hay = _fold(f"{ent.name} {ent.entity_id} {ent.area or ''}")
                if any(h in hay for h in _ROOM_ENTITY_HINTS.get(room, ())):
                    candidates.append(ent)

        # « lance netflix » sans pièce : lecteurs joignables qui exposent l'app.
        if not candidates and app_key:
            for ent in await self.inventory():
                if ent.domain != "media_player":
                    continue
                if ent.entity_id in EXCLUDED_ENTITY_IDS:
                    continue
                if ent.state in ("unavailable", "unknown"):
                    continue
                if source_name and _entity_has_source(ent, source_name):
                    candidates.append(ent)
                    continue
                # Repli : lecteur on/off avec play_media (features pas toujours
                # dans attributes Entity — on accepte chambre/apple par défaut).
                hay = _fold(f"{ent.name} {ent.entity_id}")
                if any(k in hay for k in ("chambre", "apple", "appletv", "bravia", "freebox")):
                    candidates.append(ent)

        return _prefer_available_players(candidates)

    async def execute_streaming(self, phrase: str) -> dict[str, Any]:
        """Netflix / Disney / YouTube / Prime via HA — `select_source` si dispo."""
        app_key = _streaming_app_of(_fold(phrase))
        if app_key is None:
            return {"ok": False, "reason": "plateforme non reconnue", "phrase": phrase}

        android_pkg, apple_id, label = _STREAMING_APPS[app_key]
        source_name = _STREAMING_SOURCE_NAMES[app_key]
        targets = await self.resolve_streaming(phrase)
        if not targets:
            return {
                "ok": False,
                "reason": (
                    "aucun lecteur joignable — Apple TV chambre éteinte/injoignable, "
                    "ou Freebox/Bravia offline dans Home Assistant"
                ),
                "phrase": phrase,
            }
        if len(targets) > 1:
            # Si un seul a la source exacte, on le prend — sinon ambiguïté.
            with_src = [e for e in targets if _entity_has_source(e, source_name)]
            if len(with_src) == 1:
                targets = with_src
            else:
                raise HomeAssistantAmbiguous(
                    "plusieurs lecteurs correspondent : "
                    + ", ".join(e.name for e in targets[:5])
                )

        entity = targets[0]
        folded_entity = _fold(f"{entity.name} {entity.entity_id}")
        use_source = _entity_has_source(entity, source_name)
        if "apple" in folded_entity or "appletv" in folded_entity or "chambre" in folded_entity:
            content_id = apple_id
        else:
            content_id = android_pkg

        try:
            if entity.state in ("off", "unavailable", "unknown", "standby"):
                await self._post_service("media_player", "turn_on", {"entity_id": entity.entity_id})
            if use_source:
                result = await self._post_service(
                    "media_player",
                    "select_source",
                    {"entity_id": entity.entity_id, "source": source_name},
                )
                service = "media_player.select_source"
                how = source_name
            else:
                result = await self._post_service(
                    "media_player",
                    "play_media",
                    {
                        "entity_id": entity.entity_id,
                        "media_content_type": "app",
                        "media_content_id": content_id,
                    },
                )
                service = "media_player.play_media"
                how = content_id
        except HomeAssistantUnavailable as exc:
            return {"ok": False, "reason": str(exc), "entity_id": entity.entity_id}

        self._inventory = None
        logger.info("HA streaming · %s → %s (%s via %s)", entity.entity_id, label, how, service)
        return {
            "ok": True,
            "action": "streaming",
            "app": app_key,
            "label": label,
            "entity_id": entity.entity_id,
            "service": service,
            "source": source_name if use_source else None,
            "changed": result if isinstance(result, list) else [],
        }


# Apps streaming — package Android TV / bundle tvOS (best-effort HA play_media).
_STREAMING_APPS: dict[str, tuple[str, str, str]] = {
    "netflix": ("com.netflix.ninja", "com.netflix.Netflix", "Netflix"),
    "disney": ("com.disney.disneyplus", "com.disney.disneyplus", "Disney+"),
    "youtube": ("com.google.android.youtube.tv", "com.google.youtube.ios", "YouTube"),
    "prime": ("com.amazon.amazonvideo.livingroom", "com.amazon.aiv.AIVApp", "Prime Video"),
}

# Noms exacts dans `source_list` Apple TV (sonde NUC 2026-08-17).
_STREAMING_SOURCE_NAMES: dict[str, str] = {
    "netflix": "Netflix",
    "disney": "Disney+",
    "youtube": "YouTube",
    "prime": "Prime Video",
}

_ROOM_ENTITY_HINTS: dict[str, tuple[str, ...]] = {
    "chambre": ("chambre", "bedroom", "bravia", "apple", "appletv"),
    "salon": ("salon", "living", "sejour", "freebox", "samsung", "player"),
}


def _entity_has_source(ent: Entity, source_name: str) -> bool:
    if not source_name:
        return False
    sources = ent.attributes.get("source_list") or []
    wanted = _fold(source_name)
    return any(_fold(str(s)) == wanted for s in sources)


def _prefer_available_players(entities: list[Entity]) -> list[Entity]:
    """Écarte unavailable ; garde l'ordre sinon."""
    live = [e for e in entities if e.state not in ("unavailable", "unknown")]
    return live if live else entities


def _streaming_app_of(folded: str) -> str | None:
    if any(x in folded for x in ("amazon prime", "prime video", "prime")):
        # « prime » après les formes longues — évite de matcher un mot hors contexte
        # trop large ; « prime » seul reste volontaire (commande vocale courte).
        if "prime" in folded:
            return "prime"
    for key in ("netflix", "disney", "youtube"):
        if f" {key} " in f" {folded} ":
            return key
    return None

def _room_of(folded: str) -> str | None:
    if any(x in folded for x in ("apple tv", "appletv", "chambre", "bravia")):
        return "chambre"
    if any(x in folded for x in ("salon", "freebox", "samsung", "sejour")):
        return "salon"
    return None


def _streaming_entity_hints(folded: str, room: str | None) -> tuple[str, ...]:
    hints: list[str] = []
    if room:
        hints.extend(_ROOM_ENTITY_HINTS.get(room, ()))
    for token in ("apple tv", "appletv", "freebox", "bravia", "samsung", "player"):
        if token.replace(" ", "") in folded.replace(" ", "") or token in folded:
            hints.append(token.replace(" ", ""))
            hints.append(token)
    return tuple(dict.fromkeys(hints))


def _domain_of(folded: str) -> str | None:
    """Le mot employé désigne-t-il une famille d'appareils ?"""
    for words, domain in (
        (("lumiere", "lumieres", "lampe", "lampes", "eclairage"), "light"),
        (("volet", "volets", "store", "stores", "rideau", "rideaux"), "cover"),
        (("chauffage", "thermostat", "temperature"), "climate"),
        (("ventilateur", "ventilation"), "fan"),
        (("prise", "prises", "interrupteur"), "switch"),
        (("scene", "ambiance"), "scene"),
        (
            (
                "tele", "television", "televiseur", "tv",
                "apple tv", "appletv",
                "freebox player", "bravia",
            ),
            "media_player",
        ),
    ):
        if any(w in folded for w in words):
            return domain
    return None


def _action_of(folded: str) -> str | None:
    """L'ordre donné, ou `None` si la phrase ne demande rien à changer."""
    for words, action in (
        (("allume", "allumer", "active", "demarre", "ouvre la lumiere"), "on"),
        # Avant "off" : "coupe le son" ne doit pas retomber sur "coupe" (eteindre).
        (("coupe le son", "muet", "sourdine"), "mute"),
        (("eteins", "eteindre", "coupe", "arrete", "desactive"), "off"),
        (("bascule", "inverse"), "toggle"),
        (("ouvre", "leve", "monte"), "open"),
        (("ferme", "baisse", "descend"), "close"),
        (("mets en pause", "mets sur pause", "pause"), "pause"),
        (("reprends la lecture", "relance la lecture", "lance la lecture"), "play"),
        (("stoppe", "stop"), "stop"),
    ):
        if any(w in folded for w in words):
            return action
    return None


# Domaines prioritaires pour le tableau « état maison » HUD (ordre d'affichage).
_STATUS_DOMAINS: tuple[str, ...] = (
    "light",
    "switch",
    "media_player",
    "cover",
    "climate",
    "camera",
    "binary_sensor",
)


def build_house_status(entities: list[Entity]) -> dict[str, Any]:
    """Construit un snapshot maison à partir d'un inventaire déjà chargé.

    Pure / testable — pas d'appel réseau. CLAIM interdit : seules des OBSERVATIONS
    (entity_id, state) issues de HA.
    """
    from collections import Counter

    counts = Counter(e.domain for e in entities)
    rows: list[list[str]] = []
    for domain in _STATUS_DOMAINS:
        for ent in entities:
            if ent.domain != domain:
                continue
            # Capteurs binaires : on garde ceux « maison » utiles (pas tous les 20).
            if domain == "binary_sensor":
                hay = _fold(f"{ent.name} {ent.entity_id}")
                if not any(
                    k in hay
                    for k in (
                        "freebox",
                        "apple",
                        "samsung",
                        "tv",
                        "nuc",
                        "proliant",
                        "repeteur",
                        "player",
                    )
                ):
                    continue
            rows.append([domain, ent.name[:48], ent.state, ent.entity_id])
            if len(rows) >= 24:
                break
        if len(rows) >= 24:
            break

    n_light = int(counts.get("light") or 0)
    media = [e for e in entities if e.domain == "media_player"]
    media_ok = [e for e in media if e.state not in ("unavailable", "unknown")]
    spoken_parts = [f"{len(entities)} entités Home Assistant"]
    if n_light == 0:
        spoken_parts.append("aucune lumière enregistrée")
    else:
        spoken_parts.append(f"{n_light} lumière{'s' if n_light > 1 else ''}")
    if media_ok:
        spoken_parts.append(
            "lecteurs joignables : " + ", ".join(e.name for e in media_ok[:3])
        )
    else:
        spoken_parts.append("aucun lecteur média joignable")

    return {
        "ok": True,
        "action": "status",
        "total": len(entities),
        "counts": dict(counts),
        "columns": ["domaine", "nom", "état", "entité"],
        "rows": rows,
        "speech": ". ".join(spoken_parts) + ".",
    }
