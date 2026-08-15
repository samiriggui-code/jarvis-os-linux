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
from typing import Any, Callable

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agent_lib import DEFAULT_WS, execute_result, load_or_create_device_id, run_agent_session
from apps import AppLaunchError, launch
from config import apply_env_file
from dev_agent_cli import CAPABILITY_DEV_AGENT_RUN, RealDevAgentRunner
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
AGENT_VERSION = "0.5.0-windows"
RUNTIME_KIND = "windows_agent"
INVENTORY_POLL_S = float(os.environ.get("JARVIS_INVENTORY_POLL_S", "45"))
TRAY_ENABLED = os.environ.get("JARVIS_AGENT_TRAY", "1").lower() in ("1", "true", "yes")
# Mini-dashboard glass local — ON par défaut (tray → tableau de bord).
PANEL_ENABLED = os.environ.get("JARVIS_AGENT_PANEL", "1").lower() in ("1", "true", "yes")
# P5 — dev.agent.run réel (Claude/Cursor CLI). Kill-switch local si besoin.
DEV_AGENT_ENABLED = os.environ.get("JARVIS_AGENT_DEV_AGENT", "1").lower() in ("1", "true", "yes")

_dev_agent_runner: RealDevAgentRunner | None = None


def get_dev_agent_runner() -> RealDevAgentRunner | None:
    global _dev_agent_runner
    if not DEV_AGENT_ENABLED:
        return None
    if _dev_agent_runner is None:
        _dev_agent_runner = RealDevAgentRunner(device_id="")
    return _dev_agent_runner


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
    cap_id = str(data.get("capability_id") or "app.launch")

    if cap_id == CAPABILITY_DEV_AGENT_RUN:
        runner = get_dev_agent_runner()
        if runner is None:
            return execute_result(
                request_id=request_id,
                device_id=device_id,
                ok=False,
                started=started,
                capability_id=cap_id,
                error_code="dev_agent_disabled",
                error="dev.agent.run désactivé sur ce device (JARVIS_AGENT_DEV_AGENT=0)",
            )
        return await runner.handle_start(ws, data, allowed)

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
    caps, changed_flag = mgr.capabilities_payload(), changed
    runner = get_dev_agent_runner()
    if runner is not None:
        caps = list(caps) + runner.dev_capabilities()
    return caps, changed_flag


def _slim_boot_capabilities() -> list[dict]:
    """Caps immédiates post-register — sans attendre le scan 90s."""
    try:
        from metrics import metrics_capability

        metrics_cap = metrics_capability()
    except Exception:  # noqa: BLE001
        metrics_cap = {
            "capability_id": "system.metrics",
            "name": "metrics",
            "value": False,
            "metadata": {"ok": False, "error": "pending"},
        }
    return [
        {
            "capability_id": "system.inventory",
            "name": "inventory",
            "value": True,
            "metadata": {
                "total_apps": 0,
                "launchable_apps": 0,
                "platform": "windows",
                "status": "scanning",
            },
        },
        metrics_cap,
        {
            "capability_id": "app.launch",
            "name": "app_launch",
            "value": False,
            "metadata": {"allowed_apps": [], "status": "scanning"},
        },
    ]


async def run_agent(
    uri: str,
    *,
    device_id: str | None = None,
    heartbeat_s: float = 30.0,
    stop: asyncio.Event | None = None,
    on_connected: Callable[[], None] | None = None,
) -> None:
    device_id = device_id or load_or_create_device_id(DEVICE_ID_FILE, prefix="pc")

    runner = get_dev_agent_runner()
    if runner is not None:
        runner.device_id = device_id
        try:
            from workspace_local import ensure_default_bindings

            ensure_default_bindings()
        except Exception as exc:  # noqa: BLE001
            logger.warning("workspace_bindings skip : %s", exc)
        env_report = runner.env_report()
        logger.info(
            "DEV.AGENT · ANTHROPIC_API_KEY present=%s · CURSOR_API_KEY present=%s",
            env_report["ANTHROPIC_API_KEY"],
            env_report["CURSOR_API_KEY"],
        )

    # 1) Connecter + register + caps légères D'ABORD (évite ping timeout pendant scan).
    # 2) Scan inventaire en tâche de fond via inventory_poll / premier refresh.
    boot_sent = {"done": False}

    def _factory() -> tuple[list[dict], bool]:
        if not boot_sent["done"]:
            boot_sent["done"] = True
            return _slim_boot_capabilities(), True
        return _capabilities_factory()

    extra_handlers: dict[str, Any] = {}
    if runner is not None:
        extra_handlers["device.run.cancel"] = runner.handle_cancel
        extra_handlers["device.run.status"] = runner.handle_status

    await run_agent_session(
        uri,
        device_id=device_id,
        runtime_kind=RUNTIME_KIND,
        label=default_label(),
        agent_version=AGENT_VERSION,
        handle_execute=_handle_execute,
        capabilities_factory=_factory,
        heartbeat_s=heartbeat_s,
        inventory_poll_s=INVENTORY_POLL_S,
        stop=stop,
        on_connected=on_connected,
        extra_handlers=extra_handlers or None,
    )


