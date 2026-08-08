#!/usr/bin/env python3
"""Client WS minimal — tester le Core sans HUD.

Usage (depuis core/, venv actif) :
  python tools/ws_cli.py ping
  python tools/ws_cli.py auth status
  python tools/ws_cli.py holomat
  python tools/ws_cli.py face verify
  python tools/ws_cli.py chat "bonjour"
  python tools/ws_cli.py supervisor status
  python tools/ws_cli.py usage
  python tools/ws_cli.py reach doctor
  python tools/ws_cli.py send '{"type":"ping"}'

Env : JARVIS_CORE_WS (défaut ws://127.0.0.1:8765)
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

DEFAULT_WS = os.environ.get("JARVIS_CORE_WS", "ws://127.0.0.1:8765")

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _tiny_jpeg_b64() -> str:
    try:
        import cv2
        import numpy as np

        img = np.full((96, 96, 3), 48, dtype=np.uint8)
        ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if not ok:
            raise RuntimeError("imencode failed")
        return base64.b64encode(buf.tobytes()).decode("ascii")
    except Exception:
        raw = bytes(
            [
                0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
                0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
                0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
                0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
                0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
                0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
                0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
                0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
                0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
                0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
                0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
                0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
                0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
                0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
                0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
                0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
                0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
                0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
                0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
                0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
                0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
                0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
                0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
                0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
                0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
                0x00, 0x00, 0x3F, 0x00, 0x7F, 0x46, 0x80, 0x3F, 0xFF, 0xD9,
            ]
        )
        return base64.b64encode(raw).decode("ascii")


def _jpeg_file_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


async def _recv_until(
    ws: Any,
    *,
    timeout: float,
    types: set[str] | None = None,
    drain: float = 0.0,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            raw = await asyncio.wait_for(
                ws.recv(), timeout=max(0.05, deadline - time.monotonic())
            )
        except asyncio.TimeoutError:
            if drain and out:
                break
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            print(raw[:200])
            continue
        if isinstance(data, dict):
            out.append(data)
            if types and data.get("type") in types:
                break
    return out


async def _call(uri: str, payload: dict[str, Any], *, wait_s: float = 5.0) -> int:
    try:
        import websockets
    except ImportError:
        print("pip install websockets", file=sys.stderr)
        return 2

    print(f"> {json.dumps(payload, ensure_ascii=False)}")
    async with websockets.connect(uri, open_timeout=8, max_size=8 * 1024 * 1024) as ws:
        try:
            await asyncio.wait_for(ws.recv(), timeout=0.3)
        except asyncio.TimeoutError:
            pass
        await ws.send(json.dumps(payload))
        replies = await _recv_until(ws, timeout=wait_s, drain=0.4)
        for r in replies:
            print(f"< {json.dumps(r, ensure_ascii=False)[:2000]}")
        if not replies:
            print("< (aucune reponse dans le delai)")
            return 1
    return 0


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Client WS JARVIS Core")
    p.add_argument("--ws", default=DEFAULT_WS, help=f"URL WebSocket (défaut {DEFAULT_WS})")
    p.add_argument("--wait", type=float, default=8.0, help="Timeout réponses (s)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("ping", help="type ping")

    a = sub.add_parser("auth", help="auth status | logout | enroll-member")
    a.add_argument("action", choices=("status", "logout", "enroll-member", "start-enrollment"), default="status", nargs="?")
    a.add_argument("username", nargs="?", help="identifiant membre (enroll-member / start-enrollment)")
    a.add_argument("--display", dest="display_name", help="prénom affiché")
    a.add_argument("--role", default="USER", choices=("USER", "CHILD", "ADMIN"))

    sub.add_parser("holomat", help="holomat status")

    f = sub.add_parser("face", help="face_frame verify (jpeg test ou --image)")
    f.add_argument("mode", choices=("verify",), nargs="?", default="verify")
    f.add_argument("--image", type=Path, help="JPEG avec visage")

    c = sub.add_parser("chat", help="user_event texte")
    c.add_argument("text")

    s = sub.add_parser("supervisor", help="supervisor status|check")
    s.add_argument("action", choices=("status", "check"), nargs="?", default="status")

    sub.add_parser("usage", help="usage dashboard")
    sub.add_parser("reach", help="agent_reach doctor")

    j = sub.add_parser("send", help="JSON brut")
    j.add_argument("json_body")

    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    uri = args.ws

    if args.cmd == "ping":
        payload = {"type": "ping"}
    elif args.cmd == "auth":
        if args.action == "enroll-member":
            if not args.username:
                print("username requis", file=sys.stderr)
                return 2
            payload = {
                "type": "auth",
                "action": "enroll_member",
                "username": args.username,
                "display_name": args.display_name or args.username,
                "role": args.role,
            }
        elif args.action == "start-enrollment":
            payload = {
                "type": "auth",
                "action": "start_enrollment",
                "username": args.username or None,
                "display_name": args.display_name or args.username or None,
                "role": args.role if args.role != "ADMIN" else "USER",
            }
        else:
            payload = {"type": "auth", "action": args.action}
    elif args.cmd == "holomat":
        payload = {"type": "holomat", "action": "status"}
    elif args.cmd == "face":
        jpeg = _jpeg_file_b64(args.image) if args.image else _tiny_jpeg_b64()
        payload = {
            "type": "holomat",
            "action": "face_frame",
            "mode": "verify",
            "jpeg_b64": jpeg,
        }
    elif args.cmd == "chat":
        payload = {"type": "user_event", "text": args.text}
    elif args.cmd == "supervisor":
        payload = {"type": "supervisor", "action": args.action}
    elif args.cmd == "usage":
        payload = {"type": "usage", "granularity": "day"}
    elif args.cmd == "reach":
        payload = {"type": "agent_reach", "action": "doctor"}
    elif args.cmd == "send":
        payload = json.loads(args.json_body)
    else:
        return 2

    return asyncio.run(_call(uri, payload, wait_s=args.wait))


if __name__ == "__main__":
    raise SystemExit(main())
