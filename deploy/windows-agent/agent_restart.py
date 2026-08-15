"""Redémarrage agent — ensure-agent après sortie propre du process."""
from __future__ import annotations

import logging
import os
import subprocess
import threading
from pathlib import Path
from typing import Callable

logger = logging.getLogger("jarvis.win.agent")

_stop_event: threading.Event | None = None
_after_stop: Callable[[], None] | None = None


def bind_lifecycle(*, stop: threading.Event, after_stop: Callable[[], None] | None = None) -> None:
    global _stop_event, _after_stop
    _stop_event = stop
    _after_stop = after_stop


def _schedule_ensure(*, restart: bool = True) -> None:
    root = Path(__file__).resolve().parent
    vbs = root / "ensure-agent.vbs"
    ps1 = root / "ensure-agent.ps1"
    restart_flag = " -Restart" if restart else ""
    if restart and ps1.is_file():
        delayed = (
            f'ping -n 4 127.0.0.1 >nul & '
            f'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden '
            f'-File "{ps1}"{restart_flag}'
        )
    elif vbs.is_file():
        delayed = f'ping -n 4 127.0.0.1 >nul & wscript.exe //B "{vbs}"'
    elif ps1.is_file():
        delayed = (
            f'ping -n 4 127.0.0.1 >nul & '
            f'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden '
            f'-File "{ps1}"{restart_flag}'
        )
    else:
        logger.error("ensure-agent introuvable · %s", root)
        return
    create_no_window = 0x08000000
    detached = 0x00000008
    breakaway = 0x01000000
    subprocess.Popen(
        ["cmd.exe", "/c", delayed],
        cwd=str(root),
        creationflags=create_no_window | detached | breakaway,
        close_fds=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    logger.info("restart scheduled · ensure-agent dans ~2s")


def request_restart() -> dict[str, str]:
    """Planifie ensure-agent puis arrête le process courant."""
    _schedule_ensure()
    if _stop_event is not None:
        _stop_event.set()
    if _after_stop is not None:
        threading.Thread(target=_after_stop, name="jarvis-restart-quit", daemon=True).start()
    else:
        threading.Timer(1.0, lambda: os._exit(0)).start()
    return {"ok": True, "message": "Redémarrage planifié (~3 s)"}
