"""Bibliothèque partagée — protocole WS agent JARVIS (P4)."""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
import platform
import socket
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable

try:
    import websockets
except ImportError:
    websockets = None  # type: ignore[assignment]

DEFAULT_WS = os.environ.get("JARVIS_WS_URL", "ws://127.0.0.1:8765")

# Même logger que windows_agent.py — un seul flux, vocabulaire de phase fixe
# (grep-able) : CONNECTING/CONNECTED/REGISTER/INVENTORY/DISCONNECTED.
# RECONNECT/BACKOFF/PROCESS START/STOPPING vivent côté windows_agent.py (boucle
# de reconnexion, hors de cette fonction).
logger = logging.getLogger("jarvis.win.agent")


@dataclass(frozen=True)
class SoftwareCapability:
    app_id: str
    display_name: str
    metadata: dict[str, Any] = field(default_factory=dict)


def machine_fingerprint() -> str:
    raw = "|".join(
        [
            platform.system(),
            platform.release(),
            socket.gethostname().lower(),
            os.environ.get("USERNAME") or os.environ.get("USER") or "",
        ]
    )
    return f"sha256:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def load_or_create_device_id(path: Path, *, prefix: str = "win-agent") -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file():
        stored = path.read_text(encoding="utf-8").strip()
        if stored:
            return stored
    device_id = f"{prefix}-{uuid.uuid4().hex[:12]}"
    path.write_text(device_id, encoding="utf-8")
    return device_id


def build_register(
    device_id: str,
    *,
    runtime_kind: str,
    label: str,
    agent_version: str,
    device_mode: str = "personal",
    bound_user_id: str = "",
) -> dict[str, Any]:
    bound = str(
        bound_user_id or os.environ.get("JARVIS_AGENT_BOUND_USER_ID") or ""
    ).strip()
    return {
        "type": "device",
        "action": "register",
        "device_id": device_id,
        "device_type": "pc_client",
        "runtime_kind": runtime_kind,
        "label": label,
        "device_mode": device_mode,
        "bound_user_id": bound,
        "metadata": {
            "platform": platform.system().lower(),
            "platform_version": platform.version(),
            "hostname": socket.gethostname(),
            "agent_version": agent_version,
            "machine_fingerprint": machine_fingerprint(),
            "session_user": os.environ.get("USERNAME") or os.environ.get("USER") or "",
        },
    }


def build_capabilities(device_id: str, apps: Iterable[SoftwareCapability]) -> dict[str, Any]:
    app_list = list(apps)
    allowed = [a.app_id for a in app_list]
    caps: list[dict[str, Any]] = [
        {
            "capability_id": "app.launch",
            "value": True,
            "metadata": {"allowed_apps": allowed},
        },
    ]
    for app in app_list:
        meta = {"display_name": app.display_name, **dict(app.metadata)}
        caps.append(
            {
                "capability_id": f"app.software.{app.app_id}",
                "value": True,
                "metadata": meta,
            }
        )
    return {
        "type": "device",
        "action": "capabilities",
        "device_id": device_id,
        "capabilities": caps,
    }


def execute_result(
    *,
    request_id: str,
    device_id: str,
    ok: bool,
    started: float,
    capability_id: str = "app.launch",
    summary: str = "",
    error_code: str = "",
    error: str = "",
    result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": "device.execute_result",
        "request_id": request_id,
        "device_id": device_id,
        "ok": ok,
        "capability_id": capability_id,
        "status": "success" if ok else "failed",
        "duration_ms": int((time.monotonic() - started) * 1000),
    }
    if summary:
        payload["summary"] = summary
    if error_code:
        payload["error_code"] = error_code
    if error:
        payload["error"] = error
    if result:
        payload["result"] = result
    return payload


ExecuteHandler = Callable[
    [Any, dict[str, Any], set[str]],
    Awaitable[dict[str, Any]],
]

CapabilitiesFactory = Callable[[], list[dict[str, Any]] | tuple[list[dict[str, Any]], bool]]


