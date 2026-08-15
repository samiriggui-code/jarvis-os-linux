"""Statut agent + Core pour le panneau config local."""

from __future__ import annotations

import json
import os
import socket
import time
from pathlib import Path
from typing import Any

from config import agent_dir, config_dir, env_file, load_env_file
from discover import discover_core, probe_all
from runtime import reset_telemetry, snapshot

# Chrome bloque caméra/micro hors contexte sécurisé — toujours ouvrir le FQDN HTTPS.
HUD_BROWSER_URL = "https://jarvis.global-it-ss.com"

AUTOMATIONS_DEFAULT: dict[str, Any] = {
    "rediscover_on_disconnect": False,
    "inventory_on_change_only": True,
    "heartbeat_metrics": False,
    "hud_https_only": True,
    "auto_open_panel_on_start": False,
    "notes": "Agent → Core = push. Core → Agent = commandes ciblées uniquement (après fix broadcast 0.5.0).",
}


def automations_path() -> Path:
    return config_dir() / "automations.json"


def load_automations() -> dict[str, Any]:
    path = automations_path()
    out = dict(AUTOMATIONS_DEFAULT)
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                out.update({k: raw[k] for k in AUTOMATIONS_DEFAULT if k in raw})
        except Exception:
            pass
    return out


def save_automations(values: dict[str, Any]) -> dict[str, Any]:
    path = automations_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    current = load_automations()
    for key in AUTOMATIONS_DEFAULT:
        if key in values and key != "notes":
            current[key] = bool(values[key])
    path.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    # Appliquer sur env (redémarrage agent pour heartbeat / poll)
    env_patch: dict[str, str] = {}
    env_patch["JARVIS_HEARTBEAT_METRICS"] = "1" if current.get("heartbeat_metrics") else "0"
    if current.get("hud_https_only"):
        env_patch["JARVIS_HUD_URL"] = HUD_BROWSER_URL
    from config import save_env_file

    save_env_file(env_patch)
    for k, v in env_patch.items():
        os.environ[k] = v
    return {"ok": True, "automations": current, "path": str(path)}


def browser_hud_url(configured: str = "") -> str:
    """URL pour ouvrir le HUD dans le navigateur (jamais http://LAN)."""
    raw = (configured or "").strip()
    if raw.startswith("https://") and "jarvis.global-it-ss.com" in raw:
        return raw.rstrip("/")
    return HUD_BROWSER_URL


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


def _running_basenames() -> set[str]:
    names: set[str] = set()
    try:
        import psutil

        for proc in psutil.process_iter(["name", "exe"]):
            try:
                info = proc.info
                n = str(info.get("name") or "").lower()
                if n:
                    names.add(n)
                    names.add(Path(n).stem.lower())
                exe = str(info.get("exe") or "")
                if exe:
                    names.add(Path(exe).name.lower())
                    names.add(Path(exe).stem.lower())
            except (psutil.Error, OSError, TypeError):
                continue
    except Exception:  # noqa: BLE001
        pass
    return names


def _app_is_running(exe: str, running: set[str]) -> bool:
    if not exe or not running:
        return False
    raw = exe.split(",")[0].strip().strip('"')
    try:
        p = Path(raw)
        return p.name.lower() in running or p.stem.lower() in running
    except Exception:  # noqa: BLE001
        return False


def list_apps(
    *,
    q: str = "",
    launchable_only: bool = False,
    running_only: bool = False,
    limit: int = 400,
) -> dict[str, Any]:
    try:
        from inventory import get_manager

        mgr = get_manager()
        apps = mgr.apps
        if not apps:
            mgr.refresh(force_full=False)
            apps = mgr.apps
        needle = (q or "").strip().lower()
        running = _running_basenames()
        rows: list[dict[str, Any]] = []
        for a in apps:
            is_run = _app_is_running(a.exe, running)
            if launchable_only and not a.launchable:
                continue
            if running_only and not is_run:
                continue
            if needle and needle not in a.display_name.lower() and needle not in a.app_id.lower():
                continue
            rows.append(
                {
                    "app_id": a.app_id,
                    "name": a.display_name,
                    "launchable": a.launchable,
                    "running": is_run,
                    "source": a.source,
                    "exe": a.exe[:160] if a.exe else "",
                    "version": a.version or "",
                    "publisher": a.publisher or "",
                    "icon": f"/api/icon?app_id={a.app_id}" if a.exe else "",
                }
            )
            if len(rows) >= limit:
                break
        return {
            "ok": True,
            "total": len(apps),
            "shown": len(rows),
            "running_matched": sum(1 for r in rows if r.get("running")),
            "apps": rows,
            "fingerprint": mgr._fingerprint,  # noqa: SLF001
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "apps": []}


