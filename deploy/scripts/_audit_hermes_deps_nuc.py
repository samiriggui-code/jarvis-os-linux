#!/usr/bin/env python3
"""Audit rapide des deps Hermes / JARVIS sur NUC."""
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

HERMES = Path("/opt/jarvis/hermes-agent")
VENV = HERMES / ".venv" / "bin" / "python"
CORE_VENV = Path("/opt/jarvis/core/.venv/bin/python")

OPTIONAL = [
    ("ddgs", "web search DDGS", "hermes venv"),
    ("firecrawl", "web extract Firecrawl", "pip install firecrawl extra"),
    ("tavily", "web Tavily", "optional"),
    ("exa_py", "web Exa", "pip install exa extra"),
    ("playwright", "browser automation", "playwright install chromium"),
    ("spotipy", "Spotify plugin", "SPOTIFY_* env + plugin"),
    ("honcho", "memory honcho", "optional plugin"),
]


def has_module(name: str, py: Path) -> bool:
    r = subprocess.run(
        [str(py), "-c", f"import {name}"],
        capture_output=True,
        text=True,
    )
    return r.returncode == 0


def main() -> int:
    print("=== HERMES VENV PYTHON ===", VENV.exists())
    print("=== CORE VENV agent-reach ===", has_module("agent_reach", CORE_VENV))

    if VENV.exists():
        r = subprocess.run(
            [str(VENV), "-m", "tools.web_tools"],
            cwd=HERMES,
            capture_output=True,
            text=True,
        )
        for line in (r.stdout + r.stderr).splitlines()[:8]:
            print(line)

    print("\n=== OPTIONAL MODULES (hermes venv) ===")
    for mod, label, note in OPTIONAL:
        ok = has_module(mod.split(".")[0], VENV) if VENV.exists() else False
        print(f"{'OK' if ok else '--'} {mod:16} {label:28} ({note})")

    print("\n=== SKILLS COLLISION ===")
    local = Path("/var/lib/jarvis/hermes/skills")
    seed = Path("/opt/jarvis/seed/deploy/hermes/skills")
    if local.is_dir() and seed.is_dir():
        dup = sorted(set(p.name for p in local.iterdir() if p.is_dir()) & set(
            p.name for p in seed.iterdir() if p.is_dir()
        ))
        print("duplicates:", ", ".join(dup) if dup else "none")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
