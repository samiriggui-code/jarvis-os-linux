"""Icône barre des tâches — orbe HUD vivante (ring-glowing-points) + pulse."""

from __future__ import annotations

import logging
import math
import os
import threading
import time
import webbrowser
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger("jarvis.win.tray")

try:
    import pystray
    from PIL import Image, ImageEnhance, ImageFilter
except ImportError:
    pystray = None  # type: ignore[assignment]
    Image = None  # type: ignore[assignment,misc]
    ImageEnhance = None  # type: ignore[assignment,misc]
    ImageFilter = None  # type: ignore[assignment,misc]

from config import load_env_file
from runtime import snapshot

StopCallback = Callable[[], None]

_ROOT = Path(__file__).resolve().parent
_ORB_PATHS = (
    _ROOT / "assets" / "orb-tray.png",
    _ROOT / "assets" / "orb-source.jpg",
    # Dev : même asset que le HUD
    _ROOT.parents[1] / "hud" / "public" / "orb" / "ring-glowing-points-black.jpg",
)

_icon: Any = None
_stop_cb: StopCallback | None = None
_panel_url = "http://127.0.0.1:9780/"
_base_orb: Any = None  # Image.Image | None
_t0 = time.monotonic()


def set_panel_url(url: str) -> None:
    global _panel_url
    _panel_url = url.rstrip("/") + "/"


def _knockout_black(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            lum = (r + g + b) / 3.0
            if lum < 14:
                px[x, y] = (r, g, b, 0)
            elif lum < 32:
                px[x, y] = (r, g, b, max(0, min(255, int((lum - 14) * 14))))
    return im


def _load_base_orb() -> Image.Image:
    global _base_orb
    if _base_orb is not None:
        return _base_orb
    assert Image is not None
    src: Path | None = None
    for p in _ORB_PATHS:
        if p.is_file():
            src = p
            break
    if src is None:
        raise FileNotFoundError("orb asset introuvable (assets/orb-tray.png)")

    im = Image.open(src)
    side = min(im.size)
    left = (im.size[0] - side) // 2
    top = (im.size[1] - side) // 2
    im = im.crop((left, top, left + side, top + side))
    # Tray Windows ~16–32 px : 64 suffit, plus léger à animer
    im = im.resize((64, 64), Image.Resampling.LANCZOS)
    if src.suffix.lower() in (".jpg", ".jpeg") or im.mode != "RGBA":
        im = _knockout_black(im)
    elif im.mode != "RGBA":
        im = im.convert("RGBA")
    _base_orb = im
    logger.info("tray orb · %s", src.name)
    return _base_orb


def _make_orb(connected: bool, *, pulse: float = 0.0) -> Image.Image:
    """Mini-orbe vivante : scale + luminosité selon pulse (0..1)."""
    assert Image is not None and ImageEnhance is not None
    base = _load_base_orb()
    size = 64
    # Vibration : 92% → 100% de taille
    scale = 0.92 + 0.08 * pulse if connected else 0.88
    inner = int(size * scale)
    orb = base.resize((inner, inner), Image.Resampling.LANCZOS)

    if connected:
        bright = 0.85 + 0.35 * pulse
        contrast = 1.05 + 0.12 * pulse
    else:
        bright = 0.45
        contrast = 0.75
        # Désaturé hors ligne
        orb = ImageEnhance.Color(orb).enhance(0.35)

    orb = ImageEnhance.Brightness(orb).enhance(bright)
    orb = ImageEnhance.Contrast(orb).enhance(contrast)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - inner) // 2
    oy = (size - inner) // 2
    canvas.paste(orb, (ox, oy), orb)

    if connected and ImageFilter is not None and pulse > 0.55:
        glow = canvas.filter(ImageFilter.GaussianBlur(1.4))
        canvas = Image.alpha_composite(glow, canvas)
    return canvas