def _dev_agent_system_caps() -> list[dict[str, Any]]:
    """Caps Mission DEV — absentes de l'inventaire apps."""
    try:
        from dev_agent_cli import RealDevAgentRunner

        runner = RealDevAgentRunner(device_id="")
        out: list[dict[str, Any]] = []
        for cap in runner.dev_capabilities():
            meta = dict(cap.get("metadata") or {})
            meta["status"] = "implemented" if cap.get("value") else "unavailable"
            cid = str(cap.get("capability_id") or "")
            out.append(
                {
                    "capability_id": cid,
                    "name": cid.replace("dev.agent.", "") or cid,
                    "value": cap.get("value"),
                    "metadata": meta,
                }
            )
        return out
    except Exception:  # noqa: BLE001
        return []


def list_workspaces() -> dict[str, Any]:
    """Workspaces Mission DEV — env + bindings locaux."""
    from config import apply_env_file, load_env_file
    from workspace_local import bindings_file, ensure_default_bindings, workspace_root

    apply_env_file()
    cfg = load_env_file()
    bindings = ensure_default_bindings()
    rows = [{"workspace_id": k, "local_path": v} for k, v in sorted(bindings.items())]
    return {
        "ok": True,
        "workspace_root": str(workspace_root()),
        "config": {
            "JARVIS_WORKSPACE_ROOT": cfg.get("JARVIS_WORKSPACE_ROOT", ""),
            "JARVIS_MAIN_LOCAL_PATH": cfg.get("JARVIS_MAIN_LOCAL_PATH", ""),
            "JARVIS_AGENT_DEV_AGENT": cfg.get("JARVIS_AGENT_DEV_AGENT", "1"),
        },
        "bindings": rows,
        "bindings_path": str(bindings_file()),
        "dev_capabilities": _dev_agent_system_caps(),
    }


def save_workspaces(values: dict[str, Any]) -> dict[str, Any]:
    """Persiste racines Laragon + table workspace_id → chemin local."""
    from agent_lib import validate_workspace_local_path
    from config import apply_env_file, save_env_file
    from workspace_local import save_bindings, workspace_root

    env_patch: dict[str, str] = {}
    for key in ("JARVIS_WORKSPACE_ROOT", "JARVIS_MAIN_LOCAL_PATH", "JARVIS_AGENT_DEV_AGENT"):
        if key in values:
            text = str(values[key]).strip()
            if key == "JARVIS_AGENT_DEV_AGENT":
                env_patch[key] = "1" if text.lower() in ("1", "true", "yes", "on") else "0"
            elif text:
                env_patch[key] = text

    if env_patch:
        save_env_file(env_patch)
        apply_env_file()

    bindings_in = values.get("bindings")
    if isinstance(bindings_in, list):
        root = workspace_root()
        allowed: list[Path] = [root]
        main = (
            env_patch.get("JARVIS_MAIN_LOCAL_PATH")
            or os.environ.get("JARVIS_MAIN_LOCAL_PATH", "").strip()
        )
        if main:
            allowed.append(Path(main))
        new_bindings: dict[str, str] = {}
        for row in bindings_in:
            if not isinstance(row, dict):
                continue
            wid = str(row.get("workspace_id") or "").strip()
            lp = str(row.get("local_path") or "").strip()
            if not wid:
                continue
            if not lp:
                return {"ok": False, "error": f"Chemin manquant pour {wid}"}
            if not validate_workspace_local_path(lp, allowed):
                return {
                    "ok": False,
                    "error": f"Chemin refusé pour {wid} (hors {root}) : {lp}",
                }
            new_bindings[wid] = lp
        save_bindings(new_bindings)

    return list_workspaces()


