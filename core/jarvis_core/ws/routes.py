"""Table WS + constantes partagées (Phase 1)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

HOST = "127.0.0.1"
PORT = 8765


class SalonNullWs:
    """Remplace un client HUD quand l'utterance vient du Pi (HTTP)."""

    async def send(self, _data: str) -> None:
        return


# Alias interne (compat extractions)
_SalonNullWs = SalonNullWs

BOOT_REPLAY_COOLDOWN_S = 5.0
BOOT_ANNOUNCE_GRACE_S = 75.0
PERIPHERAL_DETECT_GROUP_S = 3.0

SESSION_SAY_FALLBACKS: dict[str, str] = {
    "session_locked_manual": (
        "Verrouillage de session. Mise en veille des systèmes. À bientôt."
    ),
    "session_locked_auto": (
        "Verrouillage automatique. Mise en veille des systèmes. À bientôt."
    ),
    "session_goodbye": "À bientôt.",
    "session_closed": "Session verrouillée.",
    "session_opened": "Session ouverte.",
    "session_welcome_back": (
        "Tous les systèmes sont opérationnels. "
        "Ravi de vous revoir, {titre}. Que puis-je faire pour vous ?"
    ),
}

_ROLE_TITLES = {"admin": "monsieur", "user": "madame", "child": "mademoiselle"}


@dataclass(frozen=True)
class Route:
    handler: str
    error_type: str
    error_extra: dict[str, Any] = field(default_factory=dict)
    rewrite: Callable[[dict[str, Any]], dict[str, Any]] | None = None


def _user_id_of(data: dict[str, Any], field_name: str) -> str | None:
    inner = data.get(field_name)
    return inner.get("userId") if isinstance(inner, dict) else None


ROUTES: dict[str, Route] = {
    "ping": Route("handle_ping", "core_error"),
    "auth": Route("handle_auth", "auth_error"),
    "holomat": Route("handle_holomat", "holomat_error"),
    "perception": Route("handle_perception", "perception_error"),
    "gesture": Route("handle_gesture", "core_error"),
    "peripheral": Route("handle_peripheral", "core_error"),
    "device": Route("handle_device", "device_error"),
    "device.execute_result": Route("handle_device_execute_result", "device_error"),
    "device.run.progress": Route("handle_device_run_progress", "device_error"),
    "device.run.completed": Route("handle_device_run_completed", "device_error"),
    "device.run.failed": Route("handle_device_run_failed", "device_error"),
    "device.run.cancel_result": Route("handle_device_run_cancel_result", "device_error"),
    "device.run.status_result": Route("handle_device_run_status_result", "device_error"),
    "preferences": Route("handle_preferences", "preferences_result", {"ok": False}),
    "memory": Route("handle_memory", "memory_result", {"ok": False}),
    "voice": Route("handle_voice", "voice_error"),
    "agent_reach": Route("handle_agent_reach", "agent_reach_status", {"ok": False}),
    "supervisor": Route("handle_supervisor", "supervisor_status", {"ok": False}),
    "usage": Route("handle_usage", "usage_result", {"ok": False}),
    "providers": Route("handle_providers", "providers_result", {"ok": False}),
    "hermes_status": Route("handle_hermes", "hermes_result", {"ok": False}),
    "voicebox": Route("handle_voicebox", "voicebox_result", {"ok": False}),
    "boot": Route("handle_boot", "core_error"),
    "surface": Route("handle_surface", "surface_error", {"ok": False}),
    "terminal": Route("handle_terminal", "terminal_result", {"ok": False}),
    "user_event": Route("handle_chat", "core_error"),
    "stop_run": Route("handle_stop_run", "core_error"),
    "tool_timeline": Route("handle_tool_timeline", "core_error"),
    "mission_dev": Route("handle_mission_dev", "mission_dev_error"),
    "mission_board": Route("handle_mission_board", "mission_board_result", {"ok": False}),
    "save_hud_preferences": Route(
        "handle_preferences",
        "preferences_result",
        {"ok": False},
        rewrite=lambda d: {
            "action": "save_hud_preferences",
            "prefs": d.get("prefs"),
            "user_id": _user_id_of(d, "prefs"),
        },
    ),
    "save_gesture_profile": Route(
        "handle_preferences",
        "preferences_result",
        {"ok": False},
        rewrite=lambda d: {
            "action": "save_gesture_profile",
            "profile": d.get("profile"),
            "user_id": _user_id_of(d, "profile"),
        },
    ),
    "holomat_calibrate_start": Route(
        "handle_holomat",
        "holomat_error",
        rewrite=lambda d: {
            "action": "calibrate_start",
            "camera_on": d.get("camera_on", False),
            "cameraDeviceId": d.get("cameraDeviceId"),
        },
    ),
}


def default_prompt(cap: Any) -> str:
    return (
        f"Rends l'état actuel pour l'intention « {cap.intent} », en une phrase "
        "courte et en français. N'exécute aucune action de modification."
    )


_default_prompt = default_prompt
