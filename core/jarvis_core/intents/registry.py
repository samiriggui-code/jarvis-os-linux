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
    from ..hermes.delegate import HermesIntentDelegate

    hermes = HermesIntentDelegate(orch)

    real: dict[str, Any] = {
        "home.control": orch._execute_home,
        "media.video": orch._execute_video,
        "media.pause": orch._execute_media_pause,
        "media.streaming": orch._execute_streaming,
        "hud.lock": orch._execute_hud,
        "hud.idle": orch._execute_hud,
        "hud.close_space": orch._execute_hud,
        "hud.mute": orch._execute_hud,
        "hud.unmute": orch._execute_hud,
        "hud.camera_on": orch._execute_hud,
        "hud.camera_off": orch._execute_hud,
        "hud.enroll": orch._execute_hud,
        "system.capabilities": orch._execute_capabilities,
        "system.introspect": orch._execute_introspect,
        "core.holomat": orch._execute_camera_view,
        "devices.list": orch._execute_devices_list,
        "devices.software": orch._execute_devices_software,
        "devices.topology": orch._execute_devices_topology,
        "core.mission_dev": orch._execute_mission_dev,
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

        if cap.owner is not Owner.HERMES:
            continue

        async def _hermes_handler(payload: dict[str, Any], _cap=cap) -> dict[str, Any]:
            # `text` doit voyager jusqu'ici : sans lui, l'allowlist VPS de
            # `PolicyEngine.evaluate()` ne filtre jamais rien (elle ne
            # s'applique que si `text` est non vide) — c'était le bug trouvé
            # lors du chantier Terminal admin (2026-08-09). `.get`, jamais
            # `.pop` : `HermesIntentDelegate.execute()` doit encore pouvoir
            # consommer `_pending_prompts` juste après.
            text = str(payload.get("prompt") or "").strip()
            if not text and (approval_id := payload.get("approval_id")):
                text = orch._pending_prompts.get(str(approval_id), "")
            decision = orch.policy.evaluate(action=_cap.intent, text=text, risk=_cap.risk)
            return await hermes.execute(_cap, payload, decision=decision)

        orch.intents.register(cap.intent, _hermes_handler)

    logger.info("capacités enregistrées · %d intentions", len(orch.intents.actions))
