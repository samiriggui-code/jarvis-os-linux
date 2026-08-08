"""Icône barre des tâches Windows — agent JARVIS (pas de page web)."""

from __future__ import annotations

import logging
import os
import threading
import webbrowser
from typing import Any, Callable

logger = logging.getLogger("jarvis.win.tray")

try:
    import pystray
    from PIL import Image, ImageDraw
except ImportError:
    pystray = None  # type: ignore[assignment]
    Image = None  # type: ignore[assignment,misc]
    ImageDraw = None  # type: ignore[assignment,misc]

from config import load_env_file
from runtime import snapshot

StopCallback = Callable[[], None]
AgentVersion = "0.4.0-windows"

_icon: pystray.Icon | None = None
_stop_cb: StopCallback | None = None


def _rgb(name: str) -> tuple[int, int, int, int]:
    return {
        "ok": (61, 214, 140, 255),
        "warn": (245, 197, 66, 255),
        "off": (139, 149, 168, 255),
    }.get(name, (139, 149, 168, 255))


def _make_icon(color: tuple[int, int, int, int]) -> Image.Image:
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((6, 6, 58, 58), fill=color)
    draw.ellipse((22, 22, 42, 42), fill=(15, 17, 23, 220))
    return img


def _icon_color() -> tuple[int, int, int, int]:
    state = snapshot()
    if state.get("connected"):
        return _rgb("ok")
    if state.get("last_error"):
        return _rgb("warn")
    return _rgb("off")


def _tooltip() -> str:
    state = snapshot()
    cfg = load_env_file()
    ws = state.get("ws_url") or cfg.get("JARVIS_WS_URL", "?")
    if state.get("connected"):
        return f"JARVIS Agent · Connecte\n{ws}"
    err = state.get("last_error") or "En attente Core..."
    return f"JARVIS Agent · Deconnecte\n{err}"


def _open_hud(_icon: Any, _item: Any) -> None:
    cfg = load_env_file()
    url = os.environ.get("JARVIS_HUD_URL") or cfg.get("JARVIS_HUD_URL") or "http://192.168.1.37:8080"
    webbrowser.open(url)


def _run_discover(_icon: Any, _item: Any) -> None:
    from status import run_discover_save

    result = run_discover_save()
    if result.get("ok"):
        logger.info("decouverte · %s (%s)", result.get("ws_url"), result.get("mode_label"))
    else:
        logger.warning("decouverte echouee · %s", result.get("error"))


def _open_settings(_icon: Any, _item: Any) -> None:
    threading.Thread(target=_settings_window, daemon=True).start()


def _settings_window() -> None:
    import tkinter as tk
    from tkinter import messagebox

    from config import save_env_file
    from status import run_discover_save

    cfg = load_env_file()
    root = tk.Tk()
    root.title("JARVIS Agent — Configuration")
    root.geometry("480x320")
    root.configure(bg="#0f1117")
    root.resizable(False, False)

    fg = "#e8ecf4"
    bg = "#171a22"
    entries: dict[str, tk.Entry] = {}

    def row(label: str, key: str, y: int) -> None:
        tk.Label(root, text=label, fg="#8b95a8", bg="#0f1117", anchor="w").place(x=16, y=y, width=140)
        e = tk.Entry(root, width=42, bg=bg, fg=fg, insertbackground=fg, relief=tk.FLAT)
        e.insert(0, cfg.get(key, ""))
        e.place(x=150, y=y, height=24)
        entries[key] = e

    row("WebSocket Core", "JARVIS_WS_URL", 20)
    row("HUD", "JARVIS_HUD_URL", 56)
    row("Label", "JARVIS_AGENT_LABEL", 92)
    row("NUC host", "JARVIS_NUC_HOST", 128)

    force_var = tk.BooleanVar(
        value=str(cfg.get("JARVIS_WS_URL_FORCE", "")).lower() in ("1", "true", "yes")
    )
    tk.Checkbutton(
        root,
        text="Forcer l'URL (desactiver auto-decouverte)",
        variable=force_var,
        fg=fg,
        bg="#0f1117",
        selectcolor=bg,
        activebackground="#0f1117",
    ).place(x=16, y=168)

    status = tk.Label(root, text="", fg="#8b95a8", bg="#0f1117", anchor="w")
    status.place(x=16, y=210, width=440)

    def refresh_status() -> None:
        st = snapshot()
        cfg2 = load_env_file()
        mode = "Connecte" if st.get("connected") else "Deconnecte"
        status.config(text=f"Etat · {mode} · {cfg2.get('JARVIS_WS_URL', '?')}")

    def on_save() -> None:
        values = {k: e.get().strip() for k, e in entries.items()}
        values["JARVIS_WS_URL_FORCE"] = "1" if force_var.get() else "0"
        save_env_file(values)
        for k, v in values.items():
            if v:
                os.environ[k] = v
        refresh_status()
        messagebox.showinfo("JARVIS", "Config enregistree.\nRedemarrez l'agent pour appliquer.")

    def on_discover() -> None:
        result = run_discover_save()
        if not result.get("ok"):
            messagebox.showerror("JARVIS", result.get("error", "Core introuvable"))
            return
        entries["JARVIS_WS_URL"].delete(0, tk.END)
        entries["JARVIS_WS_URL"].insert(0, result.get("ws_url", ""))
        entries["JARVIS_HUD_URL"].delete(0, tk.END)
        entries["JARVIS_HUD_URL"].insert(0, result.get("hud_url", ""))
        refresh_status()
        messagebox.showinfo("JARVIS", f"Core trouve · {result.get('mode_label')}")

    tk.Button(root, text="Auto-decouverte", command=on_discover, bg="#1e2430", fg=fg).place(x=16, y=250, width=120, height=28)
    tk.Button(root, text="Enregistrer", command=on_save, bg="#5b9dff", fg="#041018").place(x=150, y=250, width=120, height=28)
    tk.Button(root, text="Fermer", command=root.destroy, bg="#1e2430", fg=fg).place(x=284, y=250, width=80, height=28)

    refresh_status()
    root.mainloop()


def _quit(_icon: Any, _item: Any) -> None:
    global _stop_cb
    if _stop_cb:
        _stop_cb()
    if _icon is not None:
        _icon.stop()


def _refresh_loop(icon: pystray.Icon, stop: threading.Event) -> None:
    while not stop.wait(2.0):
        try:
            icon.icon = _make_icon(_icon_color())
            icon.title = _tooltip()
        except Exception as exc:  # noqa: BLE001
            logger.debug("tray refresh: %s", exc)


def run_tray(*, on_stop: StopCallback, agent_version: str = "") -> None:
    global _icon, _stop_cb
    if pystray is None or Image is None:
        raise RuntimeError("pip install pystray pillow")

    if agent_version:
        globals()["AgentVersion"] = agent_version

    _stop_cb = on_stop
    refresh_stop = threading.Event()

    menu = pystray.Menu(
        pystray.MenuItem(lambda _item: _tooltip(), None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Auto-decouverte Core", _run_discover),
        pystray.MenuItem("Parametres...", _open_settings),
        pystray.MenuItem("Ouvrir HUD", _open_hud),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quitter", _quit),
    )

    _icon = pystray.Icon(
        "jarvis-agent",
        _make_icon(_icon_color()),
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
