"""Métriques machine Windows — sonde locale (pas Hermes)."""

from __future__ import annotations

import logging
import platform
import time
from typing import Any

logger = logging.getLogger("jarvis.win.metrics")

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore[assignment]


def sample_metrics() -> dict[str, Any]:
    """Échantillon CPU/RAM/disque — valeurs réelles ou état « non branché »."""
    out: dict[str, Any] = {
        "platform": platform.system().lower(),
        "hostname": platform.node(),
        "ts": time.time(),
    }
    if psutil is None:
        out["ok"] = False
        out["error"] = "psutil manquant — pip install psutil"
        return out

    try:
        disk = psutil.disk_usage("C:\\" if platform.system() == "Windows" else "/")
        vm = psutil.virtual_memory()
        out.update(
            {
                "ok": True,
                "cpu_percent": float(psutil.cpu_percent(interval=0.15)),
                "ram_percent": float(vm.percent),
                "ram_total_gb": round(vm.total / (1024**3), 2),
                "disk_percent": float(disk.percent),
                "disk_total_gb": round(disk.total / (1024**3), 2),
                "boot_time": float(psutil.boot_time()),
                "process_count": int(len(psutil.pids())),
            }
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("sample_metrics failed: %s", exc)
        out["ok"] = False
        out["error"] = str(exc)
    return out


def metrics_capability(sample: dict[str, Any] | None = None) -> dict[str, Any]:
    meta = dict(sample if sample is not None else sample_metrics())
    ok = bool(meta.get("ok"))
    # Handler implémenté ; "unavailable" seulement si psutil manque / échoue
    # à l'instant T — jamais annoncé disponible sans données réelles derrière.
    meta["status"] = "implemented" if ok else "unavailable"
    return {
        "capability_id": "system.metrics",
        "name": "metrics",
        "value": ok,
        "metadata": meta,
    }
