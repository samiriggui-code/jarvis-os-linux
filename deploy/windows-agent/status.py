"""Statut agent + Core pour le panneau config local."""

from __future__ import annotations

import os
import socket
from pathlib import Path
from typing import Any

from config import agent_dir, config_dir, env_file, load_env_file
from discover import discover_core, probe_all
from runtime import snapshot


def _mode_label(source: str) -> str:
    s = (source or "").lower()
    if s in ("lan", "bootstrap:lan", "nuc_host"):
        return "LAN maison"
    if s in ("internet", "bootstrap:internet"):
        return "Internet"
    if s in ("local", "bootstrap:local"):
        return "Local / tunnel"
    if s == "env_forced":
        return "Forcé (config)"
    if s == "env_fallback":
        return "Config sauvegardée"
    return source or "inconnu"


def _inventory_summary() -> dict[str, Any]:
    try:
        from inventory import get_manager

        mgr = get_manager()
        apps = mgr.apps
        if not apps:
            return {"total": 0, "launchable": 0, "fingerprint": "", "pending": True}
        caps = mgr.capabilities_payload()
        inv = next((c for c in caps if c.get("capability_id") == "system.inventory"), {})
        meta = inv.get("metadata") if isinstance(inv.get("metadata"), dict) else {}
        return {
            "total": len(apps),
            "launchable": sum(1 for a in apps if a.launchable),
            "fingerprint": meta.get("fingerprint", ""),
        }
    except Exception as exc:  # noqa: BLE001
        return {"total": 0, "launchable": 0, "fingerprint": "", "error": str(exc)}


def build_status(*, agent_version: str = "", include_probes: bool = False) -> dict[str, Any]:
    apply = load_env_file()
    found = discover_core(timeout=1.5)
    runtime = snapshot()
    probes = probe_all(timeout=1.0) if include_probes else []

    core_block: dict[str, Any] = {
        "reachable": found is not None,
        "ws_url": found.ws_url if found else apply.get("JARVIS_WS_URL", ""),
        "hud_url": found.hud_url if found else apply.get("JARVIS_HUD_URL", ""),
        "source": found.source if found else "",
        "mode_label": _mode_label(found.source if found else ""),
        "forced": apply.get("JARVIS_WS_URL_FORCE", "") in ("1", "true", "yes"),
    }

    return {
        "ok": True,
        "hostname": socket.gethostname(),
        "agent": {
            "version": agent_version,
            "connected": bool(runtime.get("connected")),
            "device_id": runtime.get("device_id") or "",
            "label": runtime.get("label") or apply.get("JARVIS_AGENT_LABEL", ""),
            "ws_url": runtime.get("ws_url") or core_block["ws_url"],
            "since": runtime.get("since") or 0,
            "last_error": runtime.get("last_error") or "",
        },
        "core": core_block,
        "config": apply,
        "config_path": str(env_file()),
        "install_dir": str(agent_dir()),
        "inventory": _inventory_summary(),
        "probes": probes,
    }


def save_config(values: dict[str, str]) -> dict[str, Any]:
    from config import save_env_file

    allowed = {
        "JARVIS_WS_URL",
        "JARVIS_WS_URL_FORCE",
        "JARVIS_HUD_URL",
        "JARVIS_AGENT_LABEL",
        "JARVIS_INVENTORY_POLL_S",
        "JARVIS_NUC_HOST",
        "JARVIS_AGENT_BOUND_USER_ID",
    }
    clean = {k: str(v).strip() for k, v in values.items() if k in allowed and str(v).strip()}
    if "JARVIS_WS_URL_FORCE" in values and str(values["JARVIS_WS_URL_FORCE"]).lower() in ("0", "false", "no"):
        clean["JARVIS_WS_URL_FORCE"] = "0"
    path = save_env_file(clean)
    for key, val in clean.items():
        os.environ[key] = val
    return {"ok": True, "path": str(path), "config": load_env_file()}


def run_discover_save() -> dict[str, Any]:
    from discover import default_label, discover_core

    from config import save_env_file

    found = discover_core()
    if found is None:
        return {"ok": False, "error": "Core introuvable"}
    save_env_file(
        {
            "JARVIS_WS_URL": found.ws_url,
            "JARVIS_HUD_URL": found.hud_url,
            "JARVIS_AGENT_LABEL": default_label(),
        }
    )
    os.environ["JARVIS_WS_URL"] = found.ws_url
    os.environ["JARVIS_HUD_URL"] = found.hud_url
    return {
        "ok": True,
        "ws_url": found.ws_url,
        "hud_url": found.hud_url,
        "source": found.source,
        "mode_label": _mode_label(found.source),
    }