async def run_agent_session(
    uri: str,
    *,
    device_id: str,
    runtime_kind: str,
    label: str,
    agent_version: str,
    handle_execute: ExecuteHandler,
    apps: Iterable[SoftwareCapability] | None = None,
    capabilities_factory: CapabilitiesFactory | None = None,
    heartbeat_s: float = 30.0,
    inventory_poll_s: float = 0.0,
    inventory_refresh_s: float = 0.0,
    stop: Any | None = None,
    on_connected: Callable[[], None] | None = None,
    extra_handlers: dict[str, Callable[[Any, dict[str, Any], set[str]], Awaitable[dict[str, Any] | None]]] | None = None,
) -> None:
    if websockets is None:
        raise RuntimeError("pip install websockets")

    import asyncio

    stop = stop or asyncio.Event()
    app_list = list(apps or [])

    def _allowed_from_caps(caps: list[dict[str, Any]]) -> set[str]:
        for raw in caps:
            if str(raw.get("capability_id") or "") != "app.launch":
                continue
            meta = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
            allowed_raw = meta.get("allowed_apps")
            if isinstance(allowed_raw, list):
                return {str(x).strip().lower() for x in allowed_raw if str(x).strip()}
        return {a.app_id for a in app_list}

    async def _call_factory() -> tuple[list[dict[str, Any]], bool]:
        if capabilities_factory is None:
            caps = build_capabilities(device_id, app_list)
            return caps.get("capabilities", []) if isinstance(caps, dict) else [], True
        # Scan synchrone potentiellement long (registre/AppX/Program Files) —
        # à exécuter hors de la boucle asyncio pour ne pas rater les pings
        # keepalive du Core pendant le scan (cause du crash-reconnect en boucle).
        raw = await asyncio.to_thread(capabilities_factory)
        if isinstance(raw, tuple):
            caps, changed = raw
            return list(caps), bool(changed)
        return list(raw), True

    def _capabilities_message(caps: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "type": "device",
            "action": "capabilities",
            "device_id": device_id,
            "capabilities": caps,
        }

    async def _send_json(ws_conn: Any, payload: dict[str, Any], *, action: str = "") -> None:
        from runtime import record_caps, record_metrics, record_send

        raw = json.dumps(payload)
        await ws_conn.send(raw)
        record_send(raw, action=action or str(payload.get("action") or payload.get("type") or ""))
        if payload.get("action") == "capabilities":
            caps = payload.get("capabilities")
            if isinstance(caps, list):
                record_caps(len(caps))
                for c in caps:
                    if isinstance(c, dict) and c.get("capability_id") == "system.metrics":
                        meta = c.get("metadata") if isinstance(c.get("metadata"), dict) else {}
                        record_metrics(meta)

    async def _send_capabilities(ws_conn: Any, caps: list[dict[str, Any]]) -> set[str]:
        # Envoyer d'abord les caps « système », puis les app.software.* par lots
        # (évite un frame WS unique trop gros via nginx).
        base = [c for c in caps if not str(c.get("capability_id") or "").startswith("app.software.")]
        soft = [c for c in caps if str(c.get("capability_id") or "").startswith("app.software.")]
        await _send_json(ws_conn, _capabilities_message(base), action="capabilities")
        chunk = 40
        for i in range(0, len(soft), chunk):
            await _send_json(ws_conn, _capabilities_message(soft[i : i + chunk]), action="capabilities")
            await asyncio.sleep(0.05)
        from runtime import record_caps

        record_caps(len(caps))
        return _allowed_from_caps(caps)

    # ping_interval / ping_timeout larges : nginx + inventaire ne doivent pas
    # tuer la socket sur un keepalive trop agressif (défaut libs = 20s).
    # max_size 4 Mo : inventaire logiciel ~0.1–1 Mo typique.
    connect_kwargs: dict[str, Any] = {
        "open_timeout": 15,
        "max_size": 4 * 1024 * 1024,
        "ping_interval": 30,
        "ping_timeout": 120,
        "close_timeout": 5,
    }

    logger.info("CONNECTING · %s", uri)
    async with websockets.connect(uri, **connect_kwargs) as ws:
        from runtime import record_recv, set_connected

        logger.info("CONNECTED · %s", uri)
        await _send_json(
            ws,
            build_register(
                device_id,
                runtime_kind=runtime_kind,
                label=label,
                agent_version=agent_version,
            ),
            action="register",
        )

        registered = False
        deadline = time.monotonic() + 8.0
        while not registered and time.monotonic() < deadline and not stop.is_set():
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            record_recv(raw if isinstance(raw, (str, bytes)) else str(raw))
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict) and data.get("type") == "device_registered" and data.get("ok"):
                registered = True

        if not registered:
            raise RuntimeError("device_registered timeout — Core n'a pas ack")

        logger.info("REGISTER ok · device=%s", device_id)
        if on_connected is not None:
            # Connexion confirmée bout-en-bout (pas juste TCP/WS — le Core a
            # ack le register) : le point où l'appelant peut remettre son
            # backoff à zéro sans risquer de "réussir" sur un TCP connect qui
            # ne mène nulle part.
            on_connected()

        caps, _ = await _call_factory()
        allowed = await _send_capabilities(ws, caps)
        set_connected(connected=True, ws_url=uri, device_id=device_id, label=label)

        poll_s = inventory_poll_s or inventory_refresh_s

        async def _heartbeat() -> None:
            import os

            send_metrics = os.environ.get("JARVIS_HEARTBEAT_METRICS", "0").lower() in (
                "1",
                "true",
                "yes",
            )
            while not stop.is_set():
                await asyncio.sleep(heartbeat_s)
                if stop.is_set():
                    break
                try:
                    await _send_json(
                        ws,
                        {
                            "type": "device",
                            "action": "heartbeat",
                            "device_id": device_id,
                            "timestamp": time.time(),
                        },
                        action="heartbeat",
                    )
                    # Opt-in : métriques à chaque beat = spam ↑. Défaut OFF.
                    if send_metrics:
                        try:
                            from metrics import metrics_capability

                            await _send_json(
                                ws,
                                {
                                    "type": "device",
                                    "action": "capabilities",
                                    "device_id": device_id,
                                    "capabilities": [metrics_capability()],
                                },
                                action="capabilities",
                            )
                        except Exception:
                            pass
                except Exception:
                    break

        async def _inventory_poll_loop() -> None:
            nonlocal allowed
            if poll_s <= 0 or capabilities_factory is None:
                return
            first = True
            while not stop.is_set():
                await asyncio.sleep(8.0 if first else poll_s)
                first = False
                if stop.is_set():
                    break
                try:
                    caps, changed = await _call_factory()
                    # Uniquement si inventaire a changé — pas de resend complet inutile
                    if changed:
                        allowed = await _send_capabilities(ws, caps)
                except Exception:
                    break

        hb_task = asyncio.create_task(_heartbeat())
        inv_task = asyncio.create_task(_inventory_poll_loop())
        try:
            async for raw in ws:
                if stop.is_set():
                    break
                record_recv(raw if isinstance(raw, (str, bytes)) else str(raw))
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(data, dict):
                    continue
                if data.get("type") != "device.execute":
                    if extra_handlers and data.get("type") in extra_handlers:
                        reply = await extra_handlers[data["type"]](ws, data, allowed)
                        if reply:
                            await _send_json(ws, reply, action=str(data.get("type", "")))
                    continue
                reply = await handle_execute(ws, data, allowed)
                await _send_json(ws, reply, action="execute_result")
        finally:
            from runtime import set_connected

            set_connected(connected=False, ws_url=uri, device_id=device_id, label=label)
            logger.info("DISCONNECTED · %s · stopping=%s", uri, stop.is_set())
            hb_task.cancel()
            inv_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await hb_task
                await inv_task
            if not stop.is_set():
                raise ConnectionError("websocket session ended")


