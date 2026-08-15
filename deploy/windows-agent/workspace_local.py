"""Résolution locale des workspaces — Windows Agent V2.

Le Core connaît ``workspace_id`` + ``authoritative_device_id``.
Ce module mappe ``workspace_id`` → chemin physique **sur cette machine**.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger("jarvis.win.workspace")

WORKSPACE_JARVIS_MAIN = "jarvis-main"
WORKSPACE_VENDOR_PREFIX = "jarvis-vendor-"
VENDOR_DIR = "vendor"
BINDINGS_FILENAME = "workspace_bindings.json"


def config_dir() -> Path:
    from config import config_dir as _cfg

    return _cfg()


def bindings_file() -> Path:
    return config_dir() / BINDINGS_FILENAME


def workspace_root() -> Path:
    raw = os.environ.get("JARVIS_WORKSPACE_ROOT", "").strip()
    if raw:
        return Path(raw).resolve()
    default = Path(r"C:\laragon\www")
    return default.resolve() if default.is_dir() else Path.home().resolve()


def git_toplevel(start: Path) -> Path | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=str(start),
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode != 0:
        return None
    top = out.stdout.strip()
    return Path(top).resolve() if top else None


def detect_jarvis_main_path() -> Path | None:
    """Détection locale jarvis-main — sans config Core."""
    env = os.environ.get("JARVIS_MAIN_LOCAL_PATH", "").strip()
    if env:
        p = Path(env).resolve()
        if git_toplevel(p) == p or (p / ".git").exists():
            return p
        logger.warning("JARVIS_MAIN_LOCAL_PATH n'est pas une racine Git : %s", p)
        return None

    root = workspace_root()
    for candidate in sorted(root.iterdir()) if root.is_dir() else []:
        if not candidate.is_dir():
            continue
        top = git_toplevel(candidate)
        if top == candidate.resolve():
            core_pkg = top / "core" / "jarvis_core"
            if core_pkg.is_dir():
                return top
    return None


def load_bindings() -> dict[str, str]:
    path = bindings_file()
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("workspace_bindings illisible : %s", exc)
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        wid = str(k or "").strip()
        lp = str(v or "").strip()
        if wid and lp:
            out[wid] = lp
    return out


def save_bindings(bindings: dict[str, str]) -> Path:
    path = bindings_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bindings, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def ensure_default_bindings() -> dict[str, str]:
    """Auto-seed jarvis-main si absent (premier boot agent)."""
    bindings = load_bindings()
    if WORKSPACE_JARVIS_MAIN not in bindings:
        detected = detect_jarvis_main_path()
        if detected is not None:
            bindings[WORKSPACE_JARVIS_MAIN] = str(detected)
            save_bindings(bindings)
            logger.info("workspace_bindings · jarvis-main → %s", detected)
    return bindings


def resolve_workspace_path(workspace_id: str) -> str:
    """Chemin local pour un workspace_id — lève ValueError si introuvable."""
    wid = str(workspace_id or "").strip()
    if not wid:
        raise ValueError("workspace_id vide")

    bindings = ensure_default_bindings()
    if wid in bindings:
        return str(Path(bindings[wid]).resolve())

    if wid == WORKSPACE_JARVIS_MAIN:
        detected = detect_jarvis_main_path()
        if detected is not None:
            bindings[WORKSPACE_JARVIS_MAIN] = str(detected)
            save_bindings(bindings)
            return str(detected)

    if wid.startswith(WORKSPACE_VENDOR_PREFIX):
        main = bindings.get(WORKSPACE_JARVIS_MAIN) or (
            str(detect_jarvis_main_path()) if detect_jarvis_main_path() else ""
        )
        if main:
            suffix = wid[len(WORKSPACE_VENDOR_PREFIX) :].replace("_", "-")
            vendor = Path(main) / VENDOR_DIR / suffix
            return str(vendor.resolve())

    # projet indépendant : sous workspace_root/<id>
    indep = workspace_root() / wid
    return str(indep.resolve())


def list_workspace_ids() -> list[str]:
    bindings = ensure_default_bindings()
    return sorted(bindings.keys())
