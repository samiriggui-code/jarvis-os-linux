"""jarvis_core.vision — face / présence (§6.8).

`FaceEngine` = CV pur et synchrone. `FaceRunner` = la facade à utiliser depuis
le Core : chargement différé, accès sérialisé, calcul hors boucle asyncio.

`FaceEngine` est exposé en lazy pour ne pas payer l'import d'OpenCV au boot du
Core — `runner.py` le charge dans un thread, à la demande.
"""

from .runner import FaceRunner

__all__ = ["FaceEngine", "FaceRunner"]


def __getattr__(name: str):
    if name == "FaceEngine":
        from .face_engine import FaceEngine

        return FaceEngine
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
