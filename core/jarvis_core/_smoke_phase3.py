"""Phase 3 — sessions WS isolées + device_mode.

Usage (depuis core/, venv) :
  python -m jarvis_core._smoke_phase3
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.auth import AuthService, UserManager  # noqa: E402
from jarvis_core.auth.service import ENV_ALLOW_UNVERIFIED  # noqa: E402
from jarvis_core.devices import DeviceRegistry  # noqa: E402
from jarvis_core.ws.connection import ConnectionRegistry  # noqa: E402

logging.getLogger("jarvis.auth.service").setLevel(logging.ERROR)


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def _smoke_sessions() -> None:
    print("\n-- sessions par connection_id --")
    os.environ.pop(ENV_ALLOW_UNVERIFIED, None)

    with tempfile.TemporaryDirectory(prefix="jarvis_p3_") as tmp:
        users = UserManager(Path(tmp) / "jarvis.db")
        try:
            auth = AuthService(users)
            auth.enroll("samir", pin="1234", role="ADMIN")
            auth.enroll("ines", pin="5678")
            admin = auth.users.get_by_username("samir")
            member = auth.users.get_by_username("ines")
            assert admin and member

            conn_a = "conn-kiosk-aaaa"
            conn_b = "conn-phone-bbbb"

            auth.attest_biometric(admin.id, "face", 0.91)
            r1 = auth.login(user_id=admin.id, method="face", connection_id=conn_a)
            check("login admin conn A", r1.get("ok"))

            auth.attest_biometric(member.id, "face", 0.87)
            r2 = auth.login(user_id=member.id, method="face", connection_id=conn_b)
            check("login ines conn B", r2.get("ok"))

            sa = auth.session_for(conn_a)
            sb = auth.session_for(conn_b)
            check("session A = samir", sa is not None and sa.user_id == admin.id)
            check("session B = ines", sb is not None and sb.user_id == member.id)
            check("sessions distinctes", sa is not sb and sa.session_id != sb.session_id)

            st_a = auth.status(connection_id=conn_a)
            st_b = auth.status(connection_id=conn_b)
            check(
                "status A username",
                (st_a.get("session") or {}).get("user", {}).get("username") == "samir",
            )
            check(
                "status B username",
                (st_b.get("session") or {}).get("user", {}).get("username") == "ines",
            )

            auth.logout(connection_id=conn_a)
            check("logout A vide A", auth.session_for(conn_a) is None)
            check("logout A garde B", auth.session_for(conn_b) is not None)

            auth.on_disconnect(conn_b)
            check("disconnect B vide B", auth.session_for(conn_b) is None)
        finally:
            users.close()


def _smoke_connection_registry() -> None:
    print("\n-- ConnectionRegistry --")

    class _Ws:
        pass

    reg = ConnectionRegistry()
    ws1, ws2 = _Ws(), _Ws()
    c1 = reg.bind(ws1)
    c2 = reg.bind(ws2)
    check("bind ids distincts", c1 != c2)
    check("get ws1", reg.get(ws1) == c1)
    dropped = reg.unbind(ws1)
    check("unbind retourne id", dropped == c1)
    check("ws1 absent", reg.get(ws1) is None)
    check("ws2 intact", reg.get(ws2) == c2)


def _smoke_device_mode() -> None:
    print("\n-- device_mode / bound_user_id --")
    reg = DeviceRegistry(ttl_s=60)
    ack = reg.handle_message({
        "type": "device",
        "action": "register",
        "device_id": "phone-samir",
        "type": "pc_client",
        "runtime_kind": "browser",
        "device_mode": "personal",
        "bound_user_id": "user-abc",
    })
    check("register ack", ack.get("ok"))
    dev = ack.get("device") or {}
    check("device_mode personal", dev.get("device_mode") == "personal")
    check("bound_user_id", dev.get("bound_user_id") == "user-abc")

    ack2 = reg.handle_message({
        "type": "device",
        "action": "register",
        "device_id": "nuc-kiosk",
        "type": "nuc",
        "device_mode": "gateway",
    })
    check("gateway mode", (ack2.get("device") or {}).get("device_mode") == "gateway")

    ack3 = reg.handle_message({
        "type": "device",
        "action": "register",
        "device_id": "bad-mode",
        "type": "other",
        "device_mode": "invalid",
    })
    check("mode invalide → shared", (ack3.get("device") or {}).get("device_mode") == "shared")


def _check_orchestrator() -> None:
    print("-- jarvis_core.Orchestrator (Phase 3 mixins) --")
    from jarvis_core import Orchestrator  # noqa: F401

    orch = Orchestrator()
    check("connections registry", hasattr(orch, "connections"))
    check("_execute_hud", hasattr(orch, "_execute_hud"))
    check("_execute_home", hasattr(orch, "_execute_home"))


def main(argv: list[str] | None = None) -> int:
    print("PHASE 3 - sessions WS + device_mode")
    print(f"python={sys.executable}")

    _check_orchestrator()
    _smoke_connection_registry()
    _smoke_sessions()
    _smoke_device_mode()

    env = os.environ.copy()
    print("\n-- gate Phase 2 (régression) --")
    rc = subprocess.call(
        [sys.executable, "-m", "jarvis_core._smoke_phase2"],
        cwd=str(ROOT),
        env=env,
    )
    if rc != 0:
        raise SystemExit(rc)

    print("\n" + "=" * 56)
    print("PHASE 3 smokes : ALL PASS (exit 0)")
    print("=" * 56)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
