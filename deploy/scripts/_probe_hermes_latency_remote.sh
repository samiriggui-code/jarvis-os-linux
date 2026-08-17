#!/bin/bash
# One-shot NUC probe (run via: ssh jarvis-nuc-wan 'bash -s' < deploy/scripts/_probe_hermes_latency_remote.sh)
set -eu
source /etc/jarvis/core.env
URL="${JARVIS_HERMES_URL:-http://127.0.0.1:8642}"
KEY="${JARVIS_HERMES_KEY:?missing key}"
python3 - "$URL" "$KEY" <<'PY'
import json, sys, time, urllib.request
URL, KEY = sys.argv[1], sys.argv[2]
h = {"Authorization": f"Bearer {KEY}"}
req = urllib.request.Request(f"{URL}/v1/toolsets", headers=h)
with urllib.request.urlopen(req, timeout=10) as r:
    data = json.loads(r.read())
enabled = sorted(x["name"] for x in data.get("data", []) if x.get("enabled"))
print(f"platform_toolsets ({len(enabled)}): {', '.join(enabled)}")
body = json.dumps({"input": "j'arrive"}).encode()
h2 = {**h, "Content-Type": "application/json"}
t0 = time.monotonic()
req = urllib.request.Request(f"{URL}/v1/runs", data=body, method="POST", headers=h2)
with urllib.request.urlopen(req, timeout=30) as r:
    run_id = json.loads(r.read()).get("run_id", "")
usage = {}
req = urllib.request.Request(f"{URL}/v1/runs/{run_id}/events", headers=h)
with urllib.request.urlopen(req, timeout=125) as r:
    buf = b""
    deadline = time.time() + 120
    while time.time() < deadline:
        chunk = r.read(4096)
        if not chunk:
            break
        buf += chunk
        while b"\n\n" in buf:
            block, buf = buf.split(b"\n\n", 1)
            for line in block.decode("utf-8", "replace").splitlines():
                if not line.startswith("data:"):
                    continue
                ev = json.loads(line[5:].strip())
                if ev.get("usage"):
                    usage = ev["usage"]
                if ev.get("event") in ("run.completed", "run.failed"):
                    deadline = 0
                    break
elapsed = round(time.monotonic() - t0, 2)
print(json.dumps({"elapsed_s": elapsed, **usage}, indent=2))
PY
