"""Smoke — couche JARVIS gateway (config centrale, sans runtime live)."""
from __future__ import annotations

import os
import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool, detail: str = "") -> None:
    suffix = f" — {detail}" if detail else ""
    print(f"  [{'OK' if cond else 'FAIL'}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    print("Gateway — config couche JARVIS")

    from jarvis_core.gateway import (
        HASS_DEFAULT_URL,
        chat_provider_mode,
        hass_default_url,
        semantic_routing_enabled,
    )

    os.environ.pop("JARVIS_CHAT_PROVIDER", None)
    check("chat default llm", chat_provider_mode() == "llm")

    os.environ["JARVIS_CHAT_PROVIDER"] = "hermes"
    check("chat env cannot override provider-only mode", chat_provider_mode() == "llm")
    os.environ.pop("JARVIS_CHAT_PROVIDER", None)

    check("semantic routing default on", semantic_routing_enabled())
    os.environ["JARVIS_SEMANTIC_ROUTING"] = "0"
    check("semantic routing env off", not semantic_routing_enabled())
    os.environ.pop("JARVIS_SEMANTIC_ROUTING", None)

    check("hass url nuc", hass_default_url() == HASS_DEFAULT_URL)

    chat_src = open(
        os.path.join(os.path.dirname(__file__), "ws", "handlers", "chat.py"),
        encoding="utf-8",
    ).read()
    media_src = open(
        os.path.join(os.path.dirname(__file__), "executors", "media.py"),
        encoding="utf-8",
    ).read()
    check("chat imports gateway", "from ...gateway import" in chat_src)
    check("chat provider-only", "providers.complete" in chat_src and "chat_provider_mode()" not in chat_src)
    check("media sans salon_player", "salon_player" not in media_src)
    check("salon_player supprimé", not os.path.exists(os.path.join(os.path.dirname(__file__), "salon_player.py")))

    print("\nGateway smokes : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
