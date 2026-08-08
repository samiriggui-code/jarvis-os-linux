"""Config agent Windows — %ProgramData%\\JARVIS\\agent.env."""

from __future__ import annotations

import os
from pathlib import Path

ENV_KEYS = (
    "JARVIS_WS_URL",
    "JARVIS_WS_URL_FORCE",
    "JARVIS_AGENT_LABEL",
    "JARVIS_INVENTORY_POLL_S",
    "JARVIS_AGENT_BOUND_USER_ID",
    "JARVIS_HUD_URL",
    "JARVIS_NUC_HOST",
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


def apply_env_file() -> dict[str, str]:
    loaded = load_env_file()
    for key, value in loaded.items():
        if value and not os.environ.get(key):
            os.environ[key] = value
    return loaded
