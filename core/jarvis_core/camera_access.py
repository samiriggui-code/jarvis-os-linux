"""Jetons d'accès caméra — courte durée, signés, un par device.

Contrat : Core (déjà authentifié via la session WS) mint un jeton quand un
utilisateur demande le flux d'une caméra précise. Ce jeton est ce que le HUD
met dans l'URL `<img src=...>` — jamais un token statique codé en dur côté
frontend. `nginx` (auth_request) et `salon_ingest.py` (route `/verify`)
vérifient ce jeton avant de laisser passer le flux vers le satellite.

Pas de session serveur à tenir : HMAC(device_id + expiry) avec un secret
lu une fois au process. Rejoue possible pendant la fenêtre de validité —
volontairement courte (par défaut 5 min) car c'est un flux vidéo consulté
manuellement, pas un secret longue durée.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time

logger = logging.getLogger("jarvis.camera_access")

_DEFAULT_TTL_S = 300  # 5 min — assez pour ouvrir/regarder, pas une clé permanente
_SECRET_ENV = "JARVIS_CAMERA_TOKEN_SECRET"


def _secret() -> bytes:
    raw = (os.environ.get(_SECRET_ENV) or "").strip()
    if not raw:
        # Dev sans secret configuré : dérivé du salon token existant plutôt que
        # rien — log explicite pour ne pas laisser ça passer inaperçu en prod.
        fallback = (os.environ.get("JARVIS_SALON_TOKEN") or "jarvis-camera-dev-only").strip()
        logger.warning(
            "%s absent — jeton caméra dérivé d'un secret de repli (dev uniquement, "
            "à définir explicitement avant tout usage prolongé)",
            _SECRET_ENV,
        )
        raw = f"camera-fallback::{fallback}"
    return raw.encode("utf-8")


def mint_camera_token(device_id: str, *, ttl_s: int = _DEFAULT_TTL_S) -> str:
    """`<expiry>.<hmac_hex>` — pas de session à stocker, tout est dans le jeton."""
    expiry = int(time.time()) + max(1, ttl_s)
    msg = f"{device_id}:{expiry}".encode("utf-8")
    sig = hmac.new(_secret(), msg, hashlib.sha256).hexdigest()
    return f"{expiry}.{sig}"


def verify_camera_token(device_id: str, token: str) -> bool:
    token = (token or "").strip()
    if "." not in token:
        return False
    expiry_raw, _, sig = token.partition(".")
    try:
        expiry = int(expiry_raw)
    except ValueError:
        return False
    if time.time() >= expiry:
        return False
    msg = f"{device_id}:{expiry}".encode("utf-8")
    expected = hmac.new(_secret(), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)
