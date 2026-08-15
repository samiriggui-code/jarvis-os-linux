#!/usr/bin/env python3
"""Audit OpenRouter + Nous on NUC — never prints secrets."""
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
    "/var/lib/jarvis/hermes/.env",
)


def env_get(name: str) -> tuple[str | None, str | None]:
    for path in ENV_PATHS:
        p = pathlib.Path(path)
        if not p.is_file():
            continue
        for line in p.read_text().splitlines():
            if line.startswith(f"{name}="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val:
                    return val, path
    return None, None


def check_openrouter() -> None:
    key, src = env_get("OPENROUTER_API_KEY")
    if not key:
        print("OPENROUTER: ABSENT")
        return
    print(f"OPENROUTER: KEY present len={len(key)} source={src}")
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/key",
        headers={"Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read()).get("data", {})
        print("OPENROUTER: AUTH OK")
        print(
            json.dumps(
                {
                    "limit": data.get("limit"),
                    "limit_remaining": data.get("limit_remaining"),
                    "usage": data.get("usage"),
                    "usage_daily": data.get("usage_daily"),
                },
                indent=2,
            )
        )
    except urllib.error.HTTPError as exc:
        print(f"OPENROUTER: AUTH FAIL HTTP {exc.code}")
    except Exception as exc:  # noqa: BLE001
        print(f"OPENROUTER: AUTH FAIL {type(exc).__name__}")


def check_nous() -> None:
    oauth = pathlib.Path("/var/lib/jarvis/hermes/auth.json")
    key, src = env_get("NOUS_API_KEY")
    print(f"NOUS_OAUTH auth.json: {'present' if oauth.is_file() else 'absent'}")
    if key:
        print(f"NOUS_API_KEY: present len={len(key)} source={src}")
        req = urllib.request.Request(
            "https://inference-api.nousresearch.com/v1/models",
            headers={"Authorization": f"Bearer {key}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                payload = json.loads(resp.read())
            n = len(payload.get("data", payload if isinstance(payload, list) else []))
            print(f"NOUS_API: AUTH OK models_listed={n}")
        except urllib.error.HTTPError as exc:
            print(f"NOUS_API: AUTH FAIL HTTP {exc.code}")
        except Exception as exc:  # noqa: BLE001
            print(f"NOUS_API: AUTH FAIL {type(exc).__name__}")
    else:
        print("NOUS_API_KEY: absent")


def check_hermes_config() -> None:
    cfg = pathlib.Path("/var/lib/jarvis/hermes/config.yaml")
    if not cfg.is_file():
        print("HERMES config.yaml: ABSENT")
        return
    text = cfg.read_text()
    print("HERMES config.yaml model block:")
    in_model = False
    for line in text.splitlines():
        if line.startswith("model:"):
            in_model = True
        elif in_model and line and not line.startswith(" ") and not line.startswith("#"):
            break
        if in_model:
            print(line)


def check_ollama_env() -> None:
    ollama_vars = []
    for path in ENV_PATHS:
        p = pathlib.Path(path)
        if not p.is_file():
            continue
        for line in p.read_text().splitlines():
            if any(
                line.startswith(pfx)
                for pfx in (
                    "JARVIS_REMOTE_LLM_URL=",
                    "JARVIS_OLLAMA_MODEL=",
                    "OLLAMA_HOST=",
                    "JARVIS_OLLAMA_URL=",
                    "JARVIS_OLLAMA_FIRST=",
                )
            ):
                ollama_vars.append(f"{path}:{line.split('=')[0]}")
    if ollama_vars:
        print("OLLAMA_ENV_VARS:")
        for v in ollama_vars:
            print(f"  {v}")
    else:
        print("OLLAMA_ENV_VARS: none")


def main() -> int:
    check_openrouter()
    print("---")
    check_nous()
    print("---")
    check_hermes_config()
    print("---")
    check_ollama_env()
    return 0


if __name__ == "__main__":
    sys.exit(main())