async def run_collect_tests(cwd: Path, commands: list[str], *, timeout_s: float = 120.0) -> list[dict[str, Any]]:
    """Exécute ``collect_tests`` d'un step Mission DEV — observation machine."""
    import asyncio

    results: list[dict[str, Any]] = []
    preview = 500
    for raw in commands:
        cmd = str(raw or "").strip()
        if not cmd:
            continue
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd,
                cwd=str(cwd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
            results.append(
                {
                    "name": cmd,
                    "exit_code": int(proc.returncode or 0),
                    "stdout_preview": stdout_b[:preview].decode("utf-8", errors="replace"),
                    "stderr_preview": stderr_b[:preview].decode("utf-8", errors="replace"),
                }
            )
        except asyncio.TimeoutError:
            results.append({"name": cmd, "exit_code": 124, "error": "timeout"})
        except Exception as exc:  # noqa: BLE001
            results.append({"name": cmd, "exit_code": 1, "error": str(exc)})
    return results


def validate_workspace_local_path(local_path: str, allowed_roots: list[Path]) -> bool:
    """Windows Agent — ``local_path`` doit rester sous une racine autorisée."""
    if not local_path or not allowed_roots:
        return False
    try:
        resolved = Path(local_path).resolve()
    except OSError:
        return False
    if ".." in Path(local_path).parts:
        return False
    return any(is_path_under(resolved, root.resolve()) for root in allowed_roots)


def is_path_under(child: Path, root: Path) -> bool:
    """Comparaison canonique — rejette sortie de racine."""
    try:
        child.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False
