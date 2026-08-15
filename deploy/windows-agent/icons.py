"""Extraction d'icônes .exe pour le panneau local (lazy + cache)."""

from __future__ import annotations

import hashlib
import logging
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.win.icons")


def _cache_dir() -> Path:
    from config import config_dir

    d = config_dir() / "icon-cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _icon_source_path(raw: str) -> Path | None:
    """Chemin utilisable pour SHGetFileInfo (exe/dll/ico/lnk)."""
    text = (raw or "").split(",")[0].strip().strip('"')
    if not text:
        return None
    p = Path(text)
    if not p.is_file():
        return None
    suf = p.suffix.lower()
    if suf in (".exe", ".dll", ".ico", ".lnk"):
        if suf == ".lnk" and sys.platform == "win32":
            try:
                from inventory import _resolve_lnk

                resolved = _resolve_lnk(p)
                if resolved and Path(resolved).is_file():
                    return Path(resolved)
            except Exception:  # noqa: BLE001
                pass
            return p  # icône du raccourci elle-même
        return p
    return None


def icon_png_for_app(app_id: str) -> Path | None:
    """Retourne un PNG en cache pour app_id, ou None."""
    try:
        from inventory import get_manager

        mgr = get_manager()
        app = next((a for a in mgr.apps if a.app_id == app_id), None)
        if not app or not app.exe:
            return None
        src = _icon_source_path(app.exe)
        if not src:
            return None
        key = hashlib.sha1(f"{app_id}|{src}|{src.stat().st_mtime_ns}".encode()).hexdigest()[:16]
        out = _cache_dir() / f"{app_id[:48]}_{key}.png"
        if out.is_file() and out.stat().st_size > 0:
            return out
        if _extract_png(src, out, size=48):
            return out
    except Exception as exc:  # noqa: BLE001
        logger.debug("icon_png_for_app: %s", exc)
    return None


def _extract_png(path: Path, out: Path, size: int = 32) -> bool:
    """Extrait l'icône Windows réelle du fichier (exe/lnk/ico/dll) → PNG."""
    if sys.platform != "win32":
        return False
    try:
        import ctypes
        from ctypes import wintypes

        from PIL import Image

        # Handles 64-bit (évite OverflowError sur HICON = c_int)
        HICON = ctypes.c_void_p
        HBITMAP = ctypes.c_void_p
        HDC = ctypes.c_void_p

        user32 = ctypes.WinDLL("user32", use_last_error=True)
        gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)
        shell32 = ctypes.WinDLL("shell32", use_last_error=True)

        if path.suffix.lower() == ".ico":
            img = Image.open(path).convert("RGBA")
            img = img.resize((size, size), Image.Resampling.LANCZOS)
            img.save(out, format="PNG")
            return out.is_file()

        class SHFILEINFO(ctypes.Structure):
            _fields_ = [
                ("hIcon", HICON),
                ("iIcon", ctypes.c_int),
                ("dwAttributes", wintypes.DWORD),
                ("szDisplayName", wintypes.WCHAR * 260),
                ("szTypeName", wintypes.WCHAR * 80),
            ]

        SHGFI_ICON = 0x000000100
        SHGFI_LARGEICON = 0x000000000
        shinfo = SHFILEINFO()
        shell32.SHGetFileInfoW.argtypes = [
            wintypes.LPCWSTR,
            wintypes.DWORD,
            ctypes.POINTER(SHFILEINFO),
            ctypes.c_uint,
            wintypes.UINT,
        ]
        shell32.SHGetFileInfoW.restype = ctypes.c_void_p
        ok = shell32.SHGetFileInfoW(
            str(path),
            0,
            ctypes.byref(shinfo),
            ctypes.sizeof(shinfo),
            SHGFI_ICON | SHGFI_LARGEICON,
        )
        hicon = shinfo.hIcon if ok else None

        if not hicon:
            large = (HICON * 1)()
            small = (HICON * 1)()
            shell32.ExtractIconExW.argtypes = [
                wintypes.LPCWSTR,
                ctypes.c_int,
                ctypes.POINTER(HICON),
                ctypes.POINTER(HICON),
                wintypes.UINT,
            ]
            shell32.ExtractIconExW.restype = wintypes.UINT
            n = shell32.ExtractIconExW(str(path), 0, large, small, 1)
            if not n:
                return False
            hicon = large[0] or small[0]
            if not hicon:
                return False

        # Dessine l'icône dans un bitmap 32-bit (fiable vs GetIconInfo overflow)
        hdc_screen = user32.GetDC(None)
        hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
        hbmp = gdi32.CreateCompatibleBitmap(hdc_screen, size, size)
        old = gdi32.SelectObject(hdc_mem, hbmp)
        # fond transparent / sombre
        brush = gdi32.CreateSolidBrush(0x00000000)
        rect = (ctypes.c_long * 4)(0, 0, size, size)
        user32.FillRect(hdc_mem, ctypes.byref(rect), brush)
        gdi32.DeleteObject(brush)
        user32.DrawIconEx.argtypes = [
            HDC,
            ctypes.c_int,
            ctypes.c_int,
            HICON,
            ctypes.c_int,
            ctypes.c_int,
            wintypes.UINT,
            HDC,
            wintypes.UINT,
        ]
        user32.DrawIconEx.restype = wintypes.BOOL
        DI_NORMAL = 0x0003
        user32.DrawIconEx(hdc_mem, 0, 0, hicon, size, size, 0, None, DI_NORMAL)

        class BITMAPINFOHEADER(ctypes.Structure):
            _fields_ = [
                ("biSize", wintypes.DWORD),
                ("biWidth", ctypes.c_long),
                ("biHeight", ctypes.c_long),
                ("biPlanes", wintypes.WORD),
                ("biBitCount", wintypes.WORD),
                ("biCompression", wintypes.DWORD),
                ("biSizeImage", wintypes.DWORD),
                ("biXPelsPerMeter", ctypes.c_long),
                ("biYPelsPerMeter", ctypes.c_long),
                ("biClrUsed", wintypes.DWORD),
                ("biClrImportant", wintypes.DWORD),
            ]

        class BITMAPINFO(ctypes.Structure):
            _fields_ = [("bmiHeader", BITMAPINFOHEADER), ("bmiColors", wintypes.DWORD * 3)]

        bmi = BITMAPINFO()
        bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.bmiHeader.biWidth = size
        bmi.bmiHeader.biHeight = -size
        bmi.bmiHeader.biPlanes = 1
        bmi.bmiHeader.biBitCount = 32
        bmi.bmiHeader.biCompression = 0
        buf = ctypes.create_string_buffer(size * size * 4)
        gdi32.GetDIBits.argtypes = [
            HDC,
            HBITMAP,
            wintypes.UINT,
            wintypes.UINT,
            ctypes.c_void_p,
            ctypes.POINTER(BITMAPINFO),
            wintypes.UINT,
        ]
        gdi32.GetDIBits(hdc_mem, hbmp, 0, size, buf, ctypes.byref(bmi), 0)

        gdi32.SelectObject(hdc_mem, old)
        gdi32.DeleteObject(hbmp)
        gdi32.DeleteDC(hdc_mem)
        user32.ReleaseDC(None, hdc_screen)
        user32.DestroyIcon(hicon)

        img = Image.frombuffer("RGBA", (size, size), bytes(buf), "raw", "BGRA", 0, 1).copy()
        img.save(out, format="PNG")
        return out.is_file() and out.stat().st_size > 0
    except Exception as exc:  # noqa: BLE001
        logger.debug("icon extract failed %s: %s", path, exc)
        return False


