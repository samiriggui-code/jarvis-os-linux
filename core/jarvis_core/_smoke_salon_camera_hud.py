"""Smoke — caméra salon Pi → surface HUD (live MJPEG).

Vérifie le contrat que le HUD doit recevoir pour afficher le flux :
  home.camera_view → open_space ``salon-camera`` + ImageViewer(src=…/stream.mjpg)

Live (optionnel) : si le Pi répond sur le LAN, on lit un vrai JPEG snapshot.
Sinon SKIP live (pas FAIL) — sauf ``JARVIS_SMOKE_REQUIRE_LIVE_CAM=1``.

    python -m jarvis_core._smoke_salon_camera_hud
"""
from __future__ import annotations

import asyncio
import os
import sys
from typing import Any
from urllib import error, request

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


def skip(label: str, reason: str) -> None:
    print(f"  [SKIP] {label} — {reason}")


class _FakeOrch:
    """Minimal pour CameraExecutorsMixin._execute_home_camera_view."""

    def __init__(self) -> None:
        from jarvis_core.surface import SurfaceBroadcaster

        self.messages: list[dict[str, Any]] = []
        self.surfaces = SurfaceBroadcaster()
        self.bindings: dict[str, Any] = {}

    async def broadcast(self, msg: dict[str, Any]) -> None:
        self.messages.append(msg)

    def _session_user_id(self) -> str:
        return "smoke-cam"

    def _surface_guards(self) -> tuple[set[str], set[str]]:
        # Session admin (Samir) : seul rôle avec `camera.read.satellite`
        # depuis le durcissement de permission (caméra maison admin-only).
        return {"camera.read.satellite"}, {"camera"}

    async def say(self, *args: Any, **kwargs: Any) -> None:
        return None


async def _test_hud_contract() -> dict[str, Any]:
    from jarvis_core.capabilities import for_intent
    from jarvis_core.executors.camera import (
        CAMERA_DEVICE_ID,
        CAMERA_SOURCE,
        CAMERA_SURFACE_ID,
        CameraExecutorsMixin,
        _live_url,
    )

    cap = for_intent("home.camera_view")
    check("capability home.camera_view", cap is not None)
    assert cap is not None
    check("app_id camera_view", cap.app_id == "camera_view")
    check("surface id salon-camera", CAMERA_SURFACE_ID == "salon-camera")
    check("device_id pi-salon", CAMERA_DEVICE_ID == "pi-salon")
    check("source LG", "LG" in CAMERA_SOURCE)

    url = _live_url(None)
    check("stream URL live.mp4", url.endswith("/live.mp4") or "live.mp4" in url)
    check("stream URL host Pi", "8768" in url or "camera/live" in url)

    class Orch(CameraExecutorsMixin, _FakeOrch):
        pass

    orch = Orch()
    result = await orch._execute_home_camera_view({"prompt": "montre la caméra du salon"})
    check("execute ok", result.get("ok") is True)
    check("result stream_url", "live" in str(result.get("stream_url") or ""))
    check("result device pi-salon", result.get("device_id") == "pi-salon")
    check("component LiveStream", result.get("component") == "LiveStream")

    opens = [
        m for m in orch.messages
        if m.get("type") == "hud_command" and m.get("action") == "open_space"
    ]
    check("open_space émis", len(opens) >= 1)
    check("open_space → salon-camera", any(m.get("app") == "salon-camera" for m in opens))

    snaps = [m for m in orch.messages if m.get("type") == "SURFACE_SNAPSHOT"]
    check("SURFACE_SNAPSHOT émis", len(snaps) >= 1)
    doc = (snaps[0].get("payload") or {}).get("document") or {}
    surf = (doc.get("surfaces") or {}).get("salon-camera") or {}
    comps = surf.get("components") or {}
    cam = comps.get("camera-main") or {}
    check("composant LiveStream", cam.get("name") == "LiveStream")
    props = cam.get("props") or {}
    src = str(props.get("src") or "")
    check("LiveStream.src = flux A/V", "live.mp4" in src or "/live" in src)
    check("caption salon", "salon" in str(props.get("caption") or "").lower())
    check("titlebar fourni par le Core (pas en dur dans la brique)", "salon" in str(props.get("titlebar") or "").lower())
    return result


def _probe_pi_live() -> None:
    """Preuve réseau : Pi jarvis-cam sert un JPEG (observation, pas claim)."""
    require = (os.environ.get("JARVIS_SMOKE_REQUIRE_LIVE_CAM") or "").strip() in {"1", "true", "yes"}
    host = (os.environ.get("JARVIS_SALON_CAM_HOST") or "192.168.1.27").strip()
    port = (os.environ.get("JARVIS_SALON_CAM_PORT") or "8768").strip()
    base = f"http://{host}:{port}"
    snap_url = f"{base}/snapshot.jpg"
    stream_url = f"{base}/stream.mjpg"

    try:
        req = request.Request(snap_url, method="GET")
        with request.urlopen(req, timeout=8) as resp:
            body = resp.read(64 * 1024)
            ctype = (resp.headers.get("Content-Type") or "").lower()
    except error.URLError as exc:
        msg = f"Pi injoignable ({snap_url}): {exc}"
        if require:
            check("live snapshot Pi", False)
            print(f"    {msg}")
        else:
            skip("live snapshot Pi", msg)
        return
    except Exception as exc:  # noqa: BLE001
        msg = f"erreur snapshot: {exc}"
        if require:
            check("live snapshot Pi", False)
        else:
            skip("live snapshot Pi", msg)
        return

    is_jpeg = body[:2] == b"\xff\xd8" or "jpeg" in ctype
    check("live snapshot JPEG", is_jpeg and len(body) > 500)
    print(f"    snapshot {len(body)} bytes · {ctype or 'no-content-type'}")

    # Stream : lire les premiers octets multipart (pas tout le flux).
    try:
        req = request.Request(stream_url, method="GET")
        with request.urlopen(req, timeout=8) as resp:
            head = resp.read(4096)
            ctype = (resp.headers.get("Content-Type") or "").lower()
        ok_stream = (
            "multipart" in ctype
            or "mjpeg" in ctype
            or b"--" in head
            or head[:2] == b"\xff\xd8"
        )
        check("live stream.mjpg démarre", ok_stream)
        print(f"    stream head {len(head)} bytes · {ctype or 'no-content-type'}")
    except Exception as exc:  # noqa: BLE001
        if require:
            check("live stream.mjpg démarre", False)
            print(f"    {exc}")
        else:
            skip("live stream.mjpg", str(exc))


def main() -> int:
    print("=== smoke salon camera → HUD ===")
    asyncio.run(_test_hud_contract())
    print("--- live Pi (LAN) ---")
    _probe_pi_live()
    print("=== ALL PASS ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
