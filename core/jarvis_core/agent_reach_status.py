"""Statut Agent-Reach (capability Internet Hermes) — ne merge pas le package dans Core."""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.agent_reach")

# Amont, épinglé dans core/requirements.txt. Agent-Reach ne vit plus sous
# `vendor/` : c'était un sas d'intégration, pas un lieu d'installation, et le
# venv le chargeait en editable depuis là — vider `vendor/` cassait la
# capability sans que rien ne le signale.
UPSTREAM = "github.com/Panniantong/agent-reach"

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


def _find_cli() -> str | None:
    """Localise `agent-reach`, PATH ou venv courant.

    ⚠ `shutil.which` seul ne suffit pas. Le Core tourne avec le python de son
    venv SANS que celui-ci soit activé — en développement (`.venv/Scripts/python`)
    comme en production (systemd lance `/opt/jarvis/core/.venv/bin/python`).
    Le dossier des exécutables du venv n'est donc pas dans le `PATH`, et un
    outil pourtant installé passait pour absent : « AGENT NETWORK » restait au
    rouge alors que le binaire était là.
    """
    found = shutil.which("agent-reach")
    if found:
        return found

    # Répertoire des exécutables du venv qui fait tourner ce processus.
    import sys

    bindir = Path(sys.executable).parent
    for name in ("agent-reach", "agent-reach.exe"):
        candidate = bindir / name
        if candidate.is_file():
            return str(candidate)
    return None


def status(*, deep: bool = True) -> dict[str, Any]:
    """État de la capability Internet.

    `deep=False` s'arrête à « le CLI est-il là, la config existe-t-elle » et ne
    lance PAS `agent-reach doctor`.

    ⚠ `doctor` interroge en direct GitHub, X, Reddit, Exa… et prend ~8 s
    mesurées. La sonde du superviseur dispose de 5 s : appelée en profondeur,
    elle ne pouvait que dépasser, et « AGENT NETWORK » tombait au rouge avec
    « pas de réponse en 5 s » alors que l'outil était installé et fonctionnel.
    Le vert clignotant observé n'était qu'une course parfois gagnée.

    Surveiller la présence d'une capability n'exige pas de retester le réseau
    mondial toutes les minutes : c'est le rôle de `doctor`, à la demande.
    """
    cli = _find_cli()
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
        "upstream": UPSTREAM,
    }
    if not cli:
        out["hint"] = (
            "pip install -r core/requirements.txt && "
            "agent-reach install --env=auto --safe && agent-reach doctor"
        )
        return out

    if not deep:
        return out

    try:
        proc = subprocess.run(
            [cli, "doctor", "--json"],
            capture_output=True,
            text=True,
            # ⚠ Sans `encoding`, Python décode la sortie avec la page de codes
            # ANSI de Windows (cp1252). Or `doctor` répond en chinois
            # (« GitHub 仓库和代码 ») : le thread lecteur de `subprocess`
            # mourait sur un UnicodeDecodeError, en boucle, à chaque sonde.
            encoding="utf-8",
            errors="replace",
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
