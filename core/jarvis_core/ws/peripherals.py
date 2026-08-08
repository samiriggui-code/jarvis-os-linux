"""Dialogues périphériques HUD — caméra, micro, sortie audio (Phase 2)."""
from __future__ import annotations

# device key → (missing, denied, ready, lost) — clés dialogues YAML
PERIPHERAL_LINES: dict[str, tuple[str, str, str, str]] = {
    "camera": (
        "peripheral_camera_missing",
        "peripheral_camera_denied",
        "peripheral_camera_ready",
        "peripheral_camera_lost",
    ),
    "mic": (
        "peripheral_mic_missing",
        "peripheral_mic_denied",
        "peripheral_mic_ready",
        "peripheral_mic_lost",
    ),
    "audio_out": (
        "peripheral_audio_out_missing",
        "peripheral_audio_out_denied",
        "peripheral_audio_out_ready",
        "peripheral_audio_out_hdmi_lost",
    ),
}
