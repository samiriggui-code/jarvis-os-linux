"""Adaptateur Plex — côté Core, sans LLM.

Le cahier des charges §11 nomme Plex explicitement dans la liste de ce qui doit
survivre au « Mode 3 — sans LLM : le Core continue (HA, **Plex**, Holomat…) ».
`media.video` était pourtant déclarée `Owner.DEVICE`, avec la note « relève d'un
agent d'appareil » : une capacité annoncée à l'utilisateur, jamais câblée.

Ce module la câble, et suit le même patron que `homeassistant.py` — `urllib` +
`asyncio.to_thread`, listes fermées, aucune inférence. Pour la même raison : on
ne demande pas à un modèle 8B quel épisode reprendre.

Le chemin, mesuré le 2026-08-05 sur *Farscape* S01E03 :

    Core → API Plex (/search, /library/onDeck) → lien plex:// → lecteur

Trois faits l'ont dicté, tous vérifiés plutôt que supposés :

  * **AirPlay vidéo ne marche pas.** `pyatv` pousse un flux par l'AirPlay v1
    (`/play` puis `/playback-info`) ; tvOS 26 répond 500 sur le second. Le
    transcodage HLS démarrait côté serveur puis restait à 0 % — personne ne
    venait chercher le flux.
  * **Le lien `plex://` marche.** Ce n'est pas un flux à décoder, c'est un schéma
    d'URL que le système remet à l'application Plex. Elle lit alors le fichier en
    direct depuis le serveur : le Pi n'est jamais sur le chemin vidéo.
  * **L'état se lit chez Plex, pas chez Home Assistant.** Faute de MRP appairé,
    les attributs `app` et `media_title` de HA restent vides. `/status/sessions`,
    lui, donne titre, saison, épisode, position et état de lecture.

Le point de reprise vient de `/library/onDeck` — c'est Plex qui tient le
marque-page, pas nous. « Reprends Farscape » a redémarré à 40:52 sans qu'on ait
eu à mémoriser quoi que ce soit.
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

logger = logging.getLogger("jarvis.plex")

DEFAULT_URL = "http://192.168.1.44:32400"

# Le ProLiant s'annonce sur deux cartes réseau (192.168.1.44 et .57). On vise
# .44 explicitement : laisser Plex choisir ferait dépendre le chemin vidéo de
# l'ordre de découverte, qui change au redémarrage.

# Le catalogue bouge à l'échelle de la semaine, pas de la commande vocale. Cinq
# minutes : un film ajouté apparaît vite, et « lance Farscape » ne relit pas
# 230 fiches à chaque fois.
CATALOG_TTL_S = 300.0

# Ce qu'on accepte de lancer. Liste fermée : `/library/metadata/{id}` accepte
# aussi des identifiants de saison ou de collection, qui ne « se lisent » pas.
PLAYABLE = {"movie", "episode"}


class PlexUnavailable(RuntimeError):
    """Plex n'est pas joignable ou pas configuré. Jamais silencieux."""


class PlexAmbiguous(RuntimeError):
    """Plusieurs titres correspondent — on ne devine pas lequel lancer."""


@dataclass(frozen=True)
class Item:
    """Une chose lisible, avec son marque-page s'il existe."""

    rating_key: str
    kind: str
    title: str
    show: str | None = None
    season: int | None = None
    episode: int | None = None
    offset_ms: int = 0
    duration_ms: int = 0

    @property
    def label(self) -> str:
        """Ce qu'on dit à voix haute — jamais un identifiant."""
        if self.show and self.season and self.episode:
            return f"{self.show} saison {self.season} épisode {self.episode}"
        return self.title

    @property
    def resumes_at(self) -> str:
        total = self.offset_ms // 1000
        return f"{total // 60}:{total % 60:02d}"


@dataclass(frozen=True)
class Player:
    """Un lecteur, et par quel chemin on lui parle.

    `kind` décide du back-end. Deux existent, et ils ne se valent pas :

      * `appletv` — lien `plex://` remis par Home Assistant à tvOS, qui le confie
        à l'application Plex. Elle lit alors le fichier en direct : rien ne
        transcode. **Vérifié** le 2026-08-05 (*Farscape* S01E03, reprise à 40:52).
      * `cast`    — flux HLS du transcodeur Plex, diffusé par Home Assistant vers
        un appareil Google Cast. **Vérifié** le même soir sur le player Free
        (*Ad Astra*, position qui avance, transcodage réellement tiré).

    Les deux ne se valent pas, et le choix n'est pas cosmétique : le premier ne
    coûte rien au serveur, le second lui fait transcoder en direct. On préfère
    donc `appletv` partout où il existe.

    Une troisième voie a été essayée et **abandonnée** : ADB sur le player Free.
    L'autorisation obtenue, l'application s'ouvre et le lien arrive entier — mais
    le client Plex Android ne déclenche pas la lecture, sous aucune des trois
    formes d'URL essayées, et ne s'enregistre pas non plus comme client Companion.
    Le Cast rend le sujet sans objet.
    """

    room: str
    kind: str
    target: str


