#!/usr/bin/env python3
"""Faux Core WS — contrepartie de ``fake_agent.py`` pour tester l'agent réel.

``fake_agent.py`` simule un AGENT parlant à un vrai Core. Ce script fait
l'inverse : il simule le CORE, pour qu'on puisse tester la boucle de
reconnexion d'un vrai ``windows_agent.py`` (down/up répétés, contrôlés,
sans jamais toucher au Core réel du foyer).

Protocole minimal côté serveur — juste ce qu'``agent_lib.py`` attend :
  - ``device`` / ``register``      → répond ``device_registered`` (ok=true)
  - ``device`` / ``capabilities``  → compte les caps reçues (taille = indice
    boot-slim vs poll réel), ne répond rien (le vrai Core non plus)
  - ``device`` / ``heartbeat``     → compte, ne répond rien

Usage (scénario complet, scripté) ::

    python fake_core.py --cycles 3 --up-s 20 --down-s 15

Le serveur alterne up/down ``--cycles`` fois puis quitte en imprimant un
résumé (registrations, push de capabilities par taille, heartbeats).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from typing import Any

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(level=logging.INFO, format="[fake-core] %(message)s")
logger = logging.getLogger("jarvis.fake_core")

try:
    from websockets.asyncio.server import serve
except ImportError:
    print("pip install websockets", file=sys.stderr)
    raise SystemExit(1)


class Stats:
    def __init__(self) -> None:
        self.connections = 0
        self.registers = 0
        self.heartbeats = 0
        self.caps_pushes: list[int] = []  # taille (nb de caps) de chaque push
        self.device_ids: set[str] = set()
        self.agent_versions: set[str] = set()

    def summary(self) -> str:
        lines = [
            "",
            "=== fake_core résumé ===",
            f"connexions WS acceptées : {self.connections}",
            f"register OK             : {self.registers}",
            f"heartbeats reçus        : {self.heartbeats}",
            f"capabilities pushes     : {len(self.caps_pushes)} · tailles={self.caps_pushes}",
            f"device_id(s) vu(s)      : {sorted(self.device_ids)}",
            f"agent_version(s) vu(s)  : {sorted(self.agent_versions)}",
        ]
        return "\n".join(lines)


async def _handler(ws: Any, stats: Stats) -> None:
    stats.connections += 1
    peer = getattr(ws, "remote_address", "?")
    logger.info("+ connexion #%d · %s", stats.connections, peer)
    try:
        async for raw in ws:
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(data, dict):
                continue
            t = data.get("type")
            action = data.get("action")
            if t == "device" and action == "register":
                device_id = str(data.get("device_id") or "")
                meta = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
                stats.device_ids.add(device_id)
                if meta.get("agent_version"):
                    stats.agent_versions.add(str(meta["agent_version"]))
                stats.registers += 1
                logger.info(
                    "  REGISTER device=%s version=%s",
                    device_id,
                    meta.get("agent_version", "?"),
                )
                await ws.send(json.dumps({"type": "device_registered", "ok": True, "device_id": device_id}))
            elif t == "device" and action == "capabilities":
                caps = data.get("capabilities")
                n = len(caps) if isinstance(caps, list) else 0
                stats.caps_pushes.append(n)
                logger.info("  CAPABILITIES push · %d entrées", n)
            elif t == "device" and action == "heartbeat":
                stats.heartbeats += 1
                logger.info("  HEARTBEAT #%d", stats.heartbeats)
            else:
                logger.info("  (ignoré) type=%s action=%s", t, action)
    except Exception as exc:  # noqa: BLE001
        logger.info("- connexion perdue · %s", exc)
    finally:
        logger.info("- connexion fermée · %s", peer)


async def run(*, host: str, port: int, cycles: int, up_s: float, down_s: float) -> Stats:
    stats = Stats()

    async def handler(ws: Any) -> None:
        await _handler(ws, stats)

    for cycle in range(1, cycles + 1):
        logger.info("=== CYCLE %d/%d · UP %.0fs (ws://%s:%d) ===", cycle, cycles, up_s, host, port)
        async with serve(handler, host, port):
            await asyncio.sleep(up_s)
        logger.info("=== CYCLE %d/%d · DOWN %.0fs (port fermé — Core injoignable) ===", cycle, cycles, down_s)
        await asyncio.sleep(down_s)

    logger.info(stats.summary())
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Faux Core WS — test reconnexion agent Windows")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18765)
    parser.add_argument("--cycles", type=int, default=3, help="nb de cycles up/down")
    parser.add_argument("--up-s", type=float, default=20.0, help="durée serveur up (s)")
    parser.add_argument("--down-s", type=float, default=15.0, help="durée serveur down (s)")
    args = parser.parse_args()

    started = time.time()
    asyncio.run(run(host=args.host, port=args.port, cycles=args.cycles, up_s=args.up_s, down_s=args.down_s))
    logger.info("terminé en %.0fs", time.time() - started)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
