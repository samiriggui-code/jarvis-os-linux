"""Découverte automatique du Core JARVIS (HTTP probe → URL WebSocket)."""

from __future__ import annotations

import json
import logging
import os
import socket
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger("jarvis.win.discover")

# Ordre : LAN maison d'abord, Internet (Twingate) si absent, tunnel dev en dernier.
# Le portable bascule tout seul selon le réseau (WiFi maison vs bureau).
DEFAULT_CANDIDATES: list[tuple[str, str, str]] = [
    ("ws://192.168.1.37:8080/ws", "http://192.168.1.37:8080/v1/devices", "lan"),
    ("wss://jarvis.global-it-ss.com/ws", "https://jarvis.global-it-ss.com/v1/devices", "internet"),
    ("ws://127.0.0.1:8765", "http://127.0.0.1:8766/health", "local"),
]

AGENT_FILES = (
    "windows_agent.py",
    "agent_lib.py",
    "inventory.py",
    "apps.py",
    "discover.py",
    "config.py",
    "status.py",
    "runtime.py",
    "tray_app.py",
    "panel_server.py",
    "panel.html",
    "requirements.txt",
    "start-agent.ps1",
    "ensure-agent.ps1",
    "open-panel.ps1",
    "bootstrap.json",
)


@dataclass(frozen=True)
class CoreEndpoint:
    ws_url: str
    hud_url: str
    probe_url: str
    source: str = "probe"


def _http_probe(url: str, *, timeout: float = 2.5) -> bool:
    try:
        ctx = ssl.create_default_context()
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "jarvis-win-agent/1.0"})
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            if resp.status != 200:
                return False
            raw = resp.read(4096)
            if not raw:
                return True
            try:
                data = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                return True
            if isinstance(data, dict):
                return bool(data.get("ok", True))
            return True
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.debug("probe fail %s : %s", url, exc)
        return False


def _ws_to_hud(ws_url: str) -> str:
    parsed = urlparse(ws_url)
    scheme = "https" if parsed.scheme == "wss" else "http"
    port = parsed.port
    if port is None:
        port = 443 if scheme == "https" else 80
    host = parsed.hostname or "127.0.0.1"
    if (scheme == "http" and port == 80) or (scheme == "https" and port == 443):
        return f"{scheme}://{host}"
    return f"{scheme}://{host}:{port}"


def _http_base_from_probe(probe_url: str) -> str:
    parsed = urlparse(probe_url)
    scheme = parsed.scheme
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port
    if port is None:
        port = 443 if scheme == "https" else 80
    if (scheme == "http" and port == 80) or (scheme == "https" and port == 443):
        return f"{scheme}://{host}"
    return f"{scheme}://{host}:{port}"


def _fetch_bootstrap(http_base: str) -> dict[str, Any] | None:
    url = f"{http_base.rstrip('/')}/v1/agent/bootstrap.json"
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "jarvis-win-agent/1.0"})
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=2.5, context=ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data if isinstance(data, dict) else None
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None


def _is_private_host(host: str) -> bool:
    h = (host or "").lower()
    if h in ("127.0.0.1", "localhost"):
        return True
    if h.startswith("192.168.") or h.startswith("10."):
        return True
    if h.startswith("172."):
        parts = h.split(".")
        if len(parts) >= 2:
            try:
                second = int(parts[1])
                return 16 <= second <= 31
            except ValueError:
                pass
    return False


def _url_force_env() -> bool:
    return os.environ.get("JARVIS_WS_URL_FORCE", "").lower() in ("1", "true", "yes")


def _endpoint_from_probe(ws_url: str, probe_url: str, *, mode: str) -> CoreEndpoint:
    http_base = _http_base_from_probe(probe_url)
    bootstrap = _fetch_bootstrap(http_base)
    if bootstrap:
        ws = str(bootstrap.get("ws_url") or ws_url).strip()
        hud = str(bootstrap.get("hud_url") or http_base).strip()
        # bootstrap.json NUC = URLs LAN — ne pas les imposer depuis Internet
        if mode == "internet" and _is_private_host(urlparse(ws).hostname or ""):
            ws = ws_url
        if mode == "internet" and _is_private_host(urlparse(hud).hostname or ""):
            hud = http_base
        return CoreEndpoint(ws_url=ws, hud_url=hud, probe_url=probe_url, source=f"bootstrap:{mode}")
    return CoreEndpoint(
        ws_url=ws_url,
        hud_url=http_base,
        probe_url=probe_url,
        source=mode,
    )


