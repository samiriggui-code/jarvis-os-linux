"""SSH sortant vers VPS / Pi salon — Terminal admin (Dashboard).

Pas de nouvelle dépendance : le client `ssh` système, comme le fait déjà
`deploy/scripts/sync-to-nuc.sh`. Une clé dédiée par cible (jamais celles du
poste de dev), configurée par variable d'env — voir `core/.env.example`.

Si une clé n'est pas configurée, on le dit explicitement plutôt que de
tenter une connexion qui échouera en silence côté utilisateur : pas de faux
succès, jamais.
"""
from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass

CONNECT_TIMEOUT_S = 8
RUN_TIMEOUT_S = 20


@dataclass
class RemoteResult:
    ok: bool
    output: str = ""
    error: str = ""
    returncode: int | None = None


@dataclass(frozen=True)
class _HostConfig:
    host: str
    user: str
    key: str


def _config(target: str) -> _HostConfig | None:
    prefix = {"vps": "JARVIS_VPS_SSH", "pi": "JARVIS_PI_SSH"}.get(target)
    if prefix is None:
        return None
    host = os.environ.get(f"{prefix}_HOST", "").strip()
    user = os.environ.get(f"{prefix}_USER", "").strip()
    key = os.environ.get(f"{prefix}_KEY", "").strip()
    if not host or not user or not key:
        return None
    return _HostConfig(host=host, user=user, key=key)


async def run(target: str, command: str) -> RemoteResult:
    """Exécute `command` sur `target` (``"vps"`` ou ``"pi"``) via SSH.

    N'évalue AUCUNE Policy ici — c'est fait avant, par l'appelant. Ce module
    ne fait qu'une chose : parler SSH, honnêtement.
    """
    cfg = _config(target)
    if cfg is None:
        return RemoteResult(
            ok=False,
            error=(
                f"Clé SSH non configurée pour « {target} » — "
                f"JARVIS_{target.upper()}_SSH_HOST/_USER/_KEY absents de core/.env."
            ),
        )

    args = [
        "ssh",
        "-i", cfg.key,
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", f"ConnectTimeout={CONNECT_TIMEOUT_S}",
        f"{cfg.user}@{cfg.host}",
        "--",
        command,
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        return RemoteResult(ok=False, error="Client `ssh` introuvable sur cette machine.")

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=RUN_TIMEOUT_S)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return RemoteResult(
            ok=False,
            error=f"Délai dépassé ({RUN_TIMEOUT_S}s) — connexion ou commande trop longue.",
        )

    out = stdout.decode("utf-8", errors="replace")
    err = stderr.decode("utf-8", errors="replace")
    return RemoteResult(ok=proc.returncode == 0, output=out, error=err, returncode=proc.returncode)
