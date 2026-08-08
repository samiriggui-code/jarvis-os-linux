"""One-shot extractor Phase 1 — decoupe __init__.py en mixins."""
from __future__ import annotations

import ast
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1] / "jarvis_core"
INIT = ROOT / "__init__.py"
lines = INIT.read_text(encoding="utf-8").splitlines(keepends=True)

GROUPS: list[tuple[str, str, list[str]]] = [
    ("intents", "executors.py", "IntentExecutorsMixin", [
        "_execute_home", "_start_kiosk_enrollment", "_execute_hud", "_execute_capabilities",
        "_execute_introspect", "_execute_media_pause", "_say_home", "_execute_video",
        "_say_video", "_open_intent", "_execute_camera_view", "_execute_intent",
        "_maybe_publish_surface_decision", "_on_hermes_agent_event", "_chat_via_capability",
        "_fallback_web_surface", "_try_streaming_platforms", "_publish_result_surface",
        "_surface_component_name", "_surface_guards",
    ]),
    ("ws/handlers", "chat.py", "ChatHandlerMixin", [
        "handle_salon_utterance", "handle_user_chat", "handle_chat",
    ]),
    ("ws/handlers", "auth.py", "AuthHandlerMixin", ["handle_auth", "_session_user_id"]),
    ("ws/handlers", "holomat.py", "HolomatHandlerMixin", ["handle_holomat", "note_camera"]),
    ("ws/handlers", "voice.py", "VoiceHandlerMixin", ["handle_voice"]),
    ("ws/handlers", "surface.py", "SurfaceHandlerMixin", [
        "handle_boot", "_boot_requested", "handle_surface",
    ]),
    ("ws/handlers", "system.py", "SystemHandlerMixin", [
        "handle_device", "handle_peripheral", "handle_gesture", "handle_preferences",
        "handle_memory", "handle_ping", "handle_stop_run", "handle_mission_dev",
        "handle_supervisor", "handle_agent_reach", "handle_usage", "on_message",
    ]),
    ("", "orchestrator_lifecycle.py", "OrchestratorLifecycleMixin", [
        "__init__", "start_background", "_start_salon_ingest", "cmd", "_register_components",
        "_forward_bus", "_degraded_components", "_load_gesture_profile",
        "_apply_gesture_sensitivity", "emit", "_signal_component", "_probe_voice",
        "_load_face", "_probe_agents", "speak", "say", "_send_boot_state",
        "speak_boot_sequence", "_session_role", "_say_context", "broadcast",
        "_maybe_salon_speak",
    ]),
]

tree = ast.parse("".join(lines))
orch = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "Orchestrator")
bounds: dict[str, tuple[int, int]] = {}
for m in orch.body:
    if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)):
        bounds[m.name] = (m.lineno - 1, m.end_lineno)


def extract_method(name: str) -> str:
    start, end = bounds[name]
    out: list[str] = []
    for ln in lines[start:end]:
        out.append(ln[4:] if ln.startswith("    ") else ln)
    return "".join(out)


def header(depth: int) -> str:
    dots = "." * (depth + 1)
    return f'''"""Phase 1 — extrait de jarvis_core/__init__.py."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from typing import Any

from {dots}policy import PolicyEngine, RiskLevel
from {dots}recovery import RecoveryManager
from {dots}supervisor import DEGRADED, LOADING, READY, Supervisor

logger = logging.getLogger("jarvis.core")

'''


for subdir, fname, mixin, methods in GROUPS:
    if subdir == "":
        depth = 1
    elif subdir == "intents":
        depth = 2
    else:
        depth = 3
    path = ROOT / subdir / fname if subdir else ROOT / fname
    path.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(extract_method(m) for m in methods)
    indented = "".join(("    " + ln if ln.strip() else ln) for ln in body.splitlines(keepends=True))
    path.write_text(header(depth) + f"class {mixin}:\n\n{indented}", encoding="utf-8")
    print("wrote", path.relative_to(ROOT.parent))

print("done")
