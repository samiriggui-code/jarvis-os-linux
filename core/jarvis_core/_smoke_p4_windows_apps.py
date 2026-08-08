"""Smoke — inventaire Windows (scan local, sans WS)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2] / "deploy" / "windows-agent"
INVENTORY = ROOT / "inventory.py"


def check(label: str, cond: bool, detail: str = "") -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not cond:
        raise SystemExit(1)


def main() -> int:
    print("P4 — Windows inventory scan")
    sys.path.insert(0, str(ROOT))

    lib_spec = importlib.util.spec_from_file_location("agent_lib", ROOT / "agent_lib.py")
    assert lib_spec and lib_spec.loader
    lib_mod = importlib.util.module_from_spec(lib_spec)
    sys.modules["agent_lib"] = lib_mod
    lib_spec.loader.exec_module(lib_mod)

    spec = importlib.util.spec_from_file_location("jarvis_win_inventory", INVENTORY)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["jarvis_win_inventory"] = mod
    spec.loader.exec_module(mod)

    mgr = mod.get_manager()
    mgr.refresh(force_full=True)
    check("InventoryManager refresh", len(mgr.apps) >= 1, str(len(mgr.apps)))
    changed = mgr.refresh()
    check("partial refresh stable", changed is False or mgr.last_diff is not None)

    apps = mgr.apps
    check("scan returns list", isinstance(apps, list))
    check("at least 1 app", len(apps) >= 1, str(len(apps)))
    launchable = [a for a in apps if a.launchable]
    check("some launchable", len(launchable) >= 1, str(len(launchable)))

    caps = mod.host_capabilities_from_inventory(apps)
    check("system.inventory cap", any(c.get("capability_id") == "system.inventory" for c in caps))
    check("app.launch cap", any(c.get("capability_id") == "app.launch" for c in caps))
    soft = [c for c in caps if str(c.get("capability_id", "")).startswith("app.software.")]
    check("software caps", len(soft) == len(apps), f"{len(soft)} vs {len(apps)}")

    cursor = mod.resolve_launch("cursor")
    if cursor is None:
        for app in apps:
            if "cursor" in app.app_id or "cursor" in app.display_name.lower():
                cursor = app
                break
    if cursor is not None:
        check("cursor in inventory", cursor.launchable, cursor.app_id)
    else:
        print("  [SKIP] cursor not in inventory on this machine")

    print("\nALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
