#!/usr/bin/env python3
"""Probe latence Hermes — tokens entrée pour un prompt court (diagnostic NUC).

Usage sur NUC :
  source /etc/jarvis/core.env
  python3 deploy/scripts/_probe_hermes_latency.py
  python3 deploy/scripts/_probe_hermes_latency.py --prompt "j'arrive"
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

URL = (os.environ.get("JARVIS_HERMES_URL") or "http://127.0.0.1:8642").rstrip("/")
KEY = os.environ.get("JARVIS_HERMES_KEY") or os.environ.get("API_SERVER_KEY") or ""


def auth_headers(*, json_body: bool = False) -> dict[str, str]:
    h = {"Authorization": f"Bearer {KEY}"}
    if json_body:
        h["Content-Type"] = "application/json"
    return h


def probe(prompt: str, *, instructions: str = "") -> dict:
    body: dict = {"input": prompt}
    if instructions:
        body["instructions"] = instructions
    req = urllib.request.Request(
        f"{URL}/v1/runs",
        data=json.dumps(body).encode(),
        method="POST",
        headers=auth_headers(json_body=True),
    )
    t0 = time.monotonic()
    with urllib.request.urlopen(req, timeout=30) as resp:
        started = json.loads(resp.read().decode())
    run_id = str(started.get("run_id") or "")
    usage: dict = {}
    output = ""
    req_ev = urllib.request.Request(
        f"{URL}/v1/runs/{run_id}/events",
        headers=auth_headers(),
    )
    deadline = time.time() + 120
    with urllib.request.urlopen(req_ev, timeout=125) as resp:
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
                    try:
                        ev = json.loads(line[5:].strip())
                    except json.JSONDecodeError:
                        continue
                    if ev.get("usage"):
                        usage = ev["usage"]
                    if ev.get("event") in ("run.completed", "run.failed"):
                        output = str(ev.get("output") or ev.get("error") or "")[:200]
                        deadline = 0
                        break
    elapsed = time.monotonic() - t0
    return {
        "run_id": run_id,
        "elapsed_s": round(elapsed, 2),
        "input_tokens": usage.get("input_tokens"),
        "output_tokens": usage.get("output_tokens"),
        "total_tokens": usage.get("total_tokens"),
        "output_preview": output.replace("\n", " "),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", default="j'arrive")
    args = parser.parse_args()
    if not KEY:
        print("JARVIS_HERMES_KEY absente", file=sys.stderr)
        return 1

    # Toolsets actifs (platform_toolsets — pas filtrable par requête /v1/runs)
    try:
        req = urllib.request.Request(f"{URL}/v1/toolsets", headers=auth_headers())
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        rows = data.get("data") or []
        enabled = [r.get("name") for r in rows if r.get("enabled")]
        print(f"platform_toolsets enabled ({len(enabled)}): {', '.join(sorted(enabled))}")
    except Exception as exc:
        print(f"toolsets: {exc}")

    print(f"\nPrompt: {args.prompt!r}")
    try:
        r = probe(args.prompt)
    except urllib.error.HTTPError as exc:
        print(f"HTTP {exc.code}: {exc.read()[:300].decode()}", file=sys.stderr)
        return 1
    print(json.dumps(r, indent=2, ensure_ascii=False))
    if r.get("input_tokens"):
        print(f"\n→ {r['input_tokens']} tokens entrée pour {len(args.prompt.split())} mot(s) — "
              f"dominant = schémas outils platform_toolsets + index skills (pas le corps des SKILL.md)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
