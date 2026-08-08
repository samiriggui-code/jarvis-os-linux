"""Capability Router — origine, device_mode, host satellite (Phase 5/6)."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from ..devices import Device, DeviceRegistry, _default_nuc_id

logger = logging.getLogger("jarvis.router")

# Intent → HostCapability pour exécution *satellite* uniquement.
INTENT_HOST_CAPABILITY: dict[str, str] = {
    "core.cursor": "app.launch",
    "device.app_launch": "app.launch",
}

_BROWSER_KINDS = frozenset({"browser", "web_hud", "web"})
_AGENT_RUNTIMES = frozenset({"fake_agent", "windows_agent"})


@dataclass
class RouteContext:
    origin_device_id: str | None = None
    device_mode: str = "shared"
    bound_user_id: str = ""
    session_user_id: str | None = None
    capability_id: str | None = None


@dataclass
class RouteResult:
    device_id: str | None
    reason: str
    rejected: bool = False
    missing: list[str] = field(default_factory=list)


class CapabilityRouter:
    def __init__(self, registry: DeviceRegistry) -> None:
        self._registry = registry

    def context_from(
        self,
        *,
        origin_device_id: str | None,
        session_user_id: str | None = None,
        capability_id: str | None = None,
    ) -> RouteContext:
        dev = self._registry.get_device(origin_device_id) if origin_device_id else None
        return RouteContext(
            origin_device_id=origin_device_id,
            device_mode=dev.device_mode if dev else "shared",
            bound_user_id=dev.bound_user_id if dev else "",
            session_user_id=session_user_id,
            capability_id=capability_id,
        )

    @staticmethod
    def capability_for_intent(intent: str) -> str | None:
        return INTENT_HOST_CAPABILITY.get(intent)

    def resolve_output_device(self, ctx: RouteContext) -> RouteResult:
        """TTS / retour vocal — origine si bouche distante, sinon navigateur."""
        if not ctx.origin_device_id:
            return RouteResult(None, "no_origin_browser")

        dev = self._registry.get_device(ctx.origin_device_id)
        if dev is None or not dev.online:
            return RouteResult(None, "origin_offline")

        if ctx.device_mode == "personal":
            if (
                ctx.bound_user_id
                and ctx.session_user_id
                and ctx.session_user_id != ctx.bound_user_id
            ):
                return RouteResult(
                    None,
                    "personal_bound_user_mismatch",
                    rejected=True,
                )
            if self._remote_speaker(dev):
                return RouteResult(dev.device_id, "personal_origin_speaker")
            return RouteResult(None, "personal_browser_local")

        if ctx.device_mode == "gateway":
            if self._remote_speaker(dev):
                return RouteResult(dev.device_id, "gateway_speaker")
            return RouteResult(None, "gateway_no_speaker")

        if self._remote_speaker(dev):
            return RouteResult(dev.device_id, "shared_origin_speaker")
        return RouteResult(None, "shared_browser_local")

    def resolve_host_device(
        self, ctx: RouteContext, capability_id: str
    ) -> RouteResult:
        """Quel satellite possède la HostCapability demandée."""
        scored: list[tuple[int, str]] = []
        for dev in self._registry.iter_online():
            if capability_id not in dev.capabilities:
                continue
            cap = dev.capabilities[capability_id]
            if cap.value is False:
                continue
            score = self._score_host(dev, ctx)
            if score < 0:
                continue
            scored.append((score, dev.device_id))

        if not scored:
            return RouteResult(
                None,
                "no_host_online",
                rejected=True,
                missing=[capability_id],
            )

        scored.sort(key=lambda x: x[0], reverse=True)
        best_score, best_id = scored[0]
        logger.debug(
            "host route · %s → %s (score=%s mode=%s)",
            capability_id,
            best_id,
            best_score,
            ctx.device_mode,
        )
        return RouteResult(best_id, "host_scored")

    def resolve_launch_device(self, ctx: RouteContext, app_id: str) -> RouteResult:
        """Agent avec ``app.launch`` + ``app.software.{app_id}`` (P4)."""
        app_id = str(app_id or "").strip()
        if not app_id:
            return RouteResult(
                None,
                "app_id_required",
                rejected=True,
                missing=["app_id"],
            )
        soft_cap = f"app.software.{app_id}"
        scored: list[tuple[int, str]] = []
        origin_dev = (
            self._registry.get_device(ctx.origin_device_id)
            if ctx.origin_device_id
            else None
        )
        origin_fp = ""
        if origin_dev is not None:
            origin_fp = str((origin_dev.metadata or {}).get("machine_fingerprint") or "")

        for dev in self._registry.iter_online():
            if dev.runtime_kind in _BROWSER_KINDS:
                continue
            if dev.runtime_kind and dev.runtime_kind not in _AGENT_RUNTIMES:
                # Agents futurs : runtime_kind explicite requis.
                continue
            launch = dev.capabilities.get("app.launch")
            if launch is None or launch.value is False:
                continue
            soft = dev.capabilities.get(soft_cap)
            if soft is None or soft.value is False:
                continue
            score = self._score_host(dev, ctx)
            if score < 0:
                continue
            dev_fp = str((dev.metadata or {}).get("machine_fingerprint") or "")
            if origin_fp and dev_fp and origin_fp == dev_fp:
                score += 50
            scored.append((score, dev.device_id))

        if not scored:
            return RouteResult(
                None,
                "no_launch_agent_online",
                rejected=True,
                missing=[soft_cap, "app.launch"],
            )

        scored.sort(key=lambda x: x[0], reverse=True)
        _, best_id = scored[0]
        return RouteResult(best_id, "launch_scored")

    def resolve_tool_device(self, ctx: RouteContext, *, owner: str) -> RouteResult:
        """Machine portée dans tool_event — exécution, pas forcément la bouche."""
        owner = (owner or "core").lower()
        if owner == "hermes":
            return RouteResult(_default_nuc_id(), "hermes_on_nuc")

        if owner == "device":
            if ctx.origin_device_id:
                dev = self._registry.get_device(ctx.origin_device_id)
                if dev and dev.online and dev.runtime_kind in _AGENT_RUNTIMES:
                    return RouteResult(dev.device_id, "device_agent_origin")
            return RouteResult(None, "device_host_pending")

        if ctx.origin_device_id:
            dev = self._registry.get_device(ctx.origin_device_id)
            if dev and dev.online and dev.device_mode != "gateway":
                return RouteResult(dev.device_id, "origin_tool")

        return RouteResult(_default_nuc_id(), "core_process")

    def _score_host(self, dev: Device, ctx: RouteContext) -> int:
        if dev.device_mode == "gateway":
            base = 10
        elif dev.device_mode == "shared":
            base = 25
        elif dev.device_mode == "personal":
            if ctx.bound_user_id and ctx.session_user_id != ctx.bound_user_id:
                return -1
            base = 40
        else:
            base = 5

        score = base
        if dev.device_id == ctx.origin_device_id:
            score += 100
        if dev.device_mode == "personal" and ctx.bound_user_id == dev.bound_user_id:
            score += 30
        return score

    @staticmethod
    def _remote_speaker(dev: Device) -> bool:
        if dev.runtime_kind in _BROWSER_KINDS:
            return False
        return (
            "speaker.output" in dev.capabilities
            or "audio.output" in dev.capabilities
        )
