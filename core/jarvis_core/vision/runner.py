"""Facade async devant FaceEngine — trois problèmes réglés ici.

`face_engine.py` reste du CV pur et synchrone. C'est ce module qui le rend
utilisable depuis une boucle asyncio :

1. **Boucle bloquée.** `detect()` et `feature()` sont du calcul CPU. Appelés
   directement dans un handler async ils gèlent le serveur WebSocket : à 5 fps
   ça passe, à 30 fps le Core ne répond plus à rien. → `asyncio.to_thread`.

2. **État partagé.** `FaceDetectorYN.setInputSize()` mute le détecteur juste
   avant `detect()`. Deux frames traitées en parallèle se marchent dessus et la
   seconde détecte à la mauvaise résolution — silencieusement. → un verrou
   sérialise **tous** les accès au moteur.

3. **Boot bloquant.** Charger YuNet + SFace prend ~20 s. Fait dans
   `Orchestrator.__init__`, ça retardait `serve()` d'autant et le HUD ne pouvait
   pas se connecter pendant ce temps. → chargement en tâche de fond après
   `serve()`, avec un `component_state` diffusé quand c'est prêt.

**Pas de drop ici.** Le HUD attend une réponse par frame
(`coreClient.request`, timeout 6 s) et lit `Number(ev.progress ?? 0)` : une
réponse « occupé » sans progression remettrait la jauge à zéro. À 5 fps en
request/response, faire la queue sur le verrou (~100 ms) est correct. La
politique « garder la dernière, jeter le reste » vaut pour le flux gestuel, qui
est du fire-and-forget à 30 fps — elle vit dans le bus, pas ici.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

logger = logging.getLogger("jarvis.vision.runner")

State = str  # "idle" | "loading" | "ready" | "error"


class FaceRunner:
    """Chargement différé + accès sérialisé au FaceEngine."""

    def __init__(self) -> None:
        self._engine: Any = None
        self._lock = asyncio.Lock()
        self._load_task: asyncio.Task[bool] | None = None
        self.state: State = "idle"
        self.error: str | None = None
        self.load_ms: int | None = None
        self.waits = 0  # frames ayant dû attendre le verrou

    # -- état ----------------------------------------------------------------

    @property
    def ready(self) -> bool:
        return self._engine is not None

    def status(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "ready": self.ready,
            "error": self.error,
            "load_ms": self.load_ms,
            "waits": self.waits,
            "algo": (getattr(self._engine, "_algo", None) if self.ready else None),
        }

    # -- chargement ----------------------------------------------------------

    async def load(self) -> bool:
        """Charge les modèles hors boucle. Idempotent, jamais concurrent."""
        if self.ready:
            return True
        if self._load_task is not None:
            return await self._load_task

        self._load_task = asyncio.create_task(self._load())
        try:
            return await self._load_task
        finally:
            self._load_task = None

    async def _load(self) -> bool:
        self.state = "loading"
        self.error = None
        started = time.monotonic()
        from .opencv_face import cpu_has_avx

        backend = "MediaPipe Face Mesh" if cpu_has_avx() else "OpenCV YuNet+SFace (pas d'AVX)"
        logger.info("Holomat : chargement %s en tâche de fond…", backend)
        try:
            from .face_engine import FaceEngine

            self._engine = await asyncio.to_thread(FaceEngine)
        except Exception as exc:  # noqa: BLE001 — le Core tourne sans visage
            self.state = "error"
            self.error = str(exc)
            logger.warning("Holomat Face indisponible : %s", exc)
            logger.warning(
                "→ pip install mediapipe (si AVX) OU python -m jarvis_core.vision.fetch_models (YuNet/SFace)"
            )
            return False

        self.load_ms = int((time.monotonic() - started) * 1000)
        self.state = "ready"
        logger.info("Holomat FaceEngine prêt · %d ms", self.load_ms)
        return True

    # -- appels sérialisés ---------------------------------------------------

    async def _call(self, method: str, *args: Any, **kwargs: Any) -> Any:
        if not self.ready:
            raise RuntimeError("face_engine_unavailable")
        if self._lock.locked():
            self.waits += 1
        async with self._lock:
            fn = getattr(self._engine, method)
            return await asyncio.to_thread(lambda: fn(*args, **kwargs))

    async def verify_frame(
        self,
        jpeg_b64: str,
        *,
        username: str | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        return await self._call(
            "verify_frame", jpeg_b64, username=username, user_id=user_id
        )

    async def enroll_add_frame(
        self,
        user_id: str,
        jpeg_b64: str,
        *,
        username: str = "",
    ) -> dict[str, Any]:
        return await self._call("enroll_add_frame", user_id, jpeg_b64, username=username)

    async def enroll_begin(self, user_id: str, username: str = "") -> None:
        # Pas de CV, mais mute `_enroll` : passer par le verrou quand même.
        await self._call("enroll_begin", user_id, username)

    async def enroll_commit(self, user_id: str, username: str = "") -> dict[str, Any]:
        return await self._call("enroll_commit", user_id, username)
