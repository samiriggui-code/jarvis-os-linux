"""Lecteur du cache vocal — joue un clip pré-généré au lieu de synthétiser.

C'est la brique qui rend audibles les ~680 WAV produits par
`scripts/generate_voice_cache.py`. Elle ne parle à personne : elle lit un
manifeste sur disque, choisit une variante et renvoie l'événement `tts_audio`
attendu par le HUD — **le même contrat que `VoiceManager.speak()`**, pour que
le HUD n'ait rien à distinguer.

Ce que ça change, et pourquoi c'est le premier morceau à écrire :

* **Zéro réseau, zéro latence.** Lire un WAV de 90 Ko coûte une milliseconde.
  Une synthèse voicebox en coûte plusieurs centaines.
* **Zéro coût.** Ni token, ni caractère ElevenLabs.
* **Ça marche quand tout est mort.** voicebox arrêté, Ollama planté, Internet
  coupé : JARVIS parle quand même. C'est le mode dégradé du cahier §11, et il
  tombe gratuitement de cette architecture.

Le choix de la variante suit la même logique que la génération : on filtre par
`event`, puis par `address` (vous/tu) et `user_role` selon qui écoute, puis on
tire au hasard parmi ce qui reste. Entendre le même fichier quarante fois par
jour transforme un assistant en distributeur automatique.
"""

from __future__ import annotations

import base64
import json
import logging
import random
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.voice.cache")

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "voice"
CONFIG_PATH = DATA_DIR / "cache_config.yaml"
CACHE_ROOT = DATA_DIR / "cache"

# Un WAV traverse le WebSocket en base64 : plafonner pour ne pas noyer le HUD.
MAX_WAV_BYTES = 8 * 1024 * 1024

# Titre attendu selon le rôle — même table que `role_titles` de
# `cache_config.yaml`. Sans elle, une ligne portant `{titre}` mais pas de
# `user_role` (le cas de `mission_ready`) tire au hasard entre monsieur,
# madame et mademoiselle : Samir se fait appeler « mademoiselle ».
ROLE_TITLES = {"admin": "monsieur", "user": "madame", "child": "mademoiselle"}


