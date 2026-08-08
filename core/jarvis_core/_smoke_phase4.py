"""Phase 4 — rename vision + lifecycle split + device hint.

Usage (depuis core/, venv) :
  python -m jarvis_core._smoke_phase4
"""
from __future__ import annotations

import os
import subprocess
import sys
import warnings
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def _smoke_vision_package() -> None:
    print("\n-- package vision --")
    from jarvis_core.vision import FaceEngine, FaceRunner  # noqa: F401

    check("FaceEngine import", FaceEngine is not None)
    check("FaceRunner import", FaceRunner is not None)

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        from jarvis_core import holomat as holomat_shim  # noqa: F401

        check("holomat shim DeprecationWarning", any(
            issubclass(w.category, DeprecationWarning) for w in caught
        ))
        check("shim FaceRunner", holomat_shim.FaceRunner is FaceRunner)


def _smoke_orchestrator_mixins() -> None:
    print("\n-- orchestrator mixins Phase 4 --")
    from jarvis_core import Orchestrator

    orch = Orchestrator()
    for name in (
        "speak",
        "say",
        "speak_boot_sequence",
        "broadcast",
        "_device_hint_for_ws",
        "_execute_hud",
        "connections",
    ):
        check(f"Orchestrator.{name}", hasattr(orch, name))


def _smoke_device_conn_binding() -> None:
    print("\n-- connexion WS ↔ device_id --")
    from jarvis_core.devices import DeviceRegistry
    from jarvis_core.ws.connection import ConnectionRegistry

    class _Ws:
        pass

    conn = ConnectionRegistry()
    ws = _Ws()
    conn.bind(ws)
    reg = DeviceRegistry(ttl_s=60)
    reg.handle_message({
        "type": "device",
        "action": "register",
        "device_id": "tablet-zahra",
        "type": "pc_client",
        "device_mode": "personal",
        "bound_user_id": "uid-zahra",
    })
    conn.set_device(ws, "tablet-zahra")
    check("device_for ws", conn.device_for(ws) == "tablet-zahra")

    from jarvis_core import Orchestrator

    orch = Orchestrator()
    orch.connections.bind(ws)
    orch.connections.set_device(ws, "tablet-zahra")
    orch.devices = reg
    hint = orch._device_hint_for_ws(ws)
    check("device_hint mode", hint and hint.get("device_mode") == "personal")
    check("device_hint bound_user", hint and hint.get("bound_user_id") == "uid-zahra")


def main(argv: list[str] | None = None) -> int:
    print("PHASE 4 - vision rename + lifecycle split")
    print(f"python={sys.executable}")

    _smoke_vision_package()
    _smoke_orchestrator_mixins()
    _smoke_device_conn_binding()

    env = os.environ.copy()
    print("\n-- gate Phase 3 (régression) --")
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_phase3"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n" + "=" * 56)
    print("PHASE 4 smokes : ALL PASS (exit 0)")
    print("  Protocole WS inchangé : type=holomat")
    print("=" * 56)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