def _icon_image() -> Image.Image:
    state = snapshot()
    connected = bool(state.get("connected"))
    # Pulse vivant ~1.2 Hz (indépendant de l'uptime Core)
    t = time.monotonic() - _t0
    pulse = (math.sin(t * 2.4) + 1) / 2 if connected else 0.15
    return _make_orb(connected, pulse=pulse)


def _tooltip() -> str:
    state = snapshot()
    cfg = load_env_file()
    ws = state.get("ws_url") or cfg.get("JARVIS_WS_URL", "?")
    if state.get("connected"):
        m = state.get("metrics") if isinstance(state.get("metrics"), dict) else {}
        cpu = m.get("cpu_percent")
        ram = m.get("ram_percent")
        line2 = f"CPU {cpu}% · RAM {ram}%" if cpu is not None else ws
        return f"JARVIS · Connecté\n{line2}"
    err = state.get("last_error") or "En attente Core…"
    return f"JARVIS · Déconnecté\n{err}"


def _open_dashboard(_icon: Any = None, _item: Any = None) -> None:
    webbrowser.open(_panel_url)


def _open_hud(_icon: Any, _item: Any) -> None:
    # Toujours FQDN HTTPS — caméra/micro Chrome refusent http://LAN
    from status import browser_hud_url

    cfg = load_env_file()
    configured = os.environ.get("JARVIS_HUD_URL") or cfg.get("JARVIS_HUD_URL") or ""
    webbrowser.open(browser_hud_url(configured))


def _run_discover(_icon: Any, _item: Any) -> None:
    from status import run_discover_save

    result = run_discover_save()
    if result.get("ok"):
        logger.info("découverte · %s (%s)", result.get("ws_url"), result.get("mode_label"))
    else:
        logger.warning("découverte échouée · %s", result.get("error"))


def _quit(_icon: Any, _item: Any) -> None:
    global _stop_cb
    if _stop_cb:
        _stop_cb()
    if _icon is not None:
        _icon.stop()


def stop_tray_icon() -> None:
    global _icon
    if _icon is not None:
        try:
            _icon.stop()
        except Exception:  # noqa: BLE001
            pass


def _restart_agent(_icon: Any, _item: Any) -> None:
    """Quitte puis relance via ensure-agent (délai pour libérer le mutex)."""
    from agent_restart import request_restart

    request_restart()
    _quit(_icon, _item)


def _refresh_loop(icon: Any, stop: threading.Event) -> None:
    # ~8 fps pour une vibration lisible en tray (sans saturer CPU)
    while not stop.wait(0.12):
        try:
            icon.icon = _icon_image()
            icon.title = _tooltip()
        except Exception as exc:  # noqa: BLE001
            logger.debug("tray refresh: %s", exc)


def run_tray(*, on_stop: StopCallback, agent_version: str = "", panel_url: str = "") -> None:
    global _icon, _stop_cb
    if pystray is None or Image is None:
        raise RuntimeError("pip install pystray pillow")

    if panel_url:
        set_panel_url(panel_url)

    # Précharge l'asset HUD avant le menu (évite freeze au 1er frame)
    try:
        _load_base_orb()
    except Exception as exc:  # noqa: BLE001
        logger.error("orb asset: %s", exc)
        raise

    _stop_cb = on_stop
    refresh_stop = threading.Event()

    menu = pystray.Menu(
        pystray.MenuItem(lambda _item: _tooltip().split("\n")[0], None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Tableau de bord", _open_dashboard, default=True),
        pystray.MenuItem("Ouvrir HUD", _open_hud),
        pystray.MenuItem("Auto-découverte Core", _run_discover),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Redémarrer l'agent", _restart_agent),
        pystray.MenuItem("Quitter", _quit),
    )

    _icon = pystray.Icon(
        "jarvis-agent",
        _icon_image(),
        "JARVIS Agent",
        menu,
    )
    _icon.title = _tooltip()

    threading.Thread(target=_refresh_loop, args=(_icon, refresh_stop), daemon=True).start()
    try:
        _icon.run()
    finally:
        refresh_stop.set()


def available() -> bool:
    return pystray is not None and Image is not None
