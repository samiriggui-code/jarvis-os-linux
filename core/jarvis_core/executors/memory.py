"""Core executors — Memory V2 (M4 Hermes → MemoryAPI)."""
from __future__ import annotations

from typing import Any


class MemoryExecutorsMixin:

    async def _execute_memory_search(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..memory.service import jarvis_memory_search

        return jarvis_memory_search(payload)

    async def _execute_memory_recall(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..memory.service import jarvis_memory_recall

        return jarvis_memory_recall(payload)

    async def _execute_memory_store_note(self, payload: dict[str, Any]) -> dict[str, Any]:
        from ..memory.service import jarvis_memory_store_note

        return jarvis_memory_store_note(payload, writer="hermes")
