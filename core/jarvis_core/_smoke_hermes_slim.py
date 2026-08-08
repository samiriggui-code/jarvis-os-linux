"""Smoke — Hermes MCP slim / skills-only (pattern agent-swarm)."""

from __future__ import annotations

import os
import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from jarvis_core.capabilities import toolsets_for


def check(label: str, ok: bool) -> None:
    print(f"  [{'OK' if ok else 'FAIL'}] {label}")
    if not ok:
        raise SystemExit(1)


def main() -> int:
    print("SMOKE hermes slim")
    prev_slim = os.environ.pop("JARVIS_HERMES_SKILLS_ONLY", None)
    prev_allow = os.environ.pop("JARVIS_HERMES_TOOLSETS", None)
    prev_names = os.environ.pop("JARVIS_HERMES_SLIM_TOOLSETS", None)
    try:
        check("admin full (default)", "terminal" in toolsets_for("admin"))
        check("user unchanged", "web" in toolsets_for("user"))

        os.environ["JARVIS_HERMES_SKILLS_ONLY"] = "1"
        admin_slim = toolsets_for("admin")
        check("admin skills-only", admin_slim == {"skills"})
        check("user empty under slim", toolsets_for("user") == set())

        os.environ.pop("JARVIS_HERMES_SKILLS_ONLY")
        os.environ["JARVIS_HERMES_TOOLSETS"] = "spotify,web"
        allow = toolsets_for("user")
        check("allowlist intersect role", allow == {"spotify", "web"})
    finally:
        for key, val in (
            ("JARVIS_HERMES_SKILLS_ONLY", prev_slim),
            ("JARVIS_HERMES_TOOLSETS", prev_allow),
            ("JARVIS_HERMES_SLIM_TOOLSETS", prev_names),
        ):
            if val is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = val

    print("ALL PASS — hermes slim")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