def discover_core(*, timeout: float = 2.5) -> CoreEndpoint | None:
    """Probe réseau à chaque appel — LAN prioritaire si joignable."""
    explicit = os.environ.get("JARVIS_WS_URL", "").strip()
    if explicit and _url_force_env():
        return CoreEndpoint(
            ws_url=explicit,
            hud_url=os.environ.get("JARVIS_HUD_URL", "").strip() or _ws_to_hud(explicit),
            probe_url="",
            source="env_forced",
        )

    for ws_url, probe_url, mode in DEFAULT_CANDIDATES:
        if _http_probe(probe_url, timeout=timeout):
            return _endpoint_from_probe(ws_url, probe_url, mode=mode)

    host = os.environ.get("JARVIS_NUC_HOST", "192.168.1.37").strip()
    if host:
        probe = f"http://{host}:8080/v1/devices"
        ws = f"ws://{host}:8080/ws"
        if _http_probe(probe, timeout=timeout):
            return CoreEndpoint(
                ws_url=ws,
                hud_url=f"http://{host}:8080",
                probe_url=probe,
                source="nuc_host",
            )

    if explicit:
        return CoreEndpoint(
            ws_url=explicit,
            hud_url=os.environ.get("JARVIS_HUD_URL", "").strip() or _ws_to_hud(explicit),
            probe_url="",
            source="env_fallback",
        )

    return None


def probe_all(*, timeout: float = 2.0) -> list[dict[str, Any]]:
    """Teste tous les chemins réseau (panneau config)."""
    rows: list[dict[str, Any]] = []
    for ws_url, probe_url, mode in DEFAULT_CANDIDATES:
        rows.append(
            {
                "mode": mode,
                "ws_url": ws_url,
                "probe_url": probe_url,
                "ok": _http_probe(probe_url, timeout=timeout),
            }
        )
    host = os.environ.get("JARVIS_NUC_HOST", "192.168.1.37").strip()
    if host:
        probe = f"http://{host}:8080/v1/devices"
        if not any(r.get("probe_url") == probe for r in rows):
            rows.insert(
                0,
                {
                    "mode": "nuc_host",
                    "ws_url": f"ws://{host}:8080/ws",
                    "probe_url": probe,
                    "ok": _http_probe(probe, timeout=timeout),
                },
            )
    return rows


def resolve_ws_url(*, timeout: float = 2.5, persist: bool = True) -> str:
    from config import load_env_file, save_env_file

    found = discover_core(timeout=timeout)
    if found is None:
        raise RuntimeError(
            "Core JARVIS introuvable. Définissez JARVIS_WS_URL ou vérifiez le LAN / Twingate."
        )
    if persist and found.source != "env_forced":
        prev = load_env_file()
        if prev.get("JARVIS_WS_URL") != found.ws_url:
            save_env_file(
                {
                    "JARVIS_WS_URL": found.ws_url,
                    "JARVIS_HUD_URL": found.hud_url,
                    "JARVIS_AGENT_LABEL": default_label(),
                }
            )
            logger.info("config mise à jour · %s (%s)", found.ws_url, found.source)
    return found.ws_url


def default_label() -> str:
    custom = os.environ.get("JARVIS_AGENT_LABEL", "").strip()
    if custom:
        return custom
    return f"{socket.gethostname()} (Windows)"


def main() -> int:
    import argparse

    from config import save_env_file

    logging.basicConfig(level=logging.INFO, format="[discover] %(message)s")

    parser = argparse.ArgumentParser(description="Découverte Core JARVIS")
    parser.add_argument("--save", action="store_true", help="Écrit agent.env dans ProgramData")
    parser.add_argument("--json", action="store_true", help="Sortie JSON")
    args = parser.parse_args()

    found = discover_core()
    if found is None:
        print("Core introuvable")
        return 1

    label = default_label()
    if args.save:
        save_env_file(
            {
                "JARVIS_WS_URL": found.ws_url,
                "JARVIS_HUD_URL": found.hud_url,
                "JARVIS_AGENT_LABEL": label,
            }
        )

    payload = {
        "ws_url": found.ws_url,
        "hud_url": found.hud_url,
        "label": label,
        "source": found.source,
    }
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(f"Core · {found.ws_url} ({found.source})")
        print(f"HUD  · {found.hud_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
