#!/usr/bin/env python3
"""Lance start_enrollment Inès sur le Core local (WS)."""
import asyncio
import json
import sys

try:
    import websockets
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "websockets"])
    import websockets

URI = "ws://127.0.0.1:8765"
NAME = sys.argv[1] if len(sys.argv) > 1 else "Inès"


async def main() -> None:
    async with websockets.connect(URI, open_timeout=8) as ws:
        await ws.send(json.dumps({
            "type": "auth",
            "action": "start_enrollment",
            "display_name": NAME,
            "username": "ines",
            "role": "USER",
        }))
        # Lire quelques réponses
        for _ in range(8):
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=3)
            except asyncio.TimeoutError:
                break
            data = json.loads(msg)
            t = data.get("type")
            print(t, {k: data.get(k) for k in ("ok", "action", "display_name", "spoken", "reason", "error") if k in data})
            if t in ("auth_enrollment_started", "auth_error", "error"):
                break


if __name__ == "__main__":
    asyncio.run(main())
