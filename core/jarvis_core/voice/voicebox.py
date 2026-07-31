"""Client HTTP voicebox — service séparé, jamais monté dans le Core.

Même règle que Hermes (`vendor/README.md`) : `vendor/voicebox-main` reste en
lecture seule et le Core l'appelle en HTTP. Le `docker-compose.yml` upstream
expose le port natif 17493 sur `127.0.0.1:17600`.

    GET  /health           dispo + backend GPU
    GET  /profiles         voix disponibles (name → id)
    POST /generate/stream  WAV direct — ni disque ni polling
    POST /transcribe       multipart audio → texte

`POST /speak` n'est pas utilisé : c'est un job asynchrone qui joue le son sur
la carte son de la machine voicebox. En dev le son sortirait du PC et pas du
HUD. Ici le WAV remonte au Core, le Core le pousse au HUD, le HUD le joue —
barge-in, périphérique de sortie et synchro de l'orbe restent côté client, et
le comportement est identique en dev et sur le NUC.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from typing import Any
from urllib import error, request

logger = logging.getLogger("jarvis.voice.voicebox")

DEFAULT_URL = "http://127.0.0.1:17600"

# Moteurs acceptés par GenerationRequest.engine upstream.
ENGINES = (
    "qwen",
    "qwen_custom_voice",
    "luxtts",
    "chatterbox",
    "chatterbox_turbo",
    "tada",
    "kokoro",
)

# Réponses live : luxtts (~1 Go VRAM, 150x realtime CPU). Le clonage qwen est
# trop lent pour du conversationnel — le réserver aux phrases pré-générées.
DEFAULT_ENGINE = "luxtts"

# Le WAV traverse le WebSocket en base64 : plafonner pour ne pas noyer le HUD.
MAX_WAV_BYTES = 8 * 1024 * 1024

HEALTH_TIMEOUT = 3.0
PROFILES_TIMEOUT = 10.0


class VoiceboxUnavailable(RuntimeError):
    """Service injoignable — le Core doit basculer sur le fallback HUD."""


class VoiceboxError(RuntimeError):
    """Service joignable mais requête refusée."""


class VoiceboxModelDownloading(VoiceboxError):
    """HTTP 202 — modèle en cours de téléchargement, ce n'est pas un échec."""

    def __init__(self, model: str) -> None:
        super().__init__(f"modèle « {model} » en téléchargement")
        self.model = model


