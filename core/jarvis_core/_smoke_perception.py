"""Smoke — PerceptionDispatch (snapshot HUD, sans Hermes ni caméra)."""
from __future__ import annotations

import asyncio
import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


async def main() -> int:
    from jarvis_core.perception_dispatch import PerceptionDispatch, PerceptionTimeout

    disp = PerceptionDispatch()
    sent: list[dict] = []

    async def broadcast(msg: dict) -> None:
        sent.append(msg)

    task = asyncio.create_task(disp.request_snapshot(broadcast, timeout=2.0))
    await asyncio.sleep(0.05)
    assert sent and sent[0].get("action") == "capture_perception", sent
    rid = sent[0]["request_id"]

    ok = disp.complete(rid, {"ok": True, "jpeg_b64": "abc123"})
    assert ok
    result = await task
    assert result["jpeg_b64"] == "abc123"

    disp2 = PerceptionDispatch()
    try:
        await disp2.request_snapshot(broadcast, timeout=0.2)
    except PerceptionTimeout:
        pass
    else:
        print("ÉCHEC — timeout attendu")
        return 1

    print("OK - perception dispatch smoke passed")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
