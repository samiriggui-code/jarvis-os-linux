"""Smoke E2E — circuit intent produit (Phase 6, offline mocks)."""
from __future__ import annotations

import asyncio
import json
import sys
from typing import Any
from unittest.mock import AsyncMock, MagicMock

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from jarvis_core.capabilities import CAPABILITIES, match_intent
from jarvis_core.routing.host_gate import resolve_execution_host
from jarvis_core.routing.provider import CapabilityProvider, provider_for_intent
from jarvis_core.routing.router import CapabilityRouter, RouteContext
from jarvis_core.devices import DeviceRegistry


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


class _WsCapture:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def send(self, raw: str) -> None:
        self.messages.append(json.loads(raw))


async def _run_circuit(orch: Any, text: str) -> _WsCapture:
    ws = _WsCapture()
    cap = match_intent(text)
    check(f"match « {text[:32]} »", cap is not None, cap.intent if cap else "")
    assert cap is not None
    await orch._open_intent(ws, cap, text)
    return ws


def main() -> int:
    print("PHASE6 intent circuit (E2E offline)")

    # ── Host gate CORE in-process sans satellite ─────────────────────────────
    reg = DeviceRegistry(ttl_s=120)
    reg.register_local_core()
    router = CapabilityRouter(reg)
    ctx = RouteContext(origin_device_id="browser-1", device_mode="shared")

    for intent in ("home.control", "core.holomat", "media.video"):
        prov = provider_for_intent(intent)
        check(f"{intent} -> CORE provider", prov is CapabilityProvider.CORE)
        host = resolve_execution_host(router, ctx, intent)
        check(f"{intent} host gate", not host.rejected, host.reason)

    from jarvis_core import Orchestrator
    from jarvis_core.policy import Decision

    orch = Orchestrator()
    orch.policy.evaluate = lambda **kwargs: Decision(allowed=True, needs_confirmation=False)  # type: ignore[method-assign]

    # Mock adaptateurs locaux
    orch.hass.execute = AsyncMock(
        return_value={"ok": True, "action": "on", "entity_id": "light.salon"}
    )
    orch.plex.execute = AsyncMock(
        return_value={"ok": True, "action": "play", "title": "Interstellar"}
    )
    orch.say = AsyncMock(return_value=None)
    orch.speak = AsyncMock(return_value={"type": "tts_skipped"})
    broadcast_events: list[dict[str, Any]] = []

    async def _capture_broadcast(ev: dict[str, Any]) -> None:
        broadcast_events.append(ev)

    orch.broadcast = _capture_broadcast  # type: ignore[method-assign]

    async def _camera_view(payload: dict[str, Any]) -> dict[str, Any]:
        return {"ok": True, "app": "vision", "text": "Voici le flux caméra."}

    orch._execute_camera_view = _camera_view  # type: ignore[method-assign]

    async def _run_all() -> None:
        # 1 home
        ws1 = await _run_circuit(orch, "allume le salon")
        check("home → execute", orch.hass.execute.called)
        sr = [m for m in ws1.messages if m.get("type") == "surface_result"]
        check("home surface_result ok", sr and sr[-1].get("ok") is True)
        te = [m for m in broadcast_events if m.get("type") == "tool_event"]
        check("home tool_event", len(te) >= 2)
        broadcast_events.clear()

        orch.hass.execute.reset_mock()

        # 2 plex
        ws2 = await _run_circuit(orch, "mets Interstellar")
        check("plex → execute", orch.plex.execute.called)

        # 3 pause
        ws3 = await _run_circuit(orch, "coupe la musique")
        check("pause → execute", orch.hass.execute.called)

        # 4 holomat
        ws4 = await _run_circuit(orch, "montre la caméra")
        sr4 = [m for m in ws4.messages if m.get("type") == "surface_result"]
        check("holomat executed", sr4 and sr4[-1].get("executed") is True)

        # 5 Hermes via delegate (mock)
        cap_reach = CAPABILITIES["reach"]
        from jarvis_core.hermes.delegate import HermesIntentDelegate

        delegate = HermesIntentDelegate(orch)
        orch.hermes.ask = AsyncMock(
            return_value=MagicMock(text="Résultat Hermes mock", toolsets=("web",))
        )
        orch._publish_result_surface = AsyncMock()
        decision = orch.policy.evaluate(action=cap_reach.intent, risk=cap_reach.risk)
        result = await delegate.execute(
            cap_reach, {"prompt": "actualité"}, decision=decision
        )
        check("hermes delegate text", "Hermes" in result.get("text", ""))

        # 6 unknown → no intent
        unknown = match_intent("quelle est la capitale de la lune")
        check("unknown phrase → None", unknown is None)

    asyncio.run(_run_all())

    print("\nPHASE6 intent circuit : PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
