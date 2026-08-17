"""Smoke — Dashboard usage OpenRouter / Anthropic / Cursor (sans Ollama, sans Hermes).

    python -m jarvis_core._smoke_usage_dashboard
"""
from __future__ import annotations

import os
import sys
from unittest.mock import patch

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool, detail: str = "") -> None:
    suffix = f" — {detail}" if detail else ""
    print(f"  [{'OK' if cond else 'FAIL'}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def test_cursor_usage_parser() -> None:
    from jarvis_core.cursor_agents import parse_cursor_usage

    empty = parse_cursor_usage({})
    check("empty usage → zeros", empty["tokens_in"] == 0 and empty["total_tokens"] == 0)

    parsed = parse_cursor_usage(
        {
            "totalUsage": {
                "inputTokens": 100,
                "outputTokens": 20,
                "cacheWriteTokens": 5,
                "cacheReadTokens": 40,
                "totalTokens": 165,
            }
        }
    )
    check("input+cacheRead", parsed["tokens_in"] == 140)
    check("output+cacheWrite", parsed["tokens_out"] == 25)
    check("billed total preserved", parsed["total_tokens"] == 165)


def test_snapshots_without_keys() -> None:
    from jarvis_core.usage import fetch_anthropic_status, fetch_cursor_status, fetch_openrouter_key

    env = {
        k: v
        for k, v in os.environ.items()
        if k not in ("OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "CURSOR_API_KEY")
    }
    with patch.dict(os.environ, env, clear=True):
        or_info = fetch_openrouter_key()
        an = fetch_anthropic_status()
        cu = fetch_cursor_status()
        check("openrouter unconfigured", or_info.get("configured") is False)
        check("anthropic unconfigured", an.get("configured") is False)
        check("cursor unconfigured", cu.get("configured") is False)


def test_series_shape_and_payload_keys() -> None:
    from jarvis_core.usage import _empty_series_point, dashboard_payload

    pt = _empty_series_point("2026-08-17")
    for key in ("openrouter", "anthropic", "cursor", "elevenlabs"):
        check(f"series point has {key}", key in pt)
    check("no ollama series key", "ollama" not in pt)

    totals = {
        "day": {"tokens": 0, "cost": 0, "calls": 0, "by_provider": {}},
        "month": {"tokens": 0, "cost": 0, "calls": 0, "by_provider": {}},
        "hour": {"tokens": 0, "cost": 0, "calls": 0, "by_provider": {}},
        "week": {"tokens": 0, "cost": 0, "calls": 0, "by_provider": {}},
    }
    with patch("jarvis_core.usage.get_engine", return_value=None):
        with patch("jarvis_core.usage.describe_backend", return_value={"backend": "sqlite"}):
            with patch("jarvis_core.usage.period_totals", return_value=totals):
                with patch("jarvis_core.usage.series", return_value=[]):
                    with patch("jarvis_core.usage.fetch_openrouter_key", return_value={"ok": False, "configured": False}):
                        with patch("jarvis_core.usage.fetch_anthropic_status", return_value={"ok": False, "configured": False}):
                            with patch("jarvis_core.usage.fetch_cursor_status", return_value={"ok": False, "configured": False}):
                                with patch("jarvis_core.usage.fetch_elevenlabs_subscription", return_value={"ok": False, "configured": False}):
                                    payload = dashboard_payload("day")
    check("payload ok", payload.get("ok") is True)
    check("payload anthropic", "anthropic" in payload)
    check("payload cursor", "cursor" in payload)
    check("payload openrouter", "openrouter" in payload)
    check("no ollama snapshot", "ollama" not in payload)
    check("anthropic local 30d attached", "local_month_tokens" in payload["anthropic"])
    check("cursor local 24h attached", "local_day_tokens" in payload["cursor"])


def main() -> int:
    print("=== smoke usage dashboard (OpenRouter / Anthropic / Cursor) ===")
    test_cursor_usage_parser()
    test_snapshots_without_keys()
    test_series_shape_and_payload_keys()
    print("=== ALL PASS ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