def _detail(raw: bytes) -> str:
    """Extrait `detail` d'une erreur FastAPI, sinon renvoie le corps tronqué."""
    try:
        data = json.loads(raw.decode("utf-8", errors="replace"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return raw.decode("utf-8", errors="replace")[:200]
    detail = data.get("detail") if isinstance(data, dict) else None
    if isinstance(detail, dict):
        return str(detail.get("message") or detail)[:200]
    return str(detail or data)[:200]


def _downloading_model(raw: bytes) -> str:
    try:
        data = json.loads(raw.decode("utf-8", errors="replace"))
        detail = data.get("detail") or {}
        if isinstance(detail, dict):
            return str(detail.get("model_name") or "inconnu")
    except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
        pass
    return "inconnu"


def _multipart(fields: dict[str, str], filename: str, audio: bytes) -> tuple[bytes, str]:
    """Encode un multipart/form-data minimal (champ fichier nommé `file`)."""
    boundary = f"----jarvis{uuid.uuid4().hex}"
    out = bytearray()
    for name, value in fields.items():
        out += (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        ).encode("utf-8")
    out += (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode("utf-8")
    out += audio
    out += f"\r\n--{boundary}--\r\n".encode("utf-8")
    return bytes(out), f"multipart/form-data; boundary={boundary}"


class VoiceboxClient:
    """Appels HTTP voicebox. Le blocage réseau part en thread (cf. providers.py)."""

    def __init__(self, base_url: str | None = None, timeout: float | None = None) -> None:
        raw_url = base_url or os.environ.get("JARVIS_VOICEBOX_URL") or DEFAULT_URL
        self.base = raw_url.rstrip("/")
        self.timeout = float(timeout or os.environ.get("JARVIS_VOICEBOX_TIMEOUT", 60))
        self._profiles: list[dict[str, Any]] | None = None

    # -- transport -----------------------------------------------------------

    def _call(
        self,
        path: str,
        *,
        method: str = "GET",
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
    ) -> tuple[int, bytes]:
        """Appel synchrone — toujours invoqué via `asyncio.to_thread`."""
        req = request.Request(
            f"{self.base}{path}", data=body, method=method, headers=headers or {}
        )
        try:
            with request.urlopen(req, timeout=timeout or self.timeout) as resp:
                return resp.status, resp.read()
        except error.HTTPError as exc:
            # 202/4xx/5xx portent un corps exploitable : ce n'est pas une panne.
            return exc.code, exc.read()
        except (error.URLError, TimeoutError, OSError) as exc:
            raise VoiceboxUnavailable(f"{self.base} injoignable : {exc}") from exc

    # -- santé / profils -----------------------------------------------------

    async def health(self) -> dict[str, Any]:
        status, raw = await asyncio.to_thread(self._call, "/health", timeout=HEALTH_TIMEOUT)
        if status != 200:
            raise VoiceboxError(f"HTTP {status} sur /health : {_detail(raw)}")
        try:
            return json.loads(raw or b"{}")
        except json.JSONDecodeError as exc:
            raise VoiceboxError(f"/health illisible : {exc}") from exc

    async def profiles(self, *, refresh: bool = False) -> list[dict[str, Any]]:
        if self._profiles is not None and not refresh:
            return self._profiles
        status, raw = await asyncio.to_thread(
            self._call, "/profiles", timeout=PROFILES_TIMEOUT
        )
        if status != 200:
            raise VoiceboxError(f"HTTP {status} sur /profiles : {_detail(raw)}")
        try:
            data = json.loads(raw or b"[]")
        except json.JSONDecodeError as exc:
            raise VoiceboxError(f"/profiles illisible : {exc}") from exc
        self._profiles = data if isinstance(data, list) else []
        return self._profiles

    async def resolve_profile_id(self, wanted: str | None) -> str | None:
        """`/generate/stream` exige un `profile_id` — traduire nom → id."""
        items = await self.profiles()
        if not items:
            return None

        if wanted:
            target = wanted.strip().lower()
            for item in items:
                if str(item.get("id", "")).lower() == target:
                    return str(item["id"])
            for item in items:
                if str(item.get("name", "")).strip().lower() == target:
                    return str(item["id"])
            logger.warning(
                "profil voix « %s » absent de voicebox — repli sur « %s »",
                wanted,
                items[0].get("name") or items[0].get("id"),
            )

        first = items[0].get("id")
        return str(first) if first else None

    # -- synthèse ------------------------------------------------------------

    async def synthesize(
        self,
        text: str,
        *,
        profile_id: str,
        language: str = "fr",
        engine: str | None = None,
        instruct: str | None = None,
        personality: bool = False,
    ) -> bytes:
        """Retourne un WAV complet. Lève VoiceboxUnavailable / VoiceboxError."""
        payload: dict[str, Any] = {
            "profile_id": profile_id,
            "text": text,
            "language": language,
            "engine": engine if engine in ENGINES else DEFAULT_ENGINE,
            "personality": personality,
        }
        if instruct:
            payload["instruct"] = instruct

        status, raw = await asyncio.to_thread(
            self._call,
            "/generate/stream",
            method="POST",
            body=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )

        if status == 202:
            raise VoiceboxModelDownloading(_downloading_model(raw))
        if status != 200:
            raise VoiceboxError(f"HTTP {status} sur /generate/stream : {_detail(raw)}")
        if not raw:
            raise VoiceboxError("WAV vide")
        if len(raw) > MAX_WAV_BYTES:
            raise VoiceboxError(f"WAV {len(raw)} o au-dessus du plafond {MAX_WAV_BYTES} o")
        return raw

    # -- transcription -------------------------------------------------------

    async def transcribe(
        self,
        audio: bytes,
        *,
        filename: str = "capture.wav",
        language: str | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        """Audio → `{text, duration}`.

        L'extension de `filename` compte : librosa choisit son décodeur dessus
        côté voicebox. Un enregistrement MediaRecorder doit arriver en
        `capture.webm`, pas en `.wav`.
        """
        fields: dict[str, str] = {}
        if language:
            fields["language"] = language
        if model:
            fields["model"] = model
        body, content_type = _multipart(fields, filename, audio)

        status, raw = await asyncio.to_thread(
            self._call,
            "/transcribe",
            method="POST",
            body=body,
            headers={"Content-Type": content_type},
        )

        if status == 202:
            raise VoiceboxModelDownloading(_downloading_model(raw))
        if status != 200:
            raise VoiceboxError(f"HTTP {status} sur /transcribe : {_detail(raw)}")
        try:
            return json.loads(raw or b"{}")
        except json.JSONDecodeError as exc:
            raise VoiceboxError(f"/transcribe illisible : {exc}") from exc
