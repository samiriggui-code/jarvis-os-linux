#!/usr/bin/env python3
"""Read-only OpenRouter key check on NUC. Never prints the key."""
from __future__ import annotations

import json
import pathlib
import sys
import urllib.error
import urllib.request

ENV_PATHS = (
    "/etc/jarvis/core.env",
    "/etc/jarvis/hermes.env",
    "/etc/jarvis/secrets.env",
)


def load_key() -> tuple[str | None, str | None]:
    for path in ENV_PATHS:
        p = pathlib.Path(path)
        if not p.is_file():
            continue
        for line in p.read_text().splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val:
                    return val, path
    return None, None


def main() -> int:
    key, source = load_key()
    if not key:
        print("OPENROUTER_API_KEY: ABSENT (checked core.env, hermes.env, secrets.env)")
        return 1
    print(f"OPENROUTER_API_KEY: PRESENT len={len(key)} source={source}")

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/key",
        headers={"Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")[:200]
        print(f"OPENROUTER_AUTH: FAIL HTTP {exc.code} {body}")
        return 2
    except Exception as exc:  # noqa: BLE001
        print(f"OPENROUTER_AUTH: FAIL {type(exc).__name__}: {exc}")
        return 2

    data = payload.get("data", payload)
    fields = {
        k: data.get(k)
        for k in (
            "label",
            "limit",
            "limit_remaining",
            "limit_reset",
            "usage",
            "usage_daily",
            "usage_weekly",
            "usage_monthly",
            "is_free_tier",
        )
        if k in data
    }
    print("OPENROUTER_AUTH: OK")
    print(json.dumps(fields, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
