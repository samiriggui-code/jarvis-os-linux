"""Métriques système réelles — l'inverse d'un cadran décoratif.

Le HUD affichait jusqu'ici un CPU et une RAM fabriqués par une marche
aléatoire (`SystemMonitor.generate()`), parce que le Core n'avait rien de vrai
à donner. Un chiffre inventé qui bouge joliment coûte la crédibilité de tous
les autres : si la charge CPU est fausse, pourquoi croire l'état des services ?

Séparé du superviseur exprès. Le superviseur répond « cette brique est-elle
vivante ? » — un booléen, avec hystérésis et backoff. Ici on répond « où en
est la machine ? » — des valeurs continues, échantillonnées lentement. Les
mélanger aurait forcé `register()` à accepter autre chose qu'un `check() -> bool`.

Sans `psutil`, ce module se tait : conformément à la règle du superviseur,
« mieux vaut pas de ligne qu'une ligne éternellement fausse ».
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import time
from typing import Any, Callable

logger = logging.getLogger("jarvis.metrics")


def host_id() -> str:
    """Qui parle. Sans ça, « cpu 47 % » ne veut rien dire.

    Le HUD est destiné au NUC et agrège tout l'écosystème — NUC, VPS, Pi,
    ProLiant, portable. Le Core mesure la machine sur laquelle il tourne (le
    NUC en production) ; les autres hôtes poussent les leurs par leur agent,
    en connexion **sortante** vers le Core, jamais l'inverse.

    Ce champ existe donc dès le premier relevé, alors même qu'il n'y a qu'un
    seul émetteur : l'ajouter plus tard casserait le format côté HUD.
    """
    return os.environ.get("JARVIS_HOST_ID") or socket.gethostname().lower()


def host_role() -> str:
    """`core`, `vps`, `pi`, `proliant`, `agent`… — cf. skill ecosystem-hosts."""
    return os.environ.get("JARVIS_HOST_ROLE", "core")

try:
    import psutil
except ImportError:  # noqa: BLE001 — le Core doit démarrer sans
    psutil = None  # type: ignore[assignment]

AVAILABLE = psutil is not None

# Cadence : assez lent pour être invisible en CPU, assez vif pour qu'une
# rafale se voie. Le bus coalesce de toute façon, rien ne s'empile.
DEFAULT_INTERVAL_S = 2.0

NOMINAL, ELEVATED, HIGH, CRITICAL = "nominal", "elevated", "high", "critical"


def _pressure(value: float, soft: float, hard: float) -> float:
    """0 sous `soft`, 1 au-dessus de `hard`, linéaire entre les deux."""
    if hard <= soft:
        return 1.0 if value >= hard else 0.0
    return max(0.0, min(1.0, (value - soft) / (hard - soft)))


def threat_score(
    *,
    cpu: float,
    ram: float,
    disk: float,
    degraded: int = 0,
) -> tuple[int, str]:
    """Indice de menace 0-100 + palier, à partir de mesures réelles.

    Les poids ne sont pas arbitraires :

    · **Disque** le plus lourd. `docs/RECOVERY.md` le dit sans détour à propos
      de `df -h` : « cause n°1 des pannes mystérieuses ». Un disque plein ne
      ralentit pas, il casse — logs, SQLite, cache vocal, tout d'un coup.
    · **RAM** ensuite. Une fois en swap, la machine ne ralentit pas non plus,
      elle se fige, et le watchdog systemd tue le Core.
    · **CPU** en dernier. Un pic à 100 % pendant qu'Ollama répond est normal
      et transitoire — le compter fort ferait clignoter l'alerte en continu,
      et une alerte qui crie tout le temps ne veut plus rien dire.
    · **Briques dégradées** : le superviseur sait déjà ce qui est mort. Une
      seule brique à terre pèse plus qu'un CPU chaud.
    """
    parts = (
        _pressure(disk, 80.0, 95.0) * 1.00,
        _pressure(ram, 75.0, 95.0) * 0.85,
        _pressure(cpu, 85.0, 99.0) * 0.55,
        min(degraded, 3) / 3.0 * 0.90,
    )
    score = int(round(max(parts) * 100))

    if score >= 75:
        level = CRITICAL
    elif score >= 50:
        level = HIGH
    elif score >= 25:
        level = ELEVATED
    else:
        level = NOMINAL
    return score, level


def top_processes(limit: int = 4) -> list[dict[str, Any]]:
    """Les plus gros consommateurs de mémoire, réellement.

    Classés par mémoire et non par CPU : `cpu_percent()` par processus exige
    deux relevés espacés pour valoir quelque chose, et le premier passage
    renverrait 0.0 pour tout le monde — soit un classement faux. La mémoire
    est exacte au premier appel.
    """
    if psutil is None:
        return []
    out: list[dict[str, Any]] = []
    for proc in psutil.process_iter(["name", "memory_info"]):
        try:
            info = proc.info
            rss = getattr(info.get("memory_info"), "rss", 0) or 0
            if rss <= 0:
                continue
            out.append({"name": info.get("name") or "?", "mem_mb": int(rss / 1e6)})
        except (psutil.NoSuchProcess, psutil.AccessDenied, AttributeError):
            # Un processus qui meurt pendant l'itération est banal : on le
            # saute, on n'abandonne pas le relevé.
            continue
    out.sort(key=lambda p: p["mem_mb"], reverse=True)
    return out[:limit]


def sample(*, degraded: int = 0, path: str = "/") -> dict[str, Any] | None:
    """Un relevé, ou None si psutil est absent. Bloquant : appeler hors boucle."""
    if psutil is None:
        return None

    cpu = float(psutil.cpu_percent(interval=None))
    vm = psutil.virtual_memory()

    try:
        du = psutil.disk_usage(path)
        disk_pct = float(du.percent)
        disk_used = round(du.used / 1e9, 1)
        disk_total = round(du.total / 1e9, 1)
    except (OSError, ValueError):
        # Chemin absent (conteneur, montage démonté) : pas de chiffre inventé.
        disk_pct = disk_used = disk_total = 0.0

    score, level = threat_score(cpu=cpu, ram=vm.percent, disk=disk_pct, degraded=degraded)

    return {
        "host": host_id(),
        "role": host_role(),
        "processes": top_processes(),
        "cpu": round(cpu, 1),
        "ram": round(float(vm.percent), 1),
        "ram_used_gb": round(vm.used / 1e9, 1),
        "ram_total_gb": round(vm.total / 1e9, 1),
        "disk": round(disk_pct, 1),
        "disk_used_gb": disk_used,
        "disk_total_gb": disk_total,
        "uptime_s": int(max(0.0, time.time() - psutil.boot_time())),
        "degraded": degraded,
        "threat": score,
        "threat_level": level,
    }


class MetricsSampler:
    """Publie `SYSTEM_METRICS` sur le bus, à cadence fixe.

    Ne lève jamais : une machine qui refuse de dire sa charge ne doit pas
    emporter le Core avec elle.
    """

    def __init__(
        self,
        emit: Callable[[str, dict[str, Any]], Any],
        *,
        interval_s: float = DEFAULT_INTERVAL_S,
        degraded_count: Callable[[], int] | None = None,
        disk_path: str = "/",
    ) -> None:
        self._emit = emit
        self.interval_s = interval_s
        self._degraded_count = degraded_count
        self._disk_path = disk_path
        self.last: dict[str, Any] | None = None
        self.samples = 0

    def _degraded(self) -> int:
        if self._degraded_count is None:
            return 0
        try:
            return int(self._degraded_count())
        except Exception:  # noqa: BLE001
            return 0

    async def run(self) -> None:
        if not AVAILABLE:
            logger.info("psutil absent — aucune métrique système publiée")
            return

        # cpu_percent(interval=None) mesure DEPUIS L'APPEL PRÉCÉDENT : le tout
        # premier renvoie 0.0. L'amorcer ici évite d'afficher « CPU 0 % » au
        # boot, ce qui est faux et se remarque.
        await asyncio.to_thread(psutil.cpu_percent, None)
        logger.info("métriques système actives · toutes les %.0f s", self.interval_s)

        while True:
            await asyncio.sleep(self.interval_s)
            try:
                data = await asyncio.to_thread(
                    sample, degraded=self._degraded(), path=self._disk_path
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("relevé système échoué : %s", exc)
                continue
            if data is None:
                return
            self.last = data
            self.samples += 1
            self._emit("SYSTEM_METRICS", data)

    def status(self) -> dict[str, Any]:
        return {"available": AVAILABLE, "samples": self.samples, "last": self.last}