PLAYERS: dict[str, Player] = {
    "chambre": Player(room="chambre", kind="appletv", target="media_player.chambre_chambre"),
    "salon": Player(room="salon", kind="cast", target="media_player.freebox_player_pop"),
}

# Le player Free n'était plus joignable par Cast : le conteneur HA ne résolvait
# pas son nom mDNS (`Name does not resolve`), et l'entité restait `unavailable`.
# `known_hosts: ["192.168.1.49"]` sur l'intégration Cast l'a rendue vivante. Ce
# réglage vit dans le `.storage` de HA, PAS dans `deploy/homeassistant/` — il
# n'est pas exprimable en YAML, et disparaîtra avec la carte SD.

# Paramètres du transcodeur « universal ». Ce jeu précis a produit un manifeste
# valide (1920×808, H.264) ; en changer trois d'un coup a valu un HTTP 400.
_TRANSCODE = {
    "protocol": "hls",
    "fastSeek": "1",
    "directPlay": "0",
    "directStream": "1",
    "subtitleSize": "100",
    "audioBoost": "100",
    "location": "lan",
    "maxVideoBitrate": "20000",
    "videoQuality": "100",
    "videoResolution": "1920x1080",
    "X-Plex-Platform": "iOS",
}

# La chambre est le seul point où JARVIS entend ET parle ET voit (cf. topologie :
# le NUC y est, le Pi du salon n'a aucun micro). Une demande sans pièce nommée
# vient donc presque toujours de là.
DEFAULT_ROOM = "chambre"


def _fold(text: str) -> str:
    """Minuscule sans accent — « Séries » et « series » doivent se rencontrer.

    Même raison que dans `homeassistant.py` : la transcription vocale ne restitue
    pas les accents de façon fiable. C'est ce défaut précis qui avait fait rater
    « lumiere » au routeur d'intentions.
    """
    normalized = unicodedata.normalize("NFD", str(text or "").lower())
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