def list_capabilities() -> dict[str, Any]:
    try:
        from inventory import get_manager

        mgr = get_manager()
        if not mgr.apps:
            mgr.refresh(force_full=False)
        caps = mgr.capabilities_payload()
        system = [c for c in caps if not str(c.get("capability_id") or "").startswith("app.software.")]
        software = [c for c in caps if str(c.get("capability_id") or "").startswith("app.software.")]
        by_id = {a.app_id: a for a in mgr.apps}
        running = _running_basenames()
        sample: list[dict[str, Any]] = []
        for c in software[:40]:
            cid = str(c.get("capability_id") or "")
            app_id = cid.replace("app.software.", "", 1)
            meta = c.get("metadata") if isinstance(c.get("metadata"), dict) else {}
            app = by_id.get(app_id)
            exe = (app.exe if app else "") or str(meta.get("exe") or "")
            sample.append(
                {
                    "capability_id": cid,
                    "app_id": app_id,
                    "name": c.get("name") or app_id,
                    "display_name": meta.get("display_name") or (app.display_name if app else app_id),
                    "launchable": bool(c.get("value")),
                    "running": _app_is_running(exe, running),
                    "source": meta.get("source") or (app.source if app else ""),
                    "version": meta.get("version") or (app.version if app else ""),
                    "icon": f"/api/icon?app_id={app_id}" if exe else "",
                }
            )
        system = list(system) + _dev_agent_system_caps()
        return {
            "ok": True,
            "system": system,
            "software_count": len(software),
            "software_sample": sample,
            "total": len(caps),
            "relation": {
                "core": "DeviceRegistry · capabilities push · device.execute",
                "hermes": "Intents via Core Policy — Hermes ne pilote pas Windows direct",
                "flow": "USER → Hermes → Intent → Core → Policy → Windows Agent → OS",
            },
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def sync_explanation(runtime: dict[str, Any] | None = None) -> dict[str, Any]:
    """Explique Messages ↑ / ↓ et le modèle push agent."""
    rt = runtime or snapshot()
    recv = int(rt.get("messages_recv") or 0)
    noise = int(rt.get("recv_noise") or 0)
    cmds = int(rt.get("recv_commands") or 0)
    acks = int(rt.get("recv_acks") or 0)
    return {
        "model": "push",
        "direction": "Agent → Core (inventaire, heartbeat, execute_result). Core → Agent (commandes ciblées).",
        "messages_down_explained": (
            "Avant 0.5.0, le Core broadcastait tout le HUD (chat, surfaces, TTS) "
            "à tous les WebSocket — y compris l’agent. D’où des milliers de Messages ↓ inutiles. "
            "Corrigé : broadcast HUD exclut les sockets device."
        ),
        "counts": {
            "recv_total": recv,
            "recv_noise_hud_broadcast": noise,
            "recv_commands_execute": cmds,
            "recv_acks": acks,
            "sent_total": int(rt.get("messages_sent") or 0),
            "sent_by_action": rt.get("sent_by_action") or {},
            "recv_by_type": dict(list((rt.get("recv_by_type") or {}).items())[:25]),
        },
        "efficiency": [
            "Caps inventaire : push seulement si fingerprint changé",
            "Métriques heartbeat : OFF par défaut (JARVIS_HEARTBEAT_METRICS=1 pour activer)",
            "HUD navigateur : HTTPS FQDN (caméra/micro Chrome)",
        ],
    }


def clear_cache(*, inventory: bool = True, telemetry: bool = True, logs: bool = False) -> dict[str, Any]:
    cleared: list[str] = []
    if telemetry:
        reset_telemetry()
        cleared.append("telemetry")
    if inventory:
        try:
            from inventory import get_manager

            mgr = get_manager()
            mgr._apps = []  # noqa: SLF001
            mgr._fingerprint = ""  # noqa: SLF001
            mgr._full_counter = 0  # noqa: SLF001
            mgr.last_diff = None
            cleared.append("inventory_memory")
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"inventory: {exc}", "cleared": cleared}
    if logs:
        log_dir = config_dir() / "logs"
        for name in ("agent.out.log", "agent.err.log"):
            p = log_dir / name
            if p.is_file():
                p.write_text("", encoding="utf-8")
                cleared.append(name)
    return {"ok": True, "cleared": cleared, "hint": "Rescan inventaire au prochain poll / refresh manuel"}


