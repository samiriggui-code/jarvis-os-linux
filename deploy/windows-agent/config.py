"""Config agent Windows — %ProgramData%\\JARVIS\\agent.env."""

from __future__ import annotations

import os
from pathlib import Path

ENV_KEYS = (
    "JARVIS_WS_URL",
    "JARVIS_WS_URL_FORCE",
    "JARVIS_AGENT_LABEL",
    "JARVIS_INVENTORY_POLL_S",
    "JARVIS_HEARTBEAT_S",
    "JARVIS_HEARTBEAT_METRICS",
    "JARVIS_AGENT_BOUND_USER_ID",
    "JARVIS_HUD_URL",
    "JARVIS_NUC_HOST",
    "JARVIS_INVENTORY_APPX",
    "JARVIS_WORKSPACE_ROOT",
    "JARVIS_MAIN_LOCAL_PATH",
    "JARVIS_AGENT_DEV_AGENT",
)


def config_dir() -> Path:
    raw = os.environ.get("JARVIS_AGENT_CONFIG_DIR", "").strip()
    if raw:
        return Path(raw)
    program = os.environ.get("ProgramData") or os.environ.get("PROGRAMDATA") or ""
    if program:
        return Path(program) / "JARVIS"
    return Path.home() / ".jarvis"


def agent_dir() -> Path:
    raw = os.environ.get("JARVIS_AGENT_DIR", "").strip()
    if raw:
        return Path(raw)
    return config_dir() / "agent"


def env_file() -> Path:
    return config_dir() / "agent.env"


def load_env_file() -> dict[str, str]:
    path = env_file()
    if not path.is_file():
        return {}
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def save_env_file(values: dict[str, str]) -> Path:
    path = env_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = load_env_file()
    for key, value in values.items():
        text = str(value).strip()
        if key == "JARVIS_WS_URL_FORCE" or text:
            existing[key] = text
    lines = ["# JARVIS Windows agent — auto-generated", ""]
    for key in ENV_KEYS:
        if key in existing:
            lines.append(f"{key}={existing[key]}")
    for key, value in sorted(existing.items()):
        if key in ENV_KEYS or not value:
            continue
        lines.append(f"{key}={value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _windows_user_env(name: str) -> str:
    """Variables User Windows — visibles après redémarrage des apps, pas du process courant."""
    if os.name != "nt":
        return ""
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as key:
            val, _ = winreg.QueryValueEx(key, name)
            return str(val or "").strip()
    except OSError:
        return ""


def _prepend_path(*dirs: Path) -> None:
    existing = os.environ.get("PATH", "")
    parts: list[str] = []
    for d in dirs:
        text = str(d)
        if d.is_dir() and text not in existing.split(os.pathsep):
            parts.append(text)
    if parts:
        os.environ["PATH"] = os.pathsep.join(parts) + os.pathsep + existing


def apply_env_file() -> dict[str, str]:
    loaded = load_env_file()
    for key, value in loaded.items():
        if value and not os.environ.get(key):
            os.environ[key] = value
    if os.name == "nt":
        for key in ("ANTHROPIC_API_KEY", "CURSOR_API_KEY"):
            if not os.environ.get(key, "").strip():
                val = _windows_user_env(key)
                if val:
                    os.environ[key] = val
        local = os.environ.get("LOCALAPPDATA", "").strip()
        appdata = os.environ.get("APPDATA", "").strip()
        _prepend_path(
            Path(local) / "cursor-agent" if local else Path("."),
            Path.home() / ".local" / "bin",
            Path(appdata) / "npm" if appdata else Path("."),
        )
    return loaded