def host_snapshot() -> dict[str, Any]:
    """Infos hôte pour le panneau (lecture seule, pas de boucle agent)."""
    import getpass
    import platform
    import socket

    ips: list[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:  # noqa: BLE001
        pass
    if not ips:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            if ip and not ip.startswith("127."):
                ips.append(ip)
        except Exception:  # noqa: BLE001
            pass

    from config import agent_dir, config_dir

    cpu_count = None
    ram_gb = None
    boot = None
    try:
        import psutil

        cpu_count = psutil.cpu_count(logical=True)
        ram_gb = round(psutil.virtual_memory().total / (1024**3), 1)
        boot = float(psutil.boot_time())
    except Exception:  # noqa: BLE001
        pass

    release = platform.release()
    version = platform.version()
    ed = ""
    build_n = 0
    display = ""
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
        ) as key:
            ed = str(winreg.QueryValueEx(key, "ProductName")[0])
            build = str(winreg.QueryValueEx(key, "CurrentBuild")[0])
            try:
                build_n = int(build)
            except ValueError:
                build_n = 0
            try:
                display = str(winreg.QueryValueEx(key, "DisplayVersion")[0])
            except OSError:
                display = ""
            # Microsoft laisse souvent "Windows 10 Pro" dans ProductName sur Win11
            if build_n >= 22000:
                ed = ed.replace("Windows 10", "Windows 11")
                if "Windows 11" not in ed:
                    ed = "Windows 11 Pro" if "Pro" in ed else "Windows 11"
            if display:
                release = f"{display} (build {build})"
            else:
                release = f"{release} (build {build})"
    except Exception:  # noqa: BLE001
        pass

    machine = platform.machine() or ""
    arch_label = {
        "AMD64": "x64",
        "x86_64": "x64",
        "ARM64": "ARM64",
        "aarch64": "ARM64",
        "x86": "x86",
    }.get(machine, machine or "—")
    if machine and arch_label != machine:
        arch_display = f"{arch_label} ({machine})"
    else:
        arch_display = arch_label or "—"

    return {
        "hostname": platform.node() or socket.gethostname(),
        "os": "Windows",
        "os_family": "windows11" if build_n >= 22000 else "windows10",
        "os_product": ed or f"Windows {platform.release()}",
        "os_release": release,
        "os_version": version,
        "os_build": build_n or None,
        "arch": machine,
        "arch_label": arch_display,
        "python": platform.python_version(),
        "user": getpass.getuser(),
        "ips": ips,
        "primary_ip": ips[0] if ips else "",
        "cpu_count": cpu_count,
        "ram_total_gb": ram_gb,
        "boot_time": boot,
        "agent_dir": str(agent_dir()),
        "config_dir": str(config_dir()),
        "platform": platform.system().lower(),
    }
