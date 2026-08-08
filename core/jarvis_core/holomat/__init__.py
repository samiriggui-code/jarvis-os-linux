"""Compat deprecated — préférer ``jarvis_core.vision``.

Le protocole WS reste ``type: holomat`` (contrat figé).
"""
from __future__ import annotations

import warnings

warnings.warn(
    "jarvis_core.holomat est déprécié — utiliser jarvis_core.vision",
    DeprecationWarning,
    stacklevel=2,
)

from jarvis_core.vision import FaceEngine, FaceRunner  # noqa: F401

__all__ = ["FaceEngine", "FaceRunner"]
