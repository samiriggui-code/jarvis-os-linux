#!/usr/bin/env python3
"""Smoke NUC — web_extract (Firecrawl) après _apply_hermes_web_extract_nuc.sh."""
from __future__ import annotations

import sys


def main() -> int:
    import asyncio

    from tools.web_tools import _get_extract_backend, check_firecrawl_api_key, web_extract_tool

    backend = _get_extract_backend()
    print("extract_backend:", backend)
    if not check_firecrawl_api_key():
        print("FAIL: Firecrawl non configuré (FIRECRAWL_API_KEY)")
        return 1
    if backend != "firecrawl":
        print(f"FAIL: backend attendu firecrawl, got {backend!r}")
        return 1

    async def _run() -> str:
        out = web_extract_tool(["https://example.com"], format="markdown")
        if asyncio.iscoroutine(out):
            out = await out
        return (out or "").strip()

    text = asyncio.run(_run())
    if len(text) < 40:
        print("FAIL: extract trop court:", repr(text[:120]))
        return 1
    print("OK web_extract:", text[:180].replace("\n", " "))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