class PlexAdapter:
    """Seule voie du Core vers Plex.

    Aucun LLM, aucune dépendance HTTP supplémentaire.
    """

    def __init__(self, url: str | None = None, token: str | None = None,
                 timeout: float = 8.0) -> None:
        self.url = (url or os.environ.get("JARVIS_PLEX_URL") or DEFAULT_URL).rstrip("/")
        self.token = token or os.environ.get("JARVIS_PLEX_TOKEN") or ""
        self.timeout = timeout
        self._server_id: str | None = None
        self._on_deck: tuple[float, list[Item]] | None = None

    @property
    def configured(self) -> bool:
        return bool(self.token)

    # ── Lecture ──────────────────────────────────────────────────────────────

    def _get(self, path: str, **params: str) -> Any:
        if not self.configured:
            raise PlexUnavailable("JARVIS_PLEX_TOKEN absente — Plex n'est pas raccordé.")

        query = parse.urlencode(params)
        url = f"{self.url}{path}" + (f"?{query}" if query else "")
        req = request.Request(
            url,
            method="GET",
            # Le jeton passe par l'en-tête, pas par l'URL : une URL finit dans les
            # journaux d'accès, un en-tête beaucoup moins.
            headers={"X-Plex-Token": self.token, "Accept": "application/json"},
        )
        with request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")

    async def _fetch(self, path: str, **params: str) -> dict[str, Any]:
        try:
            payload = await asyncio.to_thread(self._get, path, **params)
        except PlexUnavailable:
            raise
        except error.HTTPError as exc:
            raise PlexUnavailable(f"HTTP {exc.code} depuis Plex sur {path}") from exc
        except Exception as exc:  # noqa: BLE001
            raise PlexUnavailable(f"Plex injoignable : {exc}") from exc

        container = payload.get("MediaContainer")
        return container if isinstance(container, dict) else {}

    async def health(self) -> bool:
        if not self.configured:
            return False
        try:
            return bool(await self.server_id())
        except Exception:
            return False

    async def server_id(self) -> str:
        """`machineIdentifier` — la moitié serveur du lien `plex://`.

        Lu une fois puis gardé : il ne change qu'à la réinstallation du serveur.
        """
        if self._server_id:
            return self._server_id

        identity = await self._fetch("/identity")
        machine = str(identity.get("machineIdentifier") or "")
        if not machine:
            raise PlexUnavailable("le serveur Plex ne donne pas son identifiant")

        self._server_id = machine
        return machine

    @staticmethod
    def _item(raw: dict[str, Any]) -> Item | None:
        kind = str(raw.get("type") or "")
        key = str(raw.get("ratingKey") or "")
        if not key or kind not in PLAYABLE:
            return None

        def _int(name: str) -> int | None:
            value = raw.get(name)
            return int(value) if isinstance(value, (int, float)) else None

        return Item(
            rating_key=key,
            kind=kind,
            title=str(raw.get("title") or ""),
            show=str(raw.get("grandparentTitle")) if raw.get("grandparentTitle") else None,
            season=_int("parentIndex"),
            episode=_int("index"),
            offset_ms=int(raw.get("viewOffset") or 0),
            duration_ms=int(raw.get("duration") or 0),
        )

    async def on_deck(self, *, force: bool = False) -> list[Item]:
        """Ce qui est commencé et pas fini — le marque-page tenu par Plex."""
        now = time.monotonic()
        if not force and self._on_deck and now - self._on_deck[0] < CATALOG_TTL_S:
            return self._on_deck[1]

        container = await self._fetch("/library/onDeck")
        items = [i for raw in container.get("Metadata", []) if (i := self._item(raw))]
        self._on_deck = (now, items)
        return items

    async def search(self, phrase: str) -> list[Item]:
        """Recherche déterministe — l'index de Plex, pas une similarité inventée.

        Une série remonte comme `show`, qui n'est pas lisible tel quel : on
        redescend alors sur SON `onDeck`, c'est-à-dire l'épisode où l'utilisateur
        s'est arrêté. « Lance Farscape » ne veut jamais dire « épisode 1 ».
        """
        container = await self._fetch("/search", query=phrase)
        raw_items = [r for r in container.get("Metadata", []) if isinstance(r, dict)]

        out: list[Item] = []
        for raw in raw_items:
            if item := self._item(raw):
                out.append(item)
                continue
            if str(raw.get("type")) == "show" and (key := raw.get("ratingKey")):
                out.extend(await self._show_on_deck(str(key)))
        return out

    async def _show_on_deck(self, show_key: str) -> list[Item]:
        """L'épisode en cours d'une série — vide si elle n'est pas commencée."""
        container = await self._fetch(f"/library/metadata/{parse.quote(show_key)}/onDeck")
        return [i for raw in container.get("Metadata", []) if (i := self._item(raw))]

    async def resolve(self, phrase: str) -> list[Item]:
        """Que désigne cette phrase ?

        L'ordre compte. On regarde d'abord ce qui est **déjà commencé** : « reprends
        Farscape » et « lance Farscape » désignent la même chose pour un humain, et
        repartir du début d'une série de 88 épisodes serait le pire des échecs
        silencieux. À défaut seulement, on cherche dans le catalogue.
        """
        folded = _fold(phrase)
        words = [w for w in folded.split() if len(w) > 3]
        if not words:
            return []

        started = [
            item for item in await self.on_deck()
            if any(w in _fold(f"{item.show or ''} {item.title}") for w in words)
        ]
        if started:
            return started

        return await self.search(phrase)

    async def sessions(self) -> list[dict[str, Any]]:
        """Ce qui joue en ce moment — la source de vérité, HA étant aveugle ici."""
        container = await self._fetch("/status/sessions")
        out: list[dict[str, Any]] = []
        for raw in container.get("Metadata", []):
            if not isinstance(raw, dict):
                continue
            player = raw.get("Player") or {}
            item = self._item(raw)
            out.append({
                "title": item.label if item else str(raw.get("title") or ""),
                "state": str(player.get("state") or ""),
                "player": str(player.get("title") or ""),
                "address": str(player.get("address") or ""),
                "position": item.resumes_at if item else "",
            })
        return out

    # ── Action ───────────────────────────────────────────────────────────────

    async def link_for(self, item: Item) -> str:
        """Le lien profond. `plex://play` + la clé de métadonnée + le serveur."""
        metadata_key = parse.quote(f"/library/metadata/{item.rating_key}", safe="")
        return f"plex://play/?metadataKey={metadata_key}&server={await self.server_id()}"

    async def play(self, item: Item, player: Player) -> dict[str, Any]:
        """Envoie le lien au lecteur. Le back-end dépend de `player.kind`."""
        if item.kind not in PLAYABLE:
            raise PlexUnavailable(f"« {item.kind} » ne se lit pas directement")

        link = await self.link_for(item)

        if player.kind == "appletv":
            await self._ha_play_media(player.target, "url", link)
        elif player.kind == "cast":
            await self._ha_play_media(player.target, "video", await self.hls_for(item))
        else:
            raise PlexUnavailable(f"lecteur « {player.kind} » inconnu de l'adaptateur")

        logger.info("Plex · %s → %s (%s)", item.label, player.room, player.kind)
        return {
            "ok": True,
            "action": "play",
            "title": item.label,
            "room": player.room,
            "resumes_at": item.resumes_at if item.offset_ms else None,
        }

    async def hls_for(self, item: Item) -> str:
        """Le flux HLS du transcodeur — ce qu'un Chromecast sait lire.

        Le récepteur par défaut du Cast ne connaît ni Plex ni MKV, mais il lit du
        HLS. Le transcodeur « universal » en fabrique, et il honore au passage le
        marque-page : la lecture d'*Ad Astra* est repartie à 1:55 sans qu'on
        passe d'`offset`.

        Le jeton voyage dans cette URL — le récepteur ne sait pas envoyer
        d'en-tête. C'est le prix du Cast, et la raison de plus de préférer
        `appletv` : là-bas, le jeton reste chez Plex.
        """
        params = {
            "path": f"/library/metadata/{item.rating_key}",
            "mediaIndex": "0",
            "partIndex": "0",
            "session": f"jarvis-{item.rating_key}-{int(time.time())}",
            "X-Plex-Client-Identifier": os.environ.get("JARVIS_PLEX_CLIENT_ID") or "jarvis-os",
            "X-Plex-Token": self.token,
            **_TRANSCODE,
        }
        return f"{self.url}/video/:/transcode/universal/start.m3u8?{parse.urlencode(params)}"

    async def _ha_play_media(self, entity_id: str, content_type: str, content_id: str) -> None:
        """Remet un média à un lecteur, par Home Assistant.

        Ça ne passe pas par `HomeAssistantAdapter.call()` : sa table `SERVICES` ne
        connaît que des services sans corps (`turn_on`, `toggle`…), et l'élargir
        pour un cas média ouvrirait une porte que cette table existe pour fermer.

        Une réserve côté Apple TV, connue et non contournable depuis le réseau :
        la **première** remise d'un lien après un démarrage à froid de
        l'application fait afficher une confirmation par tvOS, qu'il faut
        accepter à la télécommande. Les suivantes passent seules.
        """
        url = (os.environ.get("JARVIS_HASS_URL") or "").strip().rstrip("/")
        if not url:
            from .gateway import hass_default_url

            url = hass_default_url()
        token = os.environ.get("JARVIS_HASS_TOKEN") or ""
        if not token:
            raise PlexUnavailable("JARVIS_HASS_TOKEN absente — les lecteurs passent par HA.")

        body = json.dumps({
            "entity_id": entity_id,
            "media_content_type": content_type,
            "media_content_id": content_id,
        }).encode("utf-8")

        def _post() -> None:
            req = request.Request(
                f"{url}/api/services/media_player/play_media",
                data=body,
                method="POST",
                headers={"Authorization": f"Bearer {token}",
                         "Content-Type": "application/json"},
            )
            with request.urlopen(req, timeout=self.timeout) as resp:
                resp.read()

        try:
            await asyncio.to_thread(_post)
        except error.HTTPError as exc:
            raise PlexUnavailable(f"HTTP {exc.code} en poussant le média vers {entity_id}") from exc
        except Exception as exc:  # noqa: BLE001
            raise PlexUnavailable(f"Home Assistant injoignable : {exc}") from exc

    async def execute(self, phrase: str, *, room: str | None = None) -> dict[str, Any]:
        """Chemin complet d'une demande vidéo — sans LLM.

        Rend un résultat structuré ; c'est le Core qui parle, jamais cet
        adaptateur — même règle que pour Home Assistant.
        """
        player = PLAYERS.get(room or _room_of(_fold(phrase)) or DEFAULT_ROOM)
        if player is None:
            raise PlexUnavailable(f"aucun lecteur connu pour « {room} »")

        if _wants_status(_fold(phrase)):
            return {"ok": True, "action": "read", "sessions": await self.sessions()}

        targets = await self.resolve(phrase)
        if not targets:
            return {"ok": False, "reason": "aucun titre ne correspond", "phrase": phrase}

        if len(targets) > 1:
            # Comme pour deux lampes : on ne choisit pas à la place de
            # l'utilisateur. Lancer le mauvais épisode marque le bon comme vu.
            raise PlexAmbiguous(
                "plusieurs titres correspondent : "
                + ", ".join(t.label for t in targets[:5])
            )

        return await self.play(targets[0], player)


def _room_of(folded: str) -> str | None:
    """La phrase nomme-t-elle une pièce ?"""
    for words, room in (
        (("salon", "sejour", "canape"), "salon"),
        (("chambre", "lit", "apple tv", "appletv"), "chambre"),
    ):
        if any(w in folded for w in words):
            return room
    return None


def _wants_status(folded: str) -> bool:
    """Question d'état plutôt qu'ordre de lecture ?"""
    return any(w in folded for w in (
        "qu est ce qui joue", "qu est-ce qui joue", "ca joue quoi",
        "en cours de lecture", "qu est ce que je regarde",
    ))
