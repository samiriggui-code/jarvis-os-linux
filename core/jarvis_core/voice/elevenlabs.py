"""Synthèse ElevenLabs en direct — repli quand voicebox est absent.

═══ POURQUOI CE MODULE EXISTE ═══════════════════════════════════════════════

Le guide de déploiement prévoit ElevenLabs pour DEUX usages :
  1. pré-générer le cache (`scripts/generate_voice_cache.py`)
  2. le TTS hors domicile (téléphone, portable web)

Ce module en ajoute un troisième : **le repli quand voicebox est injoignable**.
En développement sur une machine sans Docker, c'est la seule façon d'avoir UNE
SEULE VOIX — sinon le cache parle avec `jarvis2` et les réponses libres avec la
voix du navigateur, dans la même conversation.

═══ POURQUOI IL EST DÉSACTIVÉ PAR DÉFAUT ════════════════════════════════════

Parce qu'il COÛTE. Si voicebox meurt un soir à la maison et que JARVIS bascule
ici sans rien dire, on brûle des caractères pendant des jours sans le savoir.

    JARVIS_ELEVENLABS_FALLBACK=1

Rien d'implicite : le repli ne s'active que si on l'a demandé. À la maison, le
bon repli reste `SpeechSynthesis` du navigateur — gratuit, hors ligne, et son
étrangeté SIGNALE que voicebox est tombé au lieu de le masquer.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import wave
from pathlib import Path
from typing import Any
from urllib import error, request

logger = logging.getLogger("jarvis.voice.elevenlabs")

API_BASE = "https://api.elevenlabs.io/v1/text-to-speech"
TIMEOUT_S = 30.0

VOICE_DIR = Path(__file__).resolve().parents[2] / "data" / "voice"
CONFIG_PATH = VOICE_DIR / "cache_config.yaml"
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

PCM_RATES = {"pcm_16000": 16000, "pcm_22050": 22050, "pcm_24000": 24000, "pcm_44100": 44100}


class ElevenLabsUnavailable(RuntimeError):
    """Clé absente, repli non activé, ou API injoignable."""


def _read_key() -> str | None:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if key:
        return key.strip()
    if not ENV_PATH.exists():
        return None
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("ELEVENLABS_API_KEY="):
            return line.split("=", 1)[1].strip().strip("\"'") or None
    return None


class ElevenLabsLive:
    """Synthèse à la demande, avec la MÊME voix que le cache.

    Réutilise `cache_config.yaml` : même `voice_id`, mêmes réglages. C'est tout
    l'intérêt — le cache et les réponses libres doivent sonner identiques,
    sinon on entend la couture à chaque phrase inédite.

    Une exception près : le MODÈLE. Le cache est généré en qualité, où la
    latence n'a aucune importance. Ici on répond à quelqu'un qui attend, donc
    modèle rapide.
    """

    def __init__(self) -> None:
        self.enabled = os.environ.get("JARVIS_ELEVENLABS_FALLBACK") == "1"
        self.voice_id: str | None = None
        self.model_id = os.environ.get("JARVIS_ELEVENLABS_LIVE_MODEL", "eleven_flash_v2_5")
        self.output_format = "pcm_24000"
        self.settings: dict[str, Any] = {}
        self.last_error: str | None = None
        self.chars_used = 0
        self._key = _read_key()
        self._load_config()

    def _load_config(self) -> None:
        try:
            import yaml

            el = (yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}).get(
                "elevenlabs"
            ) or {}
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"cache_config illisible : {exc}"
            return
        self.voice_id = el.get("voice_id")
        self.settings = el.get("voice_settings") or {}

    @property
    def available(self) -> bool:
        return bool(self.enabled and self._key and self.voice_id)

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "available": self.available,
            "voice_id": self.voice_id,
            "model": self.model_id,
            "chars_used": self.chars_used,
            "error": self.last_error,
        }

    async def synthesize(self, text: str) -> bytes:
        """Texte → WAV. Lève `ElevenLabsUnavailable` — jamais silencieux."""
        if not self.enabled:
            raise ElevenLabsUnavailable(
                "repli ElevenLabs désactivé (JARVIS_ELEVENLABS_FALLBACK=1 pour l'activer)"
            )
        if not self._key:
            raise ElevenLabsUnavailable("ELEVENLABS_API_KEY absente")
        if not self.voice_id:
            raise ElevenLabsUnavailable("voice_id absent de cache_config.yaml")

        clean = (text or "").strip()
        if not clean:
            raise ElevenLabsUnavailable("texte vide")

        try:
            pcm = await asyncio.to_thread(self._call, clean)
        except error.HTTPError as exc:
            detail = exc.read()[:200].decode("utf-8", "replace")
            self.last_error = f"HTTP {exc.code} : {detail}"
            raise ElevenLabsUnavailable(self.last_error) from exc
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            raise ElevenLabsUnavailable(self.last_error) from exc

        self.chars_used += len(clean)
        self.last_error = None
        # Le compteur est loggé à chaque phrase : c'est ce qui rend la dépense
        # visible plutôt que découverte en fin de mois sur la facture.
        logger.info(
            "ElevenLabs live · %d car. (cumul %d) · %s", len(clean), self.chars_used, self.model_id
        )
        return self._wrap_wav(pcm)

    def _call(self, text: str) -> bytes:
        import json

        req = request.Request(
            f"{API_BASE}/{self.voice_id}?output_format={self.output_format}",
            data=json.dumps(
                {"text": text, "model_id": self.model_id, "voice_settings": self.settings}
            ).encode("utf-8"),
            method="POST",
            headers={
                "xi-api-key": self._key,
                "Content-Type": "application/json",
                "Accept": "audio/basic",
            },
        )
        with request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return resp.read()

    def _wrap_wav(self, pcm: bytes) -> bytes:
        """PCM brut → conteneur WAV, comme le générateur de cache."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(PCM_RATES[self.output_format])
            w.writeframes(pcm)
        return buf.getvalue()
