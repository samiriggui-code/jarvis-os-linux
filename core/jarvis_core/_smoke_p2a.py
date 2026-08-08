"""P2a — timeout Hermes configurable + messages fallback web.search.

    python -m jarvis_core._smoke_p2a
"""

from __future__ import annotations

import os
import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    from jarvis_core.hermes.bridge import (
        DEFAULT_TIMEOUT,
        HermesBridge,
        resolve_hermes_timeout,
    )
    from jarvis_core.intents.executors_routing import IntentRoutingMixin

    print("P2a — prod UX Hermes + fallback web")

    check("DEFAULT_TIMEOUT = 120", DEFAULT_TIMEOUT == 120.0)
    check("resolve sans env", resolve_hermes_timeout() == 120.0)
    check("resolve explicite", resolve_hermes_timeout(30.0) == 30.0)

    prev = os.environ.pop("JARVIS_HERMES_TIMEOUT", None)
    try:
        os.environ["JARVIS_HERMES_TIMEOUT"] = "90"
        check("resolve via env", resolve_hermes_timeout() == 90.0)
        bridge = HermesBridge(url="http://127.0.0.1:1", key="")
        check("bridge hérite env", bridge.timeout == 90.0)
    finally:
        os.environ.pop("JARVIS_HERMES_TIMEOUT", None)
        if prev is not None:
            os.environ["JARVIS_HERMES_TIMEOUT"] = prev

    # Messages fallback — inspection statique du source (pas de WS)
    import inspect

    src = inspect.getsource(IntentRoutingMixin._fallback_web_surface)
    check("message timeout vocal", "La recherche prend trop de temps" in src)
    check("message timeout surface", "dépassé le délai autorisé" in src)
    check("détection délai SSE", "délai sse" in src.lower())

    print("\nP2a smokes : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
