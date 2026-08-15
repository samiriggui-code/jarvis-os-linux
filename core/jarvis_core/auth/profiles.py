"""
Profils expérience utilisateur — fichiers JSON sous core/data/users/<id>/.

  hud_preferences  — Settings HUD (voix, caméra, coupure, session unlock)
  gesture_profile  — main dominante, sensibilité, bindings gestes → actions

Calibration machine Holomat (Charuco / homography) :
  core/data/holomat/calibration.json  — pas dans la mémoire conversationnelle

Secrets (API keys) : jamais ici — coffre / .env.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .db import default_data_dir, ensure_user_profile_dir

logger = logging.getLogger("jarvis.auth.profiles")

DEFAULT_GESTURE: dict[str, Any] = {
    "userId": "",
    "dominantHand": "right",
    "sensitivity": 0.7,
    "bindings": [
        {"id": "swipe_right", "label": "Balayage droite", "action": "next_panel", "enabled": True},
        {"id": "swipe_left", "label": "Balayage gauche", "action": "prev_panel", "enabled": True},
        {"id": "swipe_up", "label": "Balayage haut", "action": "stack_prev", "enabled": True},
        {"id": "swipe_down", "label": "Balayage bas", "action": "stack_next", "enabled": True},
        {"id": "open_hand", "label": "Paume ouverte", "action": "open_launcher", "enabled": True},
        {"id": "pinch", "label": "Pincement", "action": "select_or_close", "enabled": True},
        {"id": "fist", "label": "Poing fermé", "action": "mute", "enabled": True},
        {"id": "peace", "label": "Victoire", "action": "ack_done", "enabled": True},
        {"id": "point", "label": "Index levé", "action": "activate_voice", "enabled": True},
    ],
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        logger.warning("JSON invalide : %s", path)
        return None


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def resolve_user_id(explicit: str | None = None, session_user_id: str | None = None) -> str:
    uid = (explicit or session_user_id or "local").strip()
    return uid or "local"


def load_hud_preferences(user_id: str) -> dict[str, Any] | None:
    root = ensure_user_profile_dir(user_id)
    return _read_json(root / "hud_preferences")


def save_hud_preferences(user_id: str, prefs: dict[str, Any]) -> dict[str, Any]:
    root = ensure_user_profile_dir(user_id)
    payload = {**prefs, "userId": user_id, "updatedAt": _utc_now()}
    _write_json(root / "hud_preferences", payload)
    logger.info("hud_preferences sauvé · user=%s", user_id)
    return {"ok": True, "path": str(root / "hud_preferences"), "user_id": user_id}


def load_gesture_profile(user_id: str) -> dict[str, Any]:
    root = ensure_user_profile_dir(user_id)
    data = _read_json(root / "gesture_profile")
    if data:
        return data
    out = {**DEFAULT_GESTURE, "userId": user_id}
    return out


def save_gesture_profile(user_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    root = ensure_user_profile_dir(user_id)
    payload = {**DEFAULT_GESTURE, **profile, "userId": user_id, "updatedAt": _utc_now()}
    _write_json(root / "gesture_profile", payload)
    logger.info("gesture_profile sauvé · user=%s", user_id)
    return {"ok": True, "path": str(root / "gesture_profile"), "user_id": user_id}


def calibration_path() -> Path:
    return default_data_dir() / "holomat" / "calibration.json"


def load_calibration() -> dict[str, Any]:
    data = _read_json(calibration_path())
    if data:
        return data
    return {
        "calibrated": False,
        "cameraDeviceId": None,
        "method": "charuco",
        "updatedAt": None,
    }


def save_calibration(patch: dict[str, Any]) -> dict[str, Any]:
    current = load_calibration()
    payload = {
        **current,
        **patch,
        "calibrated": bool(patch.get("calibrated", current.get("calibrated", False))),
        "updatedAt": _utc_now(),
    }
    _write_json(calibration_path(), payload)
    logger.info("holomat calibration sauvé · calibrated=%s", payload.get("calibrated"))
    return payload
