"""HTTP Memory V2 — Hermes → Core MemoryAPI (loopback).

POST /v1/memory/search | /v1/memory/recall | /v1/memory/store_note
Pas de forget. Pas de mission_result. Pas d'accès PG/JSON/MemPalace.
"""
from __future__ import annotations

from typing import Any

from .service import dispatch

_PATHS = {
    "/v1/memory/search": "search",
    "/v1/memory/recall": "recall",
    "/v1/memory/store_note": "store_note",
}


def handle_http(method: str, path: str, data: dict[str, Any] | None) -> dict[str, Any]:
    norm = (path or "").split("?", 1)[0].rstrip("/") or "/"
    op = _PATHS.get(norm)
    if op is None:
        return {"ok": False, "error": "not found"}
    if method.upper() != "POST":
        return {"ok": False, "error": "POST requis"}
    return dispatch(op, data or {})
