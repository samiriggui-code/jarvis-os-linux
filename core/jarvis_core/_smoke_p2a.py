"""P2a — chat libre via Provider Manager.

    python -m jarvis_core._smoke_p2a
"""

from __future__ import annotations

import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    import inspect

    from jarvis_core.gateway import chat_provider_mode
    from jarvis_core.ws.handlers.chat import ChatHandlerMixin

    print("P2a — Provider Manager only")

    check("chat mode llm", chat_provider_mode() == "llm")
    src = inspect.getsource(ChatHandlerMixin._handle_user_chat_body)
    check("providers.complete nominal", "providers.complete" in src)
    check("no delegated chat branch", "chat_provider_mode" not in src)

    print("\nP2a smokes : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
