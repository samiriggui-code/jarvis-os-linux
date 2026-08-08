#!/usr/bin/env python3
"""Agent Windows JARVIS — inventaire logiciel + ``app.launch`` (P4+).

Scanne les apps installées, les déclare au Core (``app.software.*``),
exécute sur ``device.execute`` / ``app.launch``.
Icône barre des tâches par défaut (pas de page web).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import socket
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agent_lib import DEFAULT_WS, execute_result, load_or_create_device_id, run_agent_session
from apps import AppLaunchError, launch
from config import apply_env_file
from discover import resolve_ws_url as discover_ws_url
from inventory import get_manager

try:
    import websockets
except ImportError:
    print("pip install websockets", file=sys.stderr)
    raise SystemExit(1)

logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
logger = logging.getLogger("jarvis.win.agent")

DATA_DIR = ROOT / "data"
DEVICE_ID_FILE = DATA_DIR / "device_id"
AGENT_VERSION = "0.4.0-windows"
RUNTIME_KIND = "windows_agent"
INVENTORY_POLL_S = float(os.environ.get("JARVIS_INVENTORY_POLL_S", "120"))
TRAY_ENABLED = os.environ.get("JARVIS_AGENT_TRAY", "1").lower() in ("1", "true", "yes")
PANEL_ENABLED = os.environ.get("JARVIS_AGENT_PANEL", "0").lower() in ("1", "true", "yes")


def resolve_ws_url() -> str:
    explicit = os.environ.get("JARVIS_WS_URL", "").strip()
    if explicit and os.environ.get("JARVIS_WS_URL_FORCE", "").lower() in ("1", "true", "yes"):
        return explicit
    url = discover_ws_url(persist=True)
    os.environ["JARVIS_WS_URL"] = url
    return url


async def _handle_execute(
    ws: websockets.WebSocketClientProtocol,
    data: dict,
    allowed: set[str],
) -> dict:
    started = time.monotonic()
    request_id = str(data.get("request_id") or "")
    device_id = str(data.get("device_id") or "")
    app_id = str((data.get("params") or {}).get("app_id") or "").strip().lower()
    policy = data.get("policy") if isinstance(data.get("policy"), dict) else {}

    live_allowed = {a.app_id for a in get_manager().apps if a.launchable}
    if live_allowed:
        allowed = live_allowed

    if not policy.get("granted", False):
        return execute_result(
            request_id=request_id,
            device_id=device_id,
            ok=False,
            started=started,
            error_code="policy_denied",
            error="policy.granted=false",
        )

    if app_id not in allowed:
        return execute_result(
            request_id=request_id,
            device_id=device_id,
            ok=False,
            started=started,
            error_code="app_not_allowed",
            error=f"app_id hors inventaire lançable : {app_id}",
        )

    try:
        result = launch(app_id)
    except AppLaunchError as exc:
        return execute_result(
            request_id=request_id,
            device_id=device_id,
            ok=False,
            started=started,
            error_code=exc.code,
            error=str(exc),
        )
    except OSError as exc:
        return execute_result(
            request_id=request_id,
            device_id=device_id,
            ok=False,
            started=started,
            error_code="launch_failed",
            error=str(exc),
        )

    display = str(result.get("display_name") or app_id)
    return execute_result(
        request_id=request_id,
        device_id=device_id,
        ok=True,
        started=started,
        summary=f"{display} lancé",
        result=result,
    )


def default_label() -> str:
    custom = os.environ.get("JARVIS_AGENT_LABEL", "").strip()
    if custom:
        return custom
    return f"{socket.gethostname()} (Windows)"


def _capabilities_factory() -> tuple[list[dict], bool]:
    mgr = get_manager()
    changed = mgr.refresh()
    return mgr.capabilities_payload(), changed


async def run_agent(
    uri: str,
    *,
    device_id: str | None = None,
    heartbeat_s: float = 30.0,
    stop: asyncio.Event | None = None,
) -> None:
    device_id = device_id or load_or_create_device_id(DEVICE_ID_FILE, prefix="pc")
    get_manager().refresh(force_full=True)
    await run_agent_session(
        uri,
        device_id=device_id,
        runtime_kind=RUNTIME_KIND,
        label=default_label(),
        agent_version=AGENT_VERSION,
        handle_execute=_handle_execute,
        capabilities_factory=_capabilities_factory,
        heartbeat_s=heartbeat_s,
        inventory_poll_s=INVENTORY_POLL_S,
        stop=stop,
    )


async def _agent_loop(ws_url: str, device_id: str | None, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await run_agent(ws_url, device_id=device_id, stop=stop)
        except asyncio.CancelledError:
            break
        except Exception as exc:  # noqa: BLE001
            if stop.is_set():
                break
            logger.warning("déconnecté : %s — reconnexion dans 3s", exc)
            try:
                await asyncio.wait_for(stop.wait(), timeout=3.0)
            except asyncio.TimeoutError:
                pass


def _run_agent_thread(ws_url: str, device_id: str | None, stop: threading.Event) -> None:
    loop_stop = asyncio.Event()

    def _watch() -> None:
        stop.wait()
        loop_stop.set()

    threading.Thread(target=_watch, daemon=True).start()
    try:
        asyncio.run(_agent_loop(ws_url, device_id, loop_stop))
    except KeyboardInterrupt:
        loop_stop.set()


def main() -> int:
    apply_env_file()
    parser = argparse.ArgumentParser(description="JARVIS Windows device agent")
    parser.add_argument("--url", default="", help="Core WebSocket URL (auto si vide)")
    parser.add_argument("--device-id", default="", help="Override stable device_id")
    parser.add_argument("--scan-only", action="store_true", help="Scan inventaire et quitter")
    parser.add_argument("--panel-only", action="store_true", help="API config HTTP (debug)")
    parser.add_argument("--no-tray", action="store_true", help="Sans icône barre des tâches")
    parser.add_argument("--no-panel", action="store_true", help="Sans API HTTP locale")
    args = parser.parse_args()
    device_id = args.device_id.strip() or None

    if args.panel_only:
        from panel_server import start_panel

        os.environ["JARVIS_AGENT_VERSION"] = AGENT_VERSION
        url = start_panel()
        print(f"Panneau debug · {url}")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
        return 0

    if args.scan_only:
        mgr = get_manager()
        mgr.refresh(force_full=True)
        apps = mgr.apps
        print(f"{len(apps)} apps · {sum(1 for a in apps if a.launchable)} launchable")
        return 0

    ws_url = args.url.strip() or resolve_ws_url()

    if PANEL_ENABLED and not args.no_panel:
        from panel_server import start_panel

        os.environ["JARVIS_AGENT_VERSION"] = AGENT_VERSION
        logger.info("api debug · %s", start_panel())

    use_tray = TRAY_ENABLED and not args.no_tray and sys.platform == "win32"
    if use_tray:
        from tray_app import available, run_tray

        if not available():
            logger.error("pystray/pillow requis : pip install pystray pillow")
            use_tray = False

    stop = threading.Event()

    agent_thread = threading.Thread(
        target=_run_agent_thread,
        args=(ws_url, device_id, stop),
        name="jarvis-agent-ws",
        daemon=True,
    )
    agent_thread.start()
    logger.info("agent · %s", ws_url)

    if use_tray:
        run_tray(on_stop=stop.set, agent_version=AGENT_VERSION)
        stop.set()
        agent_thread.join(timeout=5.0)
        return 0

    try:
        while agent_thread.is_alive():
            time.sleep(1.0)
    except KeyboardInterrupt:
        stop.set()
        agent_thread.join(timeout=5.0)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
