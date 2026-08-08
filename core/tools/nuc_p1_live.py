#!/usr/bin/env python3
"""Tests P1 live contre le NUC — sans sync, sans HUD.

Usage:
  python tools/nuc_p1_live.py
  JARVIS_CORE_WS=ws://192.168.1.37:8080/ws python tools/nuc_p1_live.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from typing import Any

WS = os.environ.get("JARVIS_CORE_WS", "wss://jarvis.global-it-ss.com/ws")
TEST_USER = os.environ.get("JARVIS_TEST_USER", "samir")
TEST_PIN = os.environ.get("JARVIS_TEST_PIN", "").strip()

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def ok(label: str, cond: bool, detail: str = "") -> None:
    mark = "PASS" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"[{mark}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


async def recv_batch(ws: Any, timeout: float) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=max(0.1, deadline - time.monotonic()))
        except asyncio.TimeoutError:
            break
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            out.append(data)
    return out


def pick(msgs: list[dict[str, Any]], *types: str) -> list[dict[str, Any]]:
    return [m for m in msgs if m.get("type") in types]


async def run() -> int:
    try:
        import websockets
    except ImportError:
        print("pip install websockets", file=sys.stderr)
        return 2

    print(f"NUC live P1 · {WS}\n")

    async with websockets.connect(WS, open_timeout=15, max_size=8 * 1024 * 1024) as ws:
        try:
            await asyncio.wait_for(ws.recv(), timeout=1.0)
        except asyncio.TimeoutError:
            pass

        logged_in = False
        if TEST_PIN:
            print(f">> auth login · {TEST_USER}")
            await ws.send(json.dumps({
                "type": "auth",
                "action": "login",
                "username": TEST_USER,
                "pin": TEST_PIN,
                "method": "pin",
            }))
            auth_msgs = await recv_batch(ws, 8.0)
            login = pick(auth_msgs, "auth_login_result")
            if login and login[-1].get("ok"):
                logged_in = True
                print(f"    session · role={login[-1].get('role', '?')}")
            else:
                err = (login[-1].get("error") if login else "timeout") or "échec"
                print(f"    login échoué · {err}")
        else:
            print(">> auth · skip (JARVIS_TEST_PIN absent — Hermes refusera sans session)")

        # 1 · Hermes via tuile reach (circuit intent → delegate)
        payload = {
            "type": "surface",
            "action": "open",
            "app": "reach",
            "prompt": "En une phrase : est-ce que tu es Hermes et le toolset web répond ?",
        }
        print(">> surface/open reach")
        await ws.send(json.dumps(payload))
        msgs = await recv_batch(ws, 55.0)
        sr = pick(msgs, "surface_result")
        te = pick(msgs, "tool_event")
        ok("reach surface_result", bool(sr), f"n={len(sr)}")
        ok("reach tool_event", len(te) >= 1, f"n={len(te)}")
        if sr:
            last = sr[-1]
            if logged_in:
                ok("reach ok (admin)", last.get("ok") is True, str(last.get("reason") or last)[:120])
            else:
                ok("reach executed (anon)", last.get("executed") is True, str(last)[:120])
        hermes_text = ""
        for m in msgs:
            if m.get("type") == "chat_reply" and m.get("text"):
                hermes_text = str(m["text"])[:200]
        if hermes_text:
            print(f"    chat_reply: {hermes_text[:160]}…")

        # 2 · Chat libre (LLM — pas Hermes sauf env NUC)
        payload = {
            "type": "user_event",
            "event": "chat",
            "text": "Réponds en 5 mots maximum : Core NUC en ligne.",
        }
        print("\n>> chat libre (LLM)")
        await ws.send(json.dumps(payload))
        msgs = await recv_batch(ws, 35.0)
        replies = pick(msgs, "chat_reply")
        ok("chat_reply reçu", bool(replies), f"n={len(replies)}")
        if replies:
            print(f"    texte: {str(replies[-1].get('text', ''))[:120]}")

        # 3 · Mission DEV (Core actuel sur NUC)
        payload = {
            "type": "mission_dev",
            "action": "start",
            "project_name": "nuc-p1-smoke",
            "scenario": "cursor",
        }
        print("\n>> mission_dev start")
        await ws.send(json.dumps(payload))
        msgs = await recv_batch(ws, 25.0)
        started = pick(msgs, "mission_dev_started")
        progress = pick(msgs, "mission_dev_progress")
        ok("mission_dev_started", bool(started))
        ok("mission_dev_progress", len(progress) >= 1, f"steps={len(progress)}")
        hermes_step = [m for m in progress if m.get("step_id") == "hermes"]
        if hermes_step:
            log = str(hermes_step[-1].get("log") or "")
            print(f"    hermes step log: {log[:120]}")
            ok("hermes step présent", True, log[:80])

        # abort pour ne pas laisser tourner
        await ws.send(json.dumps({"type": "mission_dev", "action": "abort"}))
        await recv_batch(ws, 3.0)

    print("\nNUC live P1 : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
