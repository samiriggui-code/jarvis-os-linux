"""Statut Agent-Reach (capability Internet Hermes) — ne merge pas le package dans Core."""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.agent_reach")

PLATFORMS = [
    {"id": "web", "label": "Web / pages", "zero_config": True},
    {"id": "youtube", "label": "YouTube (sous-titres)", "zero_config": True},
    {"id": "rss", "label": "RSS / Atom", "zero_config": True},
    {"id": "exa", "label": "Recherche web (Exa)", "zero_config": False},
    {"id": "github", "label": "GitHub", "zero_config": True},
    {"id": "twitter", "label": "X / Twitter", "zero_config": False},
    {"id": "reddit", "label": "Reddit", "zero_config": False},
    {"id": "bilibili", "label": "Bilibili", "zero_config": True},
]


def config_path() -> Path:
    return Path.home() / ".agent-reach" / "config.yaml"


def status() -> dict[str, Any]:
    cli = shutil.which("agent-reach")
    cfg = config_path()
    out: dict[str, Any] = {
        "ok": True,
        "installed": bool(cli),
        "cli_path": cli,
        "config_exists": cfg.is_file(),
        "config_path": str(cfg),
        "platforms": PLATFORMS,
        "doctor": None,
        "hint": None,
        "skill": "deploy/hermes/skills/agent-reach",
        "vendor": "vendor/Agent-Reach-main",
    }
    if not cli:
        out["hint"] = (
            "pip install -e vendor/Agent-Reach-main && "
            "agent-reach install --env=auto --safe && agent-reach doctor"
        )
        return out

    try:
        proc = subprocess.run(
            [cli, "doctor", "--json"],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
        raw = (proc.stdout or "").strip()
        if raw:
            try:
                out["doctor"] = json.loads(raw)
            except json.JSONDecodeError:
                out["doctor"] = {"raw": raw[:2000], "returncode": proc.returncode}
        else:
            out["doctor"] = {
                "returncode": proc.returncode,
                "stderr": (proc.stderr or "")[:500],
            }
    except Exception as exc:  # noqa: BLE001
        logger.warning("agent-reach doctor: %s", exc)
        out["doctor"] = {"error": str(exc)}
        out["hint"] = "CLI trouvée mais doctor a échoué — voir logs Core."
    return out
