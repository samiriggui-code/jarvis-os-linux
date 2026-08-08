"""Orchestrateur Core — composition des mixins Phase 1."""
from __future__ import annotations

from .intents.executors import IntentExecutorsMixin
from .intents.executors_hud import HudIntentExecutorsMixin
from .intents.executors_routing import IntentRoutingMixin
from .orchestrator_boot import OrchestratorBootMixin
from .orchestrator_lifecycle import OrchestratorLifecycleMixin
from .orchestrator_session import OrchestratorSessionMixin
from .orchestrator_speech import OrchestratorSpeechMixin
from .ws.handlers.auth import AuthHandlerMixin
from .ws.handlers.chat import ChatHandlerMixin
from .ws.handlers.holomat import HolomatHandlerMixin
from .ws.handlers.surface import SurfaceHandlerMixin
from .ws.handlers.system import SystemHandlerMixin
from .ws.handlers.voice import VoiceHandlerMixin


class Orchestrator(
    OrchestratorLifecycleMixin,
    OrchestratorSpeechMixin,
    OrchestratorBootMixin,
    OrchestratorSessionMixin,
    IntentExecutorsMixin,
    IntentRoutingMixin,
    HudIntentExecutorsMixin,
    AuthHandlerMixin,
    ChatHandlerMixin,
    HolomatHandlerMixin,
    SurfaceHandlerMixin,
    SystemHandlerMixin,
    VoiceHandlerMixin,
):
    """Cerveau : reçoit les events HUD, applique la policy, répond via WS."""
