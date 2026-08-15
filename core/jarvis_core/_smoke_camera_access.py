"""Smoke — camera_access (jetons signés courte durée).

    python -m jarvis_core._smoke_camera_access
"""
from __future__ import annotations

import sys
import time

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def run() -> None:
    from jarvis_core.camera_access import mint_camera_token, verify_camera_token

    # 1. round-trip normal.
    tok = mint_camera_token("pi-salon", ttl_s=5)
    assert verify_camera_token("pi-salon", tok) is True
    print("  OK — jeton valide accepté")

    # 2. mauvais device_id → refusé (le jeton est lié au device).
    assert verify_camera_token("nuc-main", tok) is False
    print("  OK — jeton refusé pour un autre device_id")

    # 3. jeton altéré → refusé.
    bad = tok[:-1] + ("0" if tok[-1] != "0" else "1")
    assert verify_camera_token("pi-salon", bad) is False
    print("  OK — jeton altéré refusé")

    # 4. expiré → refusé.
    expired = mint_camera_token("pi-salon", ttl_s=1)
    time.sleep(1.2)
    assert verify_camera_token("pi-salon", expired) is False
    print("  OK — jeton expiré refusé")

    # 5. vide / malformé → refusé, jamais d'exception.
    assert verify_camera_token("pi-salon", "") is False
    assert verify_camera_token("pi-salon", "n-importe-quoi") is False
    print("  OK — entrées malformées refusées sans exception")

    print("=== smoke camera_access ===")
    print("=== ALL OK ===")


if __name__ == "__main__":
    run()
