"""Adapters Memory — LocalJson (fallback). PgAdapter (prod). MemPalace = spike M3."""
from __future__ import annotations

from .base import MemoryBackend
from .local_json import LocalJsonAdapter

__all__ = ["MemoryBackend", "LocalJsonAdapter"]