def refresh_inventory(*, force_full: bool = True) -> dict[str, Any]:
    try:
        from inventory import get_manager

        changed = get_manager().refresh(force_full=force_full)
        summary = _inventory_summary()
        return {"ok": True, "changed": changed, "inventory": summary}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


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

    metrics = runtime.get("metrics") if isinstance(runtime.get("metrics"), dict) else {}
    if not metrics.get("ok"):
        try:
            from metrics import sample_metrics

            metrics = sample_metrics()
        except Exception:  # noqa: BLE001
            pass

    poll_s = apply.get("JARVIS_INVENTORY_POLL_S") or os.environ.get("JARVIS_INVENTORY_POLL_S", "45")
    hb_s = apply.get("JARVIS_HEARTBEAT_S") or os.environ.get("JARVIS_HEARTBEAT_S", "30")

    try:
        from icons import host_snapshot

        host = host_snapshot()
    except Exception as exc:  # noqa: BLE001
        host = {"hostname": socket.gethostname(), "error": str(exc)}

    return {
        "ok": True,
        "hostname": host.get("hostname") or socket.gethostname(),
        "host": host,
        "agent": {
            "version": agent_version,
            "connected": bool(runtime.get("connected")),
            "device_id": runtime.get("device_id") or "",
            "label": runtime.get("label") or apply.get("JARVIS_AGENT_LABEL", ""),
            "ws_url": runtime.get("ws_url") or core_block["ws_url"],
            "since": runtime.get("since") or 0,
            "uptime_s": runtime.get("uptime_s") or 0,
            "last_error": runtime.get("last_error") or "",
            "metrics": metrics,
        },
        "metrics": metrics,
        "telemetry": {
            "messages_sent": runtime.get("messages_sent") or 0,
            "bytes_sent": runtime.get("bytes_sent") or 0,
            "messages_recv": runtime.get("messages_recv") or 0,
            "bytes_recv": runtime.get("bytes_recv") or 0,
            "caps_last_count": runtime.get("caps_last_count") or 0,
            "caps_last_at": runtime.get("caps_last_at") or 0,
            "heartbeat_at": runtime.get("heartbeat_at") or 0,
            "last_action": runtime.get("last_action") or "",
            "last_action_at": runtime.get("last_action_at") or 0,
            "reconnects": runtime.get("reconnects") or 0,
            "uptime_s": runtime.get("uptime_s") or 0,
            "recv_noise": runtime.get("recv_noise") or 0,
            "recv_commands": runtime.get("recv_commands") or 0,
            "recv_acks": runtime.get("recv_acks") or 0,
            "sent_by_action": runtime.get("sent_by_action") or {},
            "recv_by_type": runtime.get("recv_by_type") or {},
        },
        "sync": sync_explanation(runtime),
        "core": core_block,
        "config": apply,
        "config_path": str(env_file()),
        "install_dir": str(agent_dir()),
        "inventory": _inventory_summary(),
        "automations": load_automations(),
        "tuning": {
            "inventory_poll_s": poll_s,
            "heartbeat_s": hb_s,
            "heartbeat_metrics": apply.get("JARVIS_HEARTBEAT_METRICS", "0"),
            "inventory_appx": apply.get("JARVIS_INVENTORY_APPX", os.environ.get("JARVIS_INVENTORY_APPX", "1")),
        },
        "probes": probes,
        "intents": [
            {"id": "health", "title": "Analyser le PC", "description": "CPU · RAM · disque"},
            {"id": "inventory", "title": "Logiciels", "description": "Inventaire apps"},
            {"id": "hud", "title": "Ouvrir HUD", "description": "HTTPS FQDN"},
            {"id": "discover", "title": "Redécouvrir", "description": "Retrouver le Core"},
            {"id": "refresh_inventory", "title": "Rescan inventaire", "description": "Force full scan"},
            {"id": "clear_cache", "title": "Vider cache", "description": "Télémétrie + inventaire mémoire"},
        ],
        "server_time": time.time(),
    }


