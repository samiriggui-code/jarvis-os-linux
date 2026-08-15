#!/usr/bin/env python3
"""Smoke: Hermes tool-calling — vérifie qu'un modèle appelle web_search (pas hallucination)."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

URL = (os.environ.get("JARVIS_HERMES_URL") or "http://127.0.0.1:8642").rstrip("/")
KEY = os.environ.get("JARVIS_HERMES_KEY") or os.environ.get("API_SERVER_KEY") or ""
PROMPT = (
    "Quelle est la météo à Paris aujourd'hui ? "
    "Utilise web_search pour obtenir des données réelles. Ne réponds pas sans avoir cherché."
)

MODELS = [
    ("qwen", "qwen/qwen3.5-flash-02-23"),
    ("gpt4o-mini", "openai/gpt-4o-mini"),
    ("haiku", "anthropic/claude-3-5-haiku"),
]


def auth_headers(*, content_type: bool = False) -> dict[str, str]:
    h = {"Authorization": f"Bearer {KEY}"}
    if content_type:
        h["Content-Type"] = "application/json"
    return h


def summarize(
    label: str,
    model: str,
    run_id: str,
    tool_events: list[dict],
    final_output: str,
    run_meta: dict,
) -> dict:
    text = (final_output or "")[:500]
    looks_fake = any(
        m in text.lower()
        for m in ("hermes execute", "web_search(query", 'web_search(')
    )
    return {
        "label": label,
        "model": model,
        "run_id": run_id,
        "tool_event_count": len(tool_events),
        "tool_events": tool_events[:8],
        "output_preview": text.replace("\n", " ")[:320],
        "looks_fake_tool_syntax_in_output": looks_fake,
        "run_meta": {k: run_meta.get(k) for k in ("event", "status", "usage") if k in run_meta},
    }


def run_test(label: str, model: str) -> dict:
    body = {
        "input": PROMPT,
        "instructions": "[test tool-calling] Tu DOIS appeler web_search avant de répondre.",
        "provider": "openrouter",
        "model": model,
    }
    req = urllib.request.Request(
        f"{URL}/v1/runs",
        data=json.dumps(body).encode(),
        method="POST",
        headers=auth_headers(content_type=True),
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            started = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read()[:300].decode("utf-8", errors="replace")
        return {"label": label, "model": model, "error": f"start HTTP {exc.code}: {detail}"}

    run_id = str(started.get("run_id") or "")
    if not run_id:
        return {"label": label, "model": model, "error": "no run_id"}

    tool_events: list[dict] = []
    final_output = ""
    run_meta: dict = {}
    deadline = time.time() + 90

    req2 = urllib.request.Request(
        f"{URL}/v1/runs/{run_id}/events",
        method="GET",
        headers=auth_headers(),
    )
    try:
        with urllib.request.urlopen(req2, timeout=95) as resp:
            buf = b""
            while time.time() < deadline:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buf += chunk
                while b"\n\n" in buf:
                    block, buf = buf.split(b"\n\n", 1)
                    for line in block.decode("utf-8", errors="replace").splitlines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data or data == "[DONE]":
                            continue
                        try:
                            ev = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        et = str(ev.get("event") or ev.get("type") or "")
                        if "tool" in et.lower():
                            tool_events.append(
                                {
                                    "event": et,
                                    "name": ev.get("name")
                                    or ev.get("tool")
                                    or ev.get("tool_name"),
                                }
                            )
                        if et == "run.completed":
                            run_meta = ev
                            out = ev.get("output") or ""
                            if isinstance(out, dict):
                                final_output = str(out.get("text") or out)
                            else:
                                final_output = str(out)
                            return summarize(
                                label, model, run_id, tool_events, final_output, run_meta
                            )
    except Exception as exc:  # noqa: BLE001
        return {
            "label": label,
            "model": model,
            "run_id": run_id,
            "error": str(exc),
            "tool_events": tool_events,
        }

    return summarize(label, model, run_id, tool_events, final_output, run_meta)


def main() -> int:
    if not KEY:
        print("JARVIS_HERMES_KEY / API_SERVER_KEY absent", file=sys.stderr)
        return 2

    results = []
    for label, model in MODELS:
        print(f"=== TEST {label} ({model}) ===", flush=True)
        result = run_test(label, model)
        results.append(result)
        print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
        time.sleep(2)

    print("\n=== SUMMARY ===")
    for r in results:
        print(
            f"{r.get('label')}: tools={r.get('tool_event_count', '?')} "
            f"fake_syntax={r.get('looks_fake_tool_syntax_in_output')} "
            f"err={r.get('error', '')}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
