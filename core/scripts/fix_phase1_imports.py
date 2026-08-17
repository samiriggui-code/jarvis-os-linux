"""Corrige les imports des fichiers extraits Phase 1."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "jarvis_core"

LIFECYCLE_HEADER = '''"""Phase 1 — lifecycle Orchestrator."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from typing import Any, Callable

from .bus import Bus
from .intents.registry import register_bindings, register_capabilities
from .policy import PolicyEngine, RiskLevel
from .providers import AIProviderManager
from .recovery import RecoveryManager
from .supervisor import DEGRADED, LOADING, READY, Supervisor
from .ws.routes import (
    BOOT_REPLAY_COOLDOWN_S,
    SESSION_SAY_FALLBACKS,
    _ROLE_TITLES,
)

logger = logging.getLogger("jarvis.core")
'''

EXECUTORS_HEADER = '''"""Phase 1 — exécutants d'intentions."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from typing import Any

logger = logging.getLogger("jarvis.core")
'''

HANDLER_HEADER = '''"""Phase 1 — handlers WS."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from typing import Any

logger = logging.getLogger("jarvis.core")
'''


def _replace_header(path: Path, header: str, class_marker: str) -> None:
    text = path.read_text(encoding="utf-8")
    idx = text.index(class_marker)
    path.write_text(header + "\n\n" + text[idx:], encoding="utf-8")


def _fix_inner_imports(text: str, prefix: str) -> str:
    import re

    def repl(match: re.Match[str]) -> str:
        mod = match.group(1)
        if mod.startswith("."):
            return match.group(0)
        return f"from {prefix}{mod}"

    text = re.sub(
        r"from \.(auth\.|capabilities|locale|surface|composer|voice|holomat|"
        r"gestures|supervisor|agent_reach_status|usage|homeassistant|plex|"
        r"tool_events|surface_decision|salon_camera)",
        repl,
        text,
    )
    text = text.replace("from . import memory", f"from {prefix.rstrip('.')} import memory")
    return text


def main() -> None:
    lifecycle = ROOT / "orchestrator_lifecycle.py"
    _replace_header(lifecycle, LIFECYCLE_HEADER, "class OrchestratorLifecycleMixin")
    text = lifecycle.read_text(encoding="utf-8")
    text = text.replace("self._register_bindings()", "register_bindings(self)")
    text = text.replace("self._register_capabilities()", "register_capabilities(self)")
    lifecycle.write_text(text, encoding="utf-8")

    executors = ROOT / "intents" / "executors.py"
    _replace_header(executors, EXECUTORS_HEADER, "class IntentExecutorsMixin")
    text = executors.read_text(encoding="utf-8")
    text = _fix_inner_imports(text, "from ..")
    executors.write_text(text, encoding="utf-8")

    handler_dir = ROOT / "ws" / "handlers"
    for path in handler_dir.glob("*.py"):
        _replace_header(path, HANDLER_HEADER, "class ")
        text = path.read_text(encoding="utf-8")
        text = _fix_inner_imports(text, "from ...")
        path.write_text(text, encoding="utf-8")

    system = handler_dir / "system.py"
    text = system.read_text(encoding="utf-8")
    if "from ...ws.routes import" not in text:
        text = text.replace(
            "logger = logging.getLogger(\"jarvis.core\")",
            'logger = logging.getLogger("jarvis.core")\n\n'
            "from ...policy import RiskLevel\n"
            "from ...ws.routes import PERIPHERAL_DETECT_GROUP_S, ROUTES",
        )
    if "_PERIPHERAL_LINES" not in text.split("class SystemHandlerMixin")[1].split("async def")[0]:
        peripheral = '''
    _PERIPHERAL_LINES = {
        "camera": ("peripheral_camera_missing", "peripheral_camera_denied",
                   "peripheral_camera_ready", "peripheral_camera_lost"),
        "mic": ("peripheral_mic_missing", "peripheral_mic_denied",
                "peripheral_mic_ready", "peripheral_mic_lost"),
        "audio_out": ("peripheral_audio_out_missing", "peripheral_audio_out_denied",
                      "peripheral_audio_out_ready", "peripheral_audio_out_hdmi_lost"),
    }

'''
        text = text.replace(
            "class SystemHandlerMixin:\n\n    async def handle_device",
            "class SystemHandlerMixin:" + peripheral + "    async def handle_device",
        )
    system.write_text(text, encoding="utf-8")

    chat = handler_dir / "chat.py"
    text = chat.read_text(encoding="utf-8")
    if "_SalonNullWs" not in text.split("logger")[0]:
        text = text.replace(
            'logger = logging.getLogger("jarvis.core")',
            'logger = logging.getLogger("jarvis.core")\n\nfrom ...ws.routes import _SalonNullWs',
        )
    if "from ...policy import RiskLevel" not in text:
        text = text.replace(
            'from ...ws.routes import _SalonNullWs',
            'from ...policy import RiskLevel\nfrom ...ws.routes import _SalonNullWs',
        )
    chat.write_text(text, encoding="utf-8")

    surface = handler_dir / "surface.py"
    text = surface.read_text(encoding="utf-8")
    if "from ...policy import RiskLevel" not in text:
        text = text.replace(
            'logger = logging.getLogger("jarvis.core")',
            'logger = logging.getLogger("jarvis.core")\n\nfrom ...policy import RiskLevel',
        )
    surface.write_text(text, encoding="utf-8")

    print("fix_phase1_imports: OK")


if __name__ == "__main__":
    main()