def run_intent(intent_id: str) -> dict[str, Any]:
    """Intents locaux du mini-dashboard (pas d'exécution Core inventée)."""
    intent = str(intent_id or "").strip().lower()
    st = build_status(include_probes=False)

    if intent == "health":
        met = st.get("metrics") or {}
        if not met.get("ok"):
            return {"ok": False, "error": met.get("error") or "métriques indisponibles"}
        msg = (
            f"CPU {met.get('cpu_percent')}% · "
            f"RAM {met.get('ram_percent')}% · "
            f"Disque {met.get('disk_percent')}%"
        )
        return {"ok": True, "intent": intent, "message": msg, "metrics": met}

    if intent == "inventory":
        inv = st.get("inventory") or {}
        if inv.get("pending"):
            return {"ok": True, "intent": intent, "message": "Inventaire en cours de scan…"}
        msg = f"{inv.get('launchable', 0)} apps lançables / {inv.get('total', 0)} détectées"
        return {"ok": True, "intent": intent, "message": msg, "inventory": inv}

    if intent == "hud":
        configured = (st.get("config") or {}).get("JARVIS_HUD_URL") or (st.get("core") or {}).get("hud_url") or ""
        url = browser_hud_url(str(configured or ""))
        return {
            "ok": True,
            "intent": intent,
            "message": "Ouverture du HUD (HTTPS)…",
            "open_url": url,
        }

    if intent == "discover":
        result = run_discover_save()
        if not result.get("ok"):
            return result
        return {
            "ok": True,
            "intent": intent,
            "message": f"Core trouvé · {result.get('mode_label')} — redémarrez l’agent",
            **result,
        }

    if intent == "refresh_inventory":
        return refresh_inventory(force_full=True)

    if intent == "clear_cache":
        return clear_cache(inventory=True, telemetry=True, logs=False)

    return {"ok": False, "error": f"intent inconnu : {intent}"}


def save_config(values: dict[str, str]) -> dict[str, Any]:
    from config import save_env_file

    allowed = {
        "JARVIS_WS_URL",
        "JARVIS_WS_URL_FORCE",
        "JARVIS_HUD_URL",
        "JARVIS_AGENT_LABEL",
        "JARVIS_INVENTORY_POLL_S",
        "JARVIS_HEARTBEAT_S",
        "JARVIS_HEARTBEAT_METRICS",
        "JARVIS_INVENTORY_APPX",
        "JARVIS_NUC_HOST",
        "JARVIS_AGENT_BOUND_USER_ID",
        "JARVIS_WORKSPACE_ROOT",
        "JARVIS_MAIN_LOCAL_PATH",
        "JARVIS_AGENT_DEV_AGENT",
    }
    clean = {k: str(v).strip() for k, v in values.items() if k in allowed and str(v).strip() != ""}
    for flag in ("JARVIS_WS_URL_FORCE", "JARVIS_HEARTBEAT_METRICS", "JARVIS_INVENTORY_APPX", "JARVIS_AGENT_DEV_AGENT"):
        if flag in values and str(values[flag]).lower() in ("0", "false", "no"):
            clean[flag] = "0"
    if clean.get("JARVIS_HUD_URL", "").startswith("http://"):
        clean["JARVIS_HUD_URL"] = HUD_BROWSER_URL
    path = save_env_file(clean)
    for key, val in clean.items():
        os.environ[key] = val
    return {
        "ok": True,
        "path": str(path),
        "config": load_env_file(),
        "hint": "Heartbeat / poll : redémarrer l’agent pour appliquer",
    }


def run_discover_save() -> dict[str, Any]:
    from config import save_env_file
    from discover import default_label, discover_core

    found = discover_core()
    if found is None:
        return {"ok": False, "error": "Core introuvable"}
    hud = browser_hud_url(found.hud_url)
    save_env_file(
        {
            "JARVIS_WS_URL": found.ws_url,
            "JARVIS_HUD_URL": hud,
            "JARVIS_AGENT_LABEL": default_label(),
        }
    )
    os.environ["JARVIS_WS_URL"] = found.ws_url
    os.environ["JARVIS_HUD_URL"] = hud
    return {
        "ok": True,
        "ws_url": found.ws_url,
        "hud_url": hud,
        "source": found.source,
        "mode_label": _mode_label(found.source),
    }