class VoiceCache:
    """Index en mémoire du manifeste, avec sélection par contexte."""

    def __init__(self, voice_name: str | None = None) -> None:
        self.voice_name = voice_name or self._voice_from_config()
        self.root = CACHE_ROOT / self.voice_name if self.voice_name else None
        self.entries: list[dict[str, Any]] = []
        self.by_event: dict[str, list[dict[str, Any]]] = {}
        self.last_error: str | None = None
        self._counter = 0
        self.load()

    # ── chargement ──────────────────────────────────────────────────────

    @staticmethod
    def _voice_from_config() -> str | None:
        """Nom du dossier de cache, lu dans `cache_config.yaml`.

        On tolère l'absence de PyYAML : le Core doit démarrer même sans, quitte
        à passer par la synthèse.
        """
        try:
            import yaml

            cfg = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
        except Exception as exc:  # noqa: BLE001
            logger.warning("cache_config illisible : %s", exc)
            return None
        el = cfg.get("elevenlabs") or {}
        return el.get("voice_name") or el.get("voice_id")

    def load(self) -> bool:
        """Charge le manifeste. Ne lève jamais : sans cache, on synthétise."""
        self.entries, self.by_event = [], {}
        if not self.root:
            self.last_error = "aucune voix configurée"
            return False

        manifest = self.root / "manifest.json"
        if not manifest.exists():
            self.last_error = f"manifeste absent : {manifest}"
            logger.info("Cache vocal indisponible — %s", self.last_error)
            return False

        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"manifeste illisible : {exc}"
            logger.warning("Cache vocal : %s", self.last_error)
            return False

        # On n'indexe que ce qui existe VRAIMENT sur le disque. Un manifeste
        # qui promet un fichier absent produirait un silence inexplicable au
        # pire moment — mieux vaut le savoir au chargement.
        missing = 0
        for e in data.get("entries") or []:
            if not (self.root / e["file"]).exists():
                missing += 1
                continue
            self.entries.append(e)
            self.by_event.setdefault(e["event"], []).append(e)

        self.last_error = None
        logger.info(
            "Cache vocal « %s » · %d clips · %d événements%s",
            self.voice_name,
            len(self.entries),
            len(self.by_event),
            f" · {missing} manquants" if missing else "",
        )
        if missing:
            logger.warning("%d clips au manifeste sont absents du disque", missing)
        return bool(self.entries)

    @property
    def available(self) -> bool:
        return bool(self.entries)

    # ── sélection ───────────────────────────────────────────────────────

    def select(
        self,
        event: str,
        *,
        address: str | None = None,
        user_role: str | None = None,
        bindings: dict[str, str] | None = None,
    ) -> dict[str, Any] | None:
        """Choisit une variante pour cet événement, ou None.

        `address` (vous/tu) et `user_role` viennent du profil de la personne à
        qui l'on parle. Les lignes SANS adresse sont neutres : elles servent
        tout le monde, et c'est voulu — la discipline d'écriture évite les
        pronoms précisément pour ça.

        `bindings` filtre les placeholders résolus : `{"user": "Inès"}` ne
        retient que les clips où c'est bien Inès qui est nommée.
        """
        pool = self.by_event.get(event)
        if not pool:
            return None

        # Adresse : on garde le neutre + celle qui correspond. Si le profil est
        # au tutoiement, une ligne `vous` ne doit pas sortir.
        if address:
            filtered = [e for e in pool if e.get("address") in (None, address)]
            pool = filtered or pool

        # Rôle : une ligne réservée aux admins ne part pas à un enfant.
        if user_role:
            filtered = [e for e in pool if e.get("user_role") in (None, user_role)]
            pool = filtered or pool
        else:
            # Sans rôle connu, on écarte ce qui est explicitement réservé.
            neutral = [e for e in pool if e.get("user_role") is None]
            pool = neutral or pool

        # Le rôle contraint aussi le TITRE, même quand la ligne ne porte pas de
        # `user_role` : beaucoup de phrases contiennent `{titre}` sans être
        # réservées à un rôle, et sans ça Samir se ferait appeler
        # « mademoiselle » une fois sur trois.
        wanted = dict(bindings or {})
        if user_role and "titre" not in wanted and (t := ROLE_TITLES.get(user_role)):
            wanted["titre"] = t

        if wanted:
            filtered = [
                e
                for e in pool
                # Une clé absente des bindings du clip ne disqualifie pas :
                # la phrase ne contient simplement pas ce placeholder.
                if all(
                    (e.get("bindings") or {}).get(k, v) == v for k, v in wanted.items()
                )
            ]
            pool = filtered or pool

        return random.choice(pool)

    # ── lecture ─────────────────────────────────────────────────────────

    def _next_utterance_id(self) -> str:
        self._counter += 1
        return f"cache-{self._counter}"

    def play(
        self,
        event: str,
        *,
        user_id: str = "local",
        address: str | None = None,
        user_role: str | None = None,
        bindings: dict[str, str] | None = None,
    ) -> dict[str, Any] | None:
        """Événement `tts_audio` prêt à envoyer au HUD, ou None si pas en cache.

        `None` n'est pas une erreur : c'est le signal que l'appelant doit
        retomber sur la synthèse. Le cache couvre les phrases connues, pas les
        réponses libres.
        """
        entry = self.select(event, address=address, user_role=user_role, bindings=bindings)
        if entry is None:
            return None

        path = self.root / entry["file"]
        try:
            wav = path.read_bytes()
        except OSError as exc:
            logger.warning("Clip illisible (%s) : %s", entry["file"], exc)
            return None

        if len(wav) > MAX_WAV_BYTES:
            logger.warning("Clip trop volumineux (%d o) : %s", len(wav), entry["file"])
            return None

        utterance_id = self._next_utterance_id()
        logger.info("Cache %s · %s · « %s »", utterance_id, event, entry["text"])
        return {
            "type": "tts_audio",
            "utterance_id": utterance_id,
            "format": "wav",
            "audio_b64": base64.b64encode(wav).decode("ascii"),
            "bytes": len(wav),
            "text": entry["text"],
            "user_id": user_id,
            # Métadonnées du dialogue : le HUD pilote l'orbe et la pause avec.
            "event": event,
            "tone": entry.get("tone"),
            "orb_state": entry.get("orb_state"),
            "pause_ms": entry.get("pause_ms"),
            "source": "cache",
            "interruptible": True,
        }

    def status(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "voice": self.voice_name,
            "clips": len(self.entries),
            "events": len(self.by_event),
            "error": self.last_error,
        }
