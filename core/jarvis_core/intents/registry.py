"""Enregistrement capacités et bindings (Phase 6)."""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


def register_bindings(orch: Any) -> None:
    """Sources que le Core accepte de servir à une composition."""
    from .. import metrics

    def _metric(key: str):
        def read():
            sample = metrics.sample()
            return sample.get(key) if isinstance(sample, dict) else None

        return read

    for key in ("cpu", "ram", "disk"):
        orch.bindings.register(f"system.{key}", "system.read", _metric(key), "number")
    orch.bindings.register("system.uptime_s", "system.read", _metric("uptime_s"), "integer")
    orch.bindings.register("system.host", "system.read", _metric("host"), "string")


def register_capabilities(orch: Any) -> None:
    """Donne un exécutant à chaque intention du volet Applications."""
    from ..capabilities import CAPABILITIES, Owner

    real: dict[str, Any] = {
        "home.control": orch._execute_home,
        "media.video": orch._execute_video,
        "media.pause": orch._execute_media_pause,
        "media.streaming": orch._execute_streaming,
        "hud.lock": orch._execute_hud,
        "hud.idle": orch._execute_hud,
        "hud.close_space": orch._execute_hud,
        "hud.close_app": orch._execute_hud_close_app,
        "hud.toggle_space": orch._execute_hud_toggle_space,
        "hud.mute": orch._execute_hud,
        "hud.unmute": orch._execute_hud,
        "hud.camera_on": orch._execute_hud,
        "hud.camera_off": orch._execute_hud,
        "hud.enroll": orch._execute_hud,
        "system.capabilities": orch._execute_capabilities,
        "system.introspect": orch._execute_introspect,
        "core.holomat": orch._execute_camera_view,
        "vision.analyze": orch._execute_vision_analyze,
        "vision.scene": orch._execute_vision_scene,
        "home.camera_list": orch._execute_home_camera_list,
        "home.camera_view": orch._execute_home_camera_view,
        "home.camera_snapshot": orch._execute_home_camera_snapshot,
        "devices.list": orch._execute_devices_list,
        "devices.software": orch._execute_devices_software,
        "devices.metrics": orch._execute_devices_metrics,
        "devices.topology": orch._execute_devices_topology,
        "core.mission_dev": orch._execute_mission_dev,
        "dev.board.create": orch._execute_dev_board_create,
        "dev.board.assign": orch._execute_dev_board_assign,
        "dev.board.start_run": orch._execute_dev_board_start_run,
        "core.preferences": orch._execute_preferences,
        "core.neural_map": orch._execute_neural_map,
        "core.dashboard": orch._execute_dashboard,
        "core.monitor": orch._execute_monitor,
        "core.security": orch._execute_security,
        "core.providers": orch._execute_providers,
        "core.usage": orch._execute_usage,
        "core.missions": orch._execute_missions,
        "vps.code": orch._execute_vps_code,
        "system.network": orch._execute_network,
        "vps.terminal": orch._execute_vps_terminal,
        "pi.terminal": orch._execute_pi_terminal,
        "architecture.explain": orch._execute_architecture_explain,
        "memory.search": orch._execute_memory_search,
        "memory.recall": orch._execute_memory_recall,
        "memory.store_note": orch._execute_memory_store_note,
        "web.search": orch._execute_web_search,
    }

    for cap in CAPABILITIES.values():
        if cap.owner is Owner.DEVICE:
            async def _device_handler(payload: dict[str, Any], _cap=cap) -> dict[str, Any]:
                return await orch._execute_device_intent(_cap, payload)

            orch.intents.register(cap.intent, _device_handler)
            continue

        if cap.owner is Owner.CORE:
            if handler := real.get(cap.intent):
                orch.intents.register(cap.intent, handler)
                continue

            def _core_handler(payload: dict[str, Any], _cap=cap) -> dict[str, Any]:
                return {
                    "intent": _cap.intent,
                    "owner": "core",
                    "display": _cap.display.value,
                    "note": _cap.note,
                }

            orch.intents.register(cap.intent, _core_handler)
            continue

    logger.info("capacités enregistrées · %d intentions", len(orch.intents.actions))
