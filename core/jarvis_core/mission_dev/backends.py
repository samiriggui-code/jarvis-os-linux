"""Backends Mission DEV — Claude / Cursor (audit + disponibilité locale).

Règle anti-faux-agent : ``can_speak`` et ``producer`` uniquement si
``probe_*().available`` et réponse réellement reçue.

Audits officiels (2026-08-14) :
  Claude Code CLI ``claude -p`` — SUPPORTED (Anthropic docs)
  Anthropic Messages API + SDK — SUPPORTED (API key payante)
  Cursor CLI ``agent -p`` — SUPPORTED (Cursor docs, CURSOR_API_KEY)
  Abonnement IDE Cursor/Claude ≠ API exploitable par le Core — UNSUPPORTED
"""
from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from enum import Enum
from typing import Any


class BackendKind(str, Enum):
    CLAUDE_API = "claude_api"
    CLAUDE_CODE = "claude_code"
    CURSOR_AGENT = "cursor_agent"


@dataclass(frozen=True)
class BackendProbe:
    kind: BackendKind
    available: bool
    command: str | None
    auth_hint: str
    notes: str


def _which(cmd: str) -> str | None:
    return shutil.which(cmd)


def probe_claude_code() -> BackendProbe:
    cmd = _which("claude")
    has_key = bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
    return BackendProbe(
        kind=BackendKind.CLAUDE_CODE,
        available=cmd is not None,
        command=cmd,
        auth_hint="CLI Anthropic + ANTHROPIC_API_KEY pour API directe",
        notes=(
            "Mission DEV pertinent : ``claude -p --output-format json`` headless. "
            "Agent repo — pas simple chat LLM."
            if cmd
            else "CLI ``claude`` absente du PATH sur cette machine."
        ),
    )


def probe_claude_api() -> BackendProbe:
    has_key = bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
    return BackendProbe(
        kind=BackendKind.CLAUDE_API,
        available=has_key,
        command=None,
        auth_hint="ANTHROPIC_API_KEY (API payante, distincte abonnement IDE)",
        notes="Modèle LLM seul — pas d'accès repo natif comme Claude Code.",
    )


def probe_cursor_agent() -> BackendProbe:
    cmd = _which("agent") or _which("cursor")
    has_key = bool(os.environ.get("CURSOR_API_KEY", "").strip())
    return BackendProbe(
        kind=BackendKind.CURSOR_AGENT,
        available=cmd is not None and has_key,
        command=cmd,
        auth_hint="Cursor CLI + CURSOR_API_KEY",
        notes=(
            "Mission DEV pertinent : ``agent -p --output-format json`` en cwd projet. "
            "Write soumis aux approbations CLI."
            if cmd
            else "CLI ``agent`` absente du PATH sur cette machine."
        ),
    )


def mission_dev_backend_status() -> list[dict[str, Any]]:
    probes = (probe_claude_code(), probe_claude_api(), probe_cursor_agent())
    return [
        {
            "kind": p.kind.value,
            "available": p.available,
            "command": p.command,
            "auth_hint": p.auth_hint,
            "notes": p.notes,
        }
        for p in probes
    ]


def recommended_claude_path() -> BackendKind | None:
    code = probe_claude_code()
    if code.available:
        return BackendKind.CLAUDE_CODE
    api = probe_claude_api()
    if api.available:
        return BackendKind.CLAUDE_API
    return None


def recommended_cursor_path() -> BackendKind | None:
    cur = probe_cursor_agent()
    if cur.available:
        return BackendKind.CURSOR_AGENT
    return None
