"""Mutex process Windows — une seule instance de l'agent long-lived.

ctypes only (pas de pywin32). Le handle reste ouvert jusqu'à la fin du process ;
Windows le libère à la mort du processus.
"""

from __future__ import annotations

import ctypes
import logging
import sys
from ctypes import wintypes

logger = logging.getLogger("jarvis.win.agent")

# Local\ = session utilisateur (pas besoin d'admin, contrairement à Global\).
MUTEX_NAME = "Local\\JARVIS_WindowsAgent_SingleInstance"
ERROR_ALREADY_EXISTS = 183

_handle: wintypes.HANDLE | None = None


def try_acquire() -> bool:
    """Acquiert le mutex nommé. False = une autre instance détient déjà le lock."""
    global _handle
    if sys.platform != "win32":
        return True

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
    kernel32.CreateMutexW.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL

    kernel32.SetLastError(0)
    handle = kernel32.CreateMutexW(None, False, MUTEX_NAME)
    if not handle:
        err = ctypes.get_last_error()
        logger.error("CreateMutex échoué (err=%s) — refus de démarrer", err)
        return False

    if ctypes.get_last_error() == ERROR_ALREADY_EXISTS:
        kernel32.CloseHandle(handle)
        return False

    _handle = handle
    return True
