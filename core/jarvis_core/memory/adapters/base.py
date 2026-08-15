"""Contrat backend Memory."""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..types import MemoryRecord, SearchHit


@runtime_checkable
class MemoryBackend(Protocol):
    name: str

    def upsert(self, record: MemoryRecord) -> str: ...

    def get(self, memory_id: str, user_id: str) -> MemoryRecord | None: ...

    def search(
        self,
        query: str,
        user_id: str,
        *,
        kinds: list[str] | None = None,
        wing: str | None = None,
        room: str | None = None,
        limit: int = 20,
        since: str | None = None,
        include_tombstones: bool = False,
    ) -> list[SearchHit]: ...

    def list(
        self,
        user_id: str,
        *,
        kinds: list[str] | None = None,
        wing: str | None = None,
        room: str | None = None,
        limit: int = 100,
        offset: int = 0,
        include_tombstones: bool = False,
    ) -> list[MemoryRecord]: ...

    def delete(self, memory_id: str, user_id: str, *, hard: bool = False) -> bool: ...

    def health(self, user_id: str | None = None) -> dict: ...
