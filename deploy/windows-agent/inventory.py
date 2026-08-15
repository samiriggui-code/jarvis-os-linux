"""Inventaire logiciel Windows — scan complet, diff, push caps au Core (P4+)."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from agent_lib import SoftwareCapability

logger = logging.getLogger("jarvis.win.inventory")

_SKIP_NAME_RE = re.compile(
    r"(microsoft visual c\+\+|windows sdk|update for|redistributable|"
    r"^KB\d+|security update|hotfix|language pack|"
    r"diagnostics hub|web deploy|clickonce|vc_redist)",
    re.I,
)

_SKIP_EXE_RE = re.compile(
    r"(uninstall|setup|update|crash|helper|installer|unins\d*)",
    re.I,
)

_GUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.I,
)

_MAX_APPS = int(os.environ.get("JARVIS_INVENTORY_MAX", "500"))
_SCAN_APPX = os.environ.get("JARVIS_INVENTORY_APPX", "1").lower() in ("1", "true", "yes")
_SCAN_PROGRAM_DIRS = os.environ.get("JARVIS_INVENTORY_PROGRAM_DIRS", "1").lower() in (
    "1",
    "true",
    "yes",
)

# Sans ça, chaque `powershell` flash une console → cascade de terminaux.
_CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000) if sys.platform == "win32" else 0


def _run_powershell(script: str, *, timeout: float = 30) -> subprocess.CompletedProcess[str]:
    """PowerShell 100 % silencieux (aucun terminal)."""
    return subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        creationflags=_CREATE_NO_WINDOW,
    )


class AppLaunchError(Exception):
    def __init__(self, message: str, *, code: str = "launch_failed") -> None:
        super().__init__(message)
        self.code = code


@dataclass
class InstalledApp:
    app_id: str
    display_name: str
    exe: str = ""
    install_location: str = ""
    publisher: str = ""
    version: str = ""
    source: str = "registry"
    launchable: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_software_capability(self) -> SoftwareCapability:
        meta = {
            "display_name": self.display_name,
            "publisher": self.publisher,
            "version": self.version,
            "source": self.source,
            "launchable": self.launchable,
            **self.metadata,
        }
        if self.exe:
            meta["exe"] = self.exe
        if self.install_location:
            meta["install_location"] = self.install_location
        return SoftwareCapability(
            app_id=self.app_id,
            display_name=self.display_name,
            metadata=meta,
        )


@dataclass
class InventoryDiff:
    added: list[InstalledApp] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.added or self.removed)


@dataclass
class InventorySnapshot:
    apps: list[InstalledApp]
    fingerprint: str
    running: dict[str, Any]
    diff: InventoryDiff | None = None


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFD", str(name or "").lower().strip())
    folded = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    slug = re.sub(r"[^a-z0-9]+", "-", folded).strip("-")
    return (slug[:48] or "app").strip("-")


def _dedupe_id(base: str, seen: set[str]) -> str:
    if base not in seen:
        seen.add(base)
        return base
    suffix = hashlib.sha1(base.encode("utf-8")).hexdigest()[:6]
    candidate = f"{base[:40]}-{suffix}" if len(base) > 40 else f"{base}-{suffix}"
    seen.add(candidate)
    return candidate


def _clean_exe(raw: str) -> str:
    text = str(raw or "").strip().strip('"')
    if not text:
        return ""
    if "," in text:
        text = text.split(",", 1)[0].strip().strip('"')
    path = Path(text)
    if path.suffix.lower() == ".ico":
        exe_guess = path.with_suffix(".exe")
        if exe_guess.is_file():
            return str(exe_guess)
    if path.is_file() and path.suffix.lower() in (".exe", ".bat", ".cmd"):
        return str(path)
    if path.is_dir():
        return _find_exe_in_dir(str(path), path.name)
    return ""


def _find_exe_in_dir(directory: str, name_hint: str = "") -> str:
    root = Path(directory)
    if not root.is_dir():
        return ""
    candidates: list[Path] = []
    try:
        for exe in root.rglob("*.exe"):
            if exe.name.lower() in ("uninstall.exe", "unins000.exe"):
                continue
            if _SKIP_EXE_RE.search(exe.stem):
                continue
            candidates.append(exe)
            if len(candidates) >= 12:
                break
    except OSError:
        return ""
    if not candidates:
        return ""
    hint = slugify(name_hint).replace("-", "")
    for exe in candidates:
        if hint and hint in exe.stem.lower().replace("-", ""):
            return str(exe)
    return str(candidates[0])


def _resolve_lnk(path: Path) -> str:
    """Résout un .lnk → .exe. Utilisé au lancement seulement — pas pendant le scan menu."""
    if sys.platform != "win32" or not path.is_file():
        return ""
    try:
        import win32com.client  # type: ignore[import-untyped]

        shell = win32com.client.Dispatch("WScript.Shell")
        target = str(shell.CreateShortCut(str(path)).Targetpath or "").strip()
        if target.lower().endswith(".exe") and Path(target).is_file():
            return target
    except Exception:
        pass
    # Fallback silencieux (jamais de fenêtre). Un seul appel — pas dans une boucle de scan.
    try:
        safe = str(path).replace("'", "''")
        out = _run_powershell(
            f"(New-Object -ComObject WScript.Shell).CreateShortcut('{safe}').TargetPath",
            timeout=8,
        )
        target = (out.stdout or "").strip()
        if target.lower().endswith(".exe") and Path(target).is_file():
            return target
    except Exception:
        pass
    return ""


def _scan_registry() -> list[dict[str, str]]:
    if sys.platform != "win32":
        return []
    import winreg

    roots = (
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    )
    rows: list[dict[str, str]] = []
    for hive, subkey in roots:
        try:
            with winreg.OpenKey(hive, subkey) as key:
                for i in range(winreg.QueryInfoKey(key)[0]):
                    try:
                        sub_name = winreg.EnumKey(key, i)
                        with winreg.OpenKey(key, sub_name) as app_key:
                            row: dict[str, str] = {"_key": sub_name}
                            for j in range(winreg.QueryInfoKey(app_key)[1]):
                                name, value, _ = winreg.EnumValue(app_key, j)
                                if isinstance(value, str):
                                    row[str(name)] = value
                            rows.append(row)
                    except OSError:
                        continue
        except OSError:
            continue
    return rows


def _scan_start_menu() -> list[InstalledApp]:
    if sys.platform != "win32":
        return []
    apps: list[InstalledApp] = []
    seen: set[str] = set()
    roots = [
        Path(os.environ.get("ProgramData", "")) / "Microsoft/Windows/Start Menu/Programs",
        Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs",
    ]
    for root in roots:
        if not root.is_dir():
            continue
        for lnk in root.rglob("*.lnk"):
            name = lnk.stem.strip()
            if not name or _SKIP_NAME_RE.search(name):
                continue
            # Ne PAS résoudre chaque .lnk via PowerShell ici (= N fenêtres / cascade).
            # Le lancement passe par os.startfile / _resolve_lnk au moment du click.
            app_id = _dedupe_id(slugify(name), seen)
            apps.append(
                InstalledApp(
                    app_id=app_id,
                    display_name=name,
                    exe=str(lnk),
                    source="start_menu",
                    launchable=True,
                    metadata={"shortcut": str(lnk)},
                )
            )
    return apps


def _scan_appx() -> list[InstalledApp]:
    if sys.platform != "win32" or not _SCAN_APPX:
        return []
    try:
        out = _run_powershell(
            "Get-AppxPackage | Where-Object { $_.IsFramework -eq $false } "
            "| Select-Object Name, InstallLocation, Publisher, Version "
            "| ConvertTo-Json -Compress",
            timeout=90,
        )
        raw = (out.stdout or "").strip()
        if not raw:
            return []
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            parsed = [parsed]
        if not isinstance(parsed, list):
            return []
    except Exception as exc:
        logger.debug("appx scan skip: %s", exc)
        return []

    seen: set[str] = set()
    apps: list[InstalledApp] = []
    for row in parsed:
        if not isinstance(row, dict):
            continue
        name = str(row.get("Name") or "").strip()
        if not name or name.lower().startswith("microsoft."):
            continue
        display = name.split(".")[-1].replace("_", " ").strip() or name
        if (
            len(display) < 3
            or _GUID_RE.match(display)
            or _SKIP_NAME_RE.search(display)
            or re.fullmatch(r"[0-9\-x]+", display, re.I)
        ):
            continue
        install = str(row.get("InstallLocation") or "").strip()
        exe = _find_exe_in_dir(install, display) if install else ""
        app_id = _dedupe_id(slugify(display), seen)
        apps.append(
            InstalledApp(
                app_id=app_id,
                display_name=display,
                exe=exe,
                install_location=install,
                publisher=str(row.get("Publisher") or "").strip(),
                version=str(row.get("Version") or "").strip(),
                source="appx",
                launchable=bool(exe),
                metadata={"package": name},
            )
        )
    return apps


def _scan_program_directories() -> list[InstalledApp]:
    if sys.platform != "win32" or not _SCAN_PROGRAM_DIRS:
        return []
    roots = [
        Path(os.environ.get("ProgramFiles", "")),
        Path(os.environ.get("ProgramFiles(x86)", "")),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs",
    ]
    seen: set[str] = set()
    apps: list[InstalledApp] = []
    for root in roots:
        if not root.is_dir():
            continue
        try:
            for child in root.iterdir():
                if not child.is_dir():
                    continue
                exe = _find_exe_in_dir(str(child), child.name)
                if not exe:
                    continue
                name = child.name.strip()
                if _SKIP_NAME_RE.search(name):
                    continue
                app_id = _dedupe_id(slugify(name), seen)
                apps.append(
                    InstalledApp(
                        app_id=app_id,
                        display_name=name,
                        exe=exe,
                        install_location=str(child),
                        source="program_files",
                        launchable=True,
                    )
                )
        except OSError:
            continue
    return apps


def _running_snapshot() -> dict[str, Any]:
    out: dict[str, Any] = {"running_count": 0, "running_apps": []}
    try:
        import psutil

        names: dict[str, str] = {}
        for proc in psutil.process_iter(["name", "exe"]):
            try:
                info = proc.info
                exe = str(info.get("exe") or "")
                name = str(info.get("name") or Path(exe).name if exe else "")
                if not name or name.lower() in ("system idle process",):
                    continue
                names[name.lower()] = exe
            except (psutil.Error, KeyError):
                continue
        out["running_count"] = len(names)
        out["running_apps"] = sorted(names.keys())[:80]
    except ImportError:
        pass
    except Exception as exc:
        logger.debug("running snapshot skip: %s", exc)
    return out


def compute_fingerprint(apps: Iterable[InstalledApp]) -> str:
    parts = sorted(
        f"{a.app_id}|{a.version}|{a.exe}|{int(a.launchable)}"
        for a in apps
    )
    digest = hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()
    return f"sha256:{digest[:16]}"


def diff_inventory(
    previous: list[InstalledApp], current: list[InstalledApp]
) -> InventoryDiff:
    old_ids = {a.app_id for a in previous}
    new_ids = {a.app_id for a in current}
    return InventoryDiff(
        added=[a for a in current if a.app_id not in old_ids],
        removed=sorted(old_ids - new_ids),
    )


def scan_installed_apps(*, full: bool = True) -> list[InstalledApp]:
    """Scan complet ou partiel (registre + menu ; full += appx + Program Files)."""
    seen_ids: set[str] = set()
    by_id: dict[str, InstalledApp] = {}

    for row in _scan_registry():
        name = str(row.get("DisplayName") or "").strip()
        if not name or _SKIP_NAME_RE.search(name):
            continue
        app_id = _dedupe_id(slugify(name), seen_ids)
        install_loc = str(row.get("InstallLocation") or "").strip()
        exe = _clean_exe(str(row.get("DisplayIcon") or ""))
        if not exe and install_loc:
            exe = _find_exe_in_dir(install_loc, name)
        launchable = bool(
            exe
            and (
                Path(exe.split(",")[0].strip().strip('"')).exists()
                if not exe.lower().endswith(".lnk")
                else True
            )
        )
        app = InstalledApp(
            app_id=app_id,
            display_name=name,
            exe=exe,
            install_location=install_loc,
            publisher=str(row.get("Publisher") or "").strip(),
            version=str(row.get("DisplayVersion") or "").strip(),
            source="registry",
            launchable=launchable,
        )
        prev = by_id.get(app_id)
        if prev is None or (app.launchable and not prev.launchable):
            by_id[app_id] = app

    for app in _scan_start_menu():
        prev = by_id.get(app.app_id)
        if prev is None:
            by_id[app.app_id] = app
        elif app.launchable and not prev.launchable:
            by_id[app.app_id] = app

    if full:
        for app in _scan_appx() + _scan_program_directories():
            prev = by_id.get(app.app_id)
            if prev is None:
                by_id[app.app_id] = app
            elif app.launchable and not prev.launchable:
                by_id[app.app_id] = app

    apps = list(by_id.values())
    apps.sort(key=lambda a: (not a.launchable, a.display_name.lower()))
    return apps[:_MAX_APPS]


def host_capabilities_from_inventory(
    apps: Iterable[InstalledApp],
    *,
    running: dict[str, Any] | None = None,
    fingerprint: str = "",
    diff: InventoryDiff | None = None,
) -> list[dict[str, Any]]:
    app_list = list(apps)
    launchable = [a for a in app_list if a.launchable]
    allowed = [a.app_id for a in launchable]
    running = running or {}

    inv_meta: dict[str, Any] = {
        "status": "implemented",
        "total_apps": len(app_list),
        "launchable_apps": len(launchable),
        "platform": "windows",
        "fingerprint": fingerprint,
        "running_count": running.get("running_count", 0),
    }
    if diff and diff.changed:
        inv_meta["added"] = [a.app_id for a in diff.added[:20]]
        inv_meta["removed"] = list(diff.removed[:20])

    caps: list[dict[str, Any]] = [
        {
            "capability_id": "system.inventory",
            "name": "inventory",
            "value": True,
            "metadata": inv_meta,
        },
        {
            "capability_id": "app.launch",
            "name": "app_launch",
            "value": bool(launchable),
            # Handler toujours présent (status=implemented) — `value` reflète
            # seulement s'il y a au moins une app lançable maintenant. Ne pas
            # confondre « capacité codée » et « utilisable là, tout de suite ».
            "metadata": {"status": "implemented", "allowed_apps": allowed},
        },
        {
            "capability_id": "shell.execute",
            "name": "shell",
            "value": False,
            "metadata": {"status": "planned", "owner_target": "device"},
        },
        {
            "capability_id": "filesystem.browse",
            "name": "filesystem",
            "value": False,
            "metadata": {"status": "planned", "owner_target": "device"},
        },
    ]

    try:
        from metrics import metrics_capability

        caps.insert(1, metrics_capability())
    except Exception as exc:  # noqa: BLE001
        logger.warning("system.metrics skip: %s", exc)

    for app in app_list:
        soft = app.to_software_capability()
        caps.append(
            {
                "capability_id": f"app.software.{soft.app_id}",
                "name": soft.app_id,
                "value": app.launchable,
                "metadata": dict(soft.metadata),
            }
        )
    return caps


class InventoryManager:
    """Scan + diff — pousse les nouvelles caps quand une app est installée."""

    def __init__(self) -> None:
        self._apps: list[InstalledApp] = []
        self._fingerprint = ""
        self._full_counter = 0
        self.last_diff: InventoryDiff | None = None
        self.last_running: dict[str, Any] = {}

    def refresh(self, *, force_full: bool = False) -> bool:
        self._full_counter += 1
        full = force_full or self._full_counter == 1 or self._full_counter % 6 == 0
        started = time.monotonic()
        apps = scan_installed_apps(full=full)
        running = _running_snapshot()
        fp = compute_fingerprint(apps)
        diff = diff_inventory(self._apps, apps) if self._apps else InventoryDiff(added=apps)
        changed = fp != self._fingerprint or diff.changed

        logger.info(
            "INVENTORY · scan=%s · changed=%s · apps=%d · %.0fms",
            "full" if full else "partial",
            changed,
            len(apps),
            (time.monotonic() - started) * 1000,
        )

        if changed:
            if diff.added:
                logger.info(
                    "inventory +%d apps: %s",
                    len(diff.added),
                    ", ".join(a.display_name for a in diff.added[:5]),
                )
            if diff.removed:
                logger.info("inventory -%d apps", len(diff.removed))
            self.last_diff = diff
        else:
            self.last_diff = None

        self._apps = apps
        self._fingerprint = fp
        self.last_running = running
        global _CACHE
        _CACHE = list(apps)
        return changed

    @property
    def apps(self) -> list[InstalledApp]:
        return list(self._apps)

    def capabilities_payload(self) -> list[dict[str, Any]]:
        return host_capabilities_from_inventory(
            self._apps,
            running=self.last_running,
            fingerprint=self._fingerprint,
            diff=self.last_diff,
        )


_CACHE: list[InstalledApp] = []
_MANAGER = InventoryManager()


def refresh_cache(*, force_full: bool = False) -> list[InstalledApp]:
    _MANAGER.refresh(force_full=force_full)
    return list(_MANAGER.apps)


def cached_apps() -> list[InstalledApp]:
    if not _MANAGER.apps:
        refresh_cache(force_full=True)
    return list(_MANAGER.apps)


def get_manager() -> InventoryManager:
    return _MANAGER


def resolve_launch(app_id: str) -> InstalledApp | None:
    app_id = str(app_id or "").strip().lower()
    for app in cached_apps():
        if app.app_id == app_id and app.launchable:
            return app
    return None


def launch(app_id: str) -> dict[str, Any]:
    app = resolve_launch(app_id)
    if app is None:
        raise AppLaunchError(f"{app_id} introuvable ou non lançable", code="app_not_found")

    target = app.exe
    if not target:
        raise AppLaunchError(f"{app_id} sans exécutable", code="app_not_found")

    path = Path(target.split(",")[0].strip().strip('"'))
    if path.suffix.lower() == ".lnk" and sys.platform == "win32":
        resolved = _resolve_lnk(path)
        if resolved:
            path = Path(resolved)
        else:
            os.startfile(str(path))  # type: ignore[attr-defined]
            return {
                "app_id": app.app_id,
                "display_name": app.display_name,
                "pid": 0,
                "exe": str(path),
                "via": "shell_link",
            }

    if not path.is_file():
        raise AppLaunchError(f"exe introuvable : {path}", code="app_not_found")

    proc = subprocess.Popen(
        [str(path)],
        shell=False,
        cwd=str(path.parent) if path.parent.is_dir() else None,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return {
        "app_id": app.app_id,
        "display_name": app.display_name,
        "pid": proc.pid,
        "exe": str(path),
        "simulated": False,
    }