async def _inventory_warmup(stop: asyncio.Event) -> None:
    """Scan complet hors chemin critique WS — poussé au prochain poll / reconnect."""
    try:
        await asyncio.to_thread(lambda: get_manager().refresh(force_full=True))
        logger.info("inventaire prêt · %d apps", len(get_manager().apps))
    except Exception as exc:  # noqa: BLE001
        logger.warning("inventaire warmup: %s", exc)


async def _agent_loop(ws_url: str, device_id: str | None, stop: asyncio.Event) -> None:
    backoff = 3.0
    attempt = 0

    def _reset_backoff() -> None:
        # Register ack reçu = connexion confirmée bout-en-bout, pas juste un
        # TCP connect. Sans ce reset, un backoff qui a grimpé une fois (ex.
        # Core indisponible au boot) reste collé à 30s pour TOUT le reste de
        # la vie du process, même des mois plus tard sur un réseau stable —
        # chaque coupure suivante, même courte, mettrait jusqu'à 30s à se
        # reconnecter au lieu de repartir de 3s.
        nonlocal backoff
        if backoff != 3.0:
            logger.info("BACKOFF · reset (connexion confirmée)")
        backoff = 3.0

    # Premier scan en parallèle — ne bloque plus le register.
    warmup = asyncio.create_task(_inventory_warmup(stop))
    while not stop.is_set():
        if attempt > 0:
            logger.info("RECONNECT · tentative #%d", attempt)
        attempt += 1
        try:
            await run_agent(ws_url, device_id=device_id, stop=stop, on_connected=_reset_backoff)
            if stop.is_set():
                break
            logger.warning("session WS terminée — reconnexion dans %.0fs", backoff)
        except asyncio.CancelledError:
            break
        except Exception as exc:  # noqa: BLE001
            if stop.is_set():
                break
            logger.warning("déconnecté : %s — reconnexion dans %.0fs", exc, backoff)
        if stop.is_set():
            break
        logger.info("BACKOFF · %.0fs avant reconnexion", backoff)
        try:
            await asyncio.wait_for(stop.wait(), timeout=backoff)
            break
        except asyncio.TimeoutError:
            pass
        backoff = min(30.0, backoff * 1.5)
    logger.info("STOPPING · agent loop (tentatives=%d)", attempt)
    warmup.cancel()

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
    logger.info("PROCESS START · pid=%d · version=%s", os.getpid(), AGENT_VERSION)
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

    # Mutex AVANT WS / inventaire / tray / panel — garantie anti-cascade process.
    from single_instance import try_acquire

    if not try_acquire():
        logger.error(
            "Agent already running (mutex %s) — exit",
            "Local\\JARVIS_WindowsAgent_SingleInstance",
        )
        return 2

    ws_url = args.url.strip() or resolve_ws_url()

    panel_url = ""
    if PANEL_ENABLED and not args.no_panel:
        from panel_server import start_panel

        os.environ["JARVIS_AGENT_VERSION"] = AGENT_VERSION
        panel_url = start_panel()
        logger.info("dashboard · %s", panel_url)

    use_tray = TRAY_ENABLED and not args.no_tray and sys.platform == "win32"
    if use_tray:
        from tray_app import available, run_tray, set_panel_url

        if not available():
            logger.error("pystray/pillow requis : pip install pystray pillow")
            use_tray = False
        elif panel_url:
            set_panel_url(panel_url)

    stop = threading.Event()

    from agent_restart import bind_lifecycle

    if use_tray:
        from tray_app import stop_tray_icon

        bind_lifecycle(stop=stop, after_stop=stop_tray_icon)
    else:
        bind_lifecycle(stop=stop)

    agent_thread = threading.Thread(
        target=_run_agent_thread,
        args=(ws_url, device_id, stop),
        name="jarvis-agent-ws",
        daemon=True,
    )
    agent_thread.start()
    logger.info("agent · %s", ws_url)

    if use_tray:
        run_tray(on_stop=stop.set, agent_version=AGENT_VERSION, panel_url=panel_url)
        logger.info("STOPPING · process exit (tray quit)")
        stop.set()
        agent_thread.join(timeout=5.0)
        return 0

    try:
        while agent_thread.is_alive():
            time.sleep(1.0)
    except KeyboardInterrupt:
        logger.info("STOPPING · process exit (KeyboardInterrupt)")
        stop.set()
        agent_thread.join(timeout=5.0)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

