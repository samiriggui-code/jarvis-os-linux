"""JARVIS Core — orchestrateur minimal (dev)."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from .orchestrator import Orchestrator
from .ws.routes import (
    BOOT_ANNOUNCE_GRACE_S,
    HOST,
    PORT,
    ROUTES,
    Route,
    SalonNullWs,
    _SalonNullWs,
)

logger = logging.getLogger("jarvis.core")

__all__ = [
    "BOOT_ANNOUNCE_GRACE_S",
    "HOST",
    "PORT",
    "ROUTES",
    "Route",
    "SalonNullWs",
    "_SalonNullWs",
    "Orchestrator",
    "handler",
    "main",
    "run",
]


async def handler(orchestrator: Orchestrator, ws: Any) -> None:
    conn_id = orchestrator.connections.bind(ws)
    orchestrator.clients.add(ws)
    logger.info("HUD connecté (%s client(s)) · conn=%s", len(orchestrator.clients), conn_id[:8])
    try:
        await ws.send(json.dumps(orchestrator.cmd("boot")))
        mode = orchestrator.providers.current_mode()
        auth_hint = ""
        if orchestrator.auth is not None:
            st = orchestrator.auth.status()
            auth_hint = (
                " · first_run"
                if st.get("first_run")
                else f" · {st.get('user_count', 0)} user(s)"
            )
        await ws.send(
            json.dumps(
                orchestrator.cmd(
                    "display_notification",
                    message=f"JARVIS Core prêt · mode IA : {mode}{auth_hint}",
                    duration=4.0,
                )
            )
        )
        if orchestrator.auth is not None:
            auth_payload = orchestrator.auth.status(connection_id=conn_id)
            hint = orchestrator._device_hint_for_ws(ws)
            if hint:
                auth_payload["device_hint"] = hint
            await ws.send(json.dumps({"type": "auth_status", **auth_payload}))
        if orchestrator.voice is not None:
            await ws.send(json.dumps({"type": "voice_status", **orchestrator.voice.status()}))
        await ws.send(json.dumps({
            "type": "supervisor_status",
            **orchestrator.supervisor.status(),
        }))
        try:
            from .tool_events import timeline_snapshot_payload

            snap = timeline_snapshot_payload(40)
            if snap.get("events"):
                await ws.send(json.dumps(snap))
        except Exception:  # noqa: BLE001
            logger.debug("tool_timeline bootstrap ignoré", exc_info=True)

        async def _boot_when_ready() -> None:
            try:
                await asyncio.wait_for(
                    orchestrator._boot_requested(ws).wait(), timeout=BOOT_ANNOUNCE_GRACE_S
                )
            except (asyncio.TimeoutError, TimeoutError):
                logger.debug(
                    "aucune demande d'annonce en %.0f s — boot joué d'office",
                    BOOT_ANNOUNCE_GRACE_S,
                )
            await orchestrator.speak_boot_sequence(ws)

        boot_task = asyncio.create_task(_boot_when_ready())
        orchestrator._tasks.add(boot_task)
        boot_task.add_done_callback(orchestrator._tasks.discard)
        boot_task.add_done_callback(
            lambda t: t.cancelled()
            or (t.exception() and logger.exception("séquence de boot", exc_info=t.exception()))
        )
        async for message in ws:
            await orchestrator.on_message(ws, message)
    finally:
        device_id = orchestrator.connections.device_for(ws)
        dropped = orchestrator.connections.unbind(ws)
        if device_id:
            orchestrator.device_dispatch.cancel_for_device(device_id)
        if dropped and orchestrator.auth is not None:
            orchestrator.auth.on_disconnect(dropped)
        orchestrator.clients.discard(ws)
        logger.info("HUD déconnecté (%s client(s))", len(orchestrator.clients))


async def main() -> None:
    try:
        from websockets.asyncio.server import serve
    except ImportError:
        from websockets.server import serve  # type: ignore

    logging.basicConfig(
        level=logging.INFO, format="[%(name)s] %(message)s", force=True
    )
    orch = Orchestrator()
    logger.info("JARVIS Core → ws://%s:%s · mode=%s", HOST, PORT, orch.providers.current_mode())

    async with serve(lambda ws: handler(orch, ws), HOST, PORT):
        await orch.start_background()
        await asyncio.Future()


def run() -> None:
    try:
        from pathlib import Path

        from dotenv import load_dotenv

        env_path = Path(__file__).resolve().parents[1] / ".env"
        load_dotenv(env_path)
    except ImportError:
        pass
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nArrêt Core.")


if __name__ == "__main__":
    run()
