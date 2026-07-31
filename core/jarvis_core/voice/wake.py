"""Wake word — détection locale sur le micro de la machine.

C'est **la seule chose qui écoute en permanence**, et donc la seule qui doit
rester intégralement locale : aucun audio ne quitte le NUC tant que le mot
n'a pas été détecté. Pas de réseau, pas de LLM, pas de cloud dans cette
boucle. C'est la contrepartie non négociable d'un micro toujours actif dans
une maison avec deux enfants.

Contrainte de latence (`data/hud/orbe.yaml`) : l'accusé de réveil part en
moins de 100 ms. Ici, la détection publie sur le bus dès la trame concernée ;
c'est le HUD qui joue l'animation et le clip déjà en cache.

Dépendances **optionnelles** : `openwakeword` et `sounddevice`. Absentes, le
détecteur se déclare indisponible et le Core démarre normalement — on ne perd
que le réveil mains libres, le push-to-talk du HUD continue de fonctionner.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable

import yaml

logger = logging.getLogger("jarvis.voice.wake")

CONFIG_PATH = Path(__file__).resolve().parents[2] / "data" / "voice" / "wake.yaml"


class WakeWordUnavailable(RuntimeError):
    """Dépendance absente, micro introuvable, ou modèle illisible."""


def _load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return {}
    with CONFIG_PATH.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


class WakeWordDetector:
    """Écoute le micro et publie `wake_word` sur le bus à chaque détection.

    La capture audio est bloquante : elle tourne dans un thread dédié, et le
    passage vers la boucle asyncio se fait par `call_soon_threadsafe`. Publier
    directement depuis le thread audio corromprait l'état du bus.
    """

    def __init__(
        self,
        on_wake: Callable[[dict[str, Any]], None],
        *,
        config: dict[str, Any] | None = None,
        loop: asyncio.AbstractEventLoop | None = None,
    ) -> None:
        self.cfg = config if config is not None else _load_config()
        self._on_wake = on_wake
        self._loop = loop

        self.threshold: float = float(self.cfg.get("threshold", 0.5))
        self.sample_rate: int = int(self.cfg.get("sample_rate", 16000))
        self.frame_samples: int = int(self.cfg.get("frame_samples", 1280))
        self.refractory_s: float = float(self.cfg.get("refractory_s", 2.0))
        self.silent_ack_s: float = float(self.cfg.get("silent_ack_if_recent_s", 30.0))

        self.available = False
        self.running = False
        self.last_error: str | None = None
        self.detections = 0

        self._model: Any = None
        self._stream: Any = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._last_detection = 0.0
        self._last_interaction = 0.0

    # ── cycle de vie ────────────────────────────────────────────────────

    def load(self) -> bool:
        """Charge le modèle. Ne lève pas : renvoie False et note l'erreur."""
        if not self.cfg.get("enabled", True):
            self.last_error = "désactivé dans wake.yaml"
            return False
        try:
            from openwakeword.model import Model  # type: ignore
        except ImportError:
            self.last_error = (
                "openwakeword absent — pip install openwakeword ; "
                "le push-to-talk du HUD reste disponible"
            )
            logger.warning("Wake word indisponible : %s", self.last_error)
            return False

        name = str(self.cfg.get("model", "hey_jarvis"))
        # ONNX plutôt que tflite : openWakeWord vise tflite par défaut, mais
        # `tflite-runtime` ne s'installe pas sous Windows et reste capricieux
        # ailleurs. onnxruntime tourne partout — poste de dev comme NUC.
        framework = str(self.cfg.get("inference_framework", "onnx"))

        try:
            # Les modèles pré-entraînés se téléchargent une fois puis sont mis
            # en cache. Sans réseau au premier lancement, l'appel échoue et on
            # tombe proprement dans le `except`.
            if not name.endswith((".onnx", ".tflite")):
                try:
                    import openwakeword  # type: ignore

                    openwakeword.utils.download_models([name])
                except Exception as exc:  # noqa: BLE001
                    logger.debug("Téléchargement du modèle %s ignoré : %s", name, exc)

            self._model = Model(wakeword_models=[name], inference_framework=framework)
            self._key = name.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"modèle « {name} » illisible : {exc}"
            logger.warning("Wake word indisponible : %s", self.last_error)
            return False

        self.available = True
        self.last_error = None
        logger.info("Wake word prêt · modèle=%s · seuil=%.2f", name, self.threshold)
        return True

    def start(self, loop: asyncio.AbstractEventLoop | None = None) -> bool:
        """Ouvre le micro et démarre le thread de capture."""
        if self.running:
            return True
        if not self.available and not self.load():
            return False

        self._loop = loop or self._loop or asyncio.get_event_loop()

        try:
            import sounddevice as sd  # type: ignore
        except ImportError:
            self.last_error = "sounddevice absent — pip install sounddevice"
            logger.warning("Wake word : %s", self.last_error)
            return False

        try:
            self._stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype="int16",
                blocksize=self.frame_samples,
                device=self.cfg.get("device"),
            )
            self._stream.start()
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"micro indisponible : {exc}"
            logger.warning("Wake word : %s", self.last_error)
            self._stream = None
            return False

        self._stop.clear()
        self._thread = threading.Thread(target=self._listen, name="wake-word", daemon=True)
        self._thread.start()
        self.running = True
        logger.info("Wake word en écoute")
        return True

    def stop(self) -> None:
        """Arrête VRAIMENT la capture — on ne se contente pas d'ignorer.

        Une orbe qui a l'air normale alors que le micro écoute encore serait
        le pire des mensonges (cf. `stop_on_privacy_mode`).
        """
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._thread = None
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:  # noqa: BLE001
                pass
            self._stream = None
        self.running = False
        logger.info("Wake word arrêté")

    # ── boucle de capture (thread dédié) ────────────────────────────────

    def _listen(self) -> None:
        while not self._stop.is_set():
            try:
                frame, overflowed = self._stream.read(self.frame_samples)
            except Exception as exc:  # noqa: BLE001
                self.last_error = f"lecture micro : {exc}"
                logger.warning("Wake word : %s", self.last_error)
                break
            if overflowed:
                # Non fatal : on a raté un fragment, le mot suivant passera.
                logger.debug("Wake word : dépassement de tampon audio")

            try:
                scores = self._model.predict(frame.flatten())
            except Exception as exc:  # noqa: BLE001
                self.last_error = f"inférence : {exc}"
                logger.warning("Wake word : %s", self.last_error)
                break

            score = float(max(scores.values()) if scores else 0.0)
            if score < self.threshold:
                continue

            now = time.monotonic()
            # Période réfractaire : un mot prononcé dépasse le seuil sur
            # plusieurs trames consécutives. Sans ça, une phrase déclenche
            # trois réveils.
            if now - self._last_detection < self.refractory_s:
                continue
            self._last_detection = now
            self.detections += 1

            self._dispatch(score, now)

    def _dispatch(self, score: float, now: float) -> None:
        """Repasse dans la boucle asyncio — le bus n'est pas thread-safe."""
        payload = {
            "score": round(score, 3),
            # Anti-perroquet : réveil enchaîné → l'orbe réagit, mais JARVIS
            # ne se re-présente pas. Personne ne se fait annoncer trois fois
            # d'affilée dans une vraie conversation.
            "silent_ack": (now - self._last_interaction) < self.silent_ack_s,
            "detections": self.detections,
        }
        if self._loop is None or self._loop.is_closed():
            return
        try:
            self._loop.call_soon_threadsafe(self._on_wake, payload)
        except RuntimeError:
            pass

    # ── état ────────────────────────────────────────────────────────────

    def note_interaction(self) -> None:
        """À appeler à la fin d'un échange, pour armer l'anti-perroquet."""
        self._last_interaction = time.monotonic()

    def status(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "running": self.running,
            "model": self.cfg.get("model"),
            "threshold": self.threshold,
            "detections": self.detections,
            "error": self.last_error,
        }
