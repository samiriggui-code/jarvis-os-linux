"""Architecture Awareness — Code Map (vérité structurelle du repo).

Module frère de `snapshot()` (vérité runtime) — PAS une extension du D1.
`snapshot()` ne fait aucun scan filesystem (voir schema.py / limitations
"d1_sync_snapshot_no_network_probes") ; `code_map()` fait l'inverse : il
ne regarde QUE le filesystem, jamais le runtime (pas de devices_registry,
pas de supervisor, pas de réseau).

V1 — relation `contains` uniquement (process → directory → file). Pas
d'imports/calls/depends_on : ça viendra dans une passe ultérieure, une
fois cette hiérarchie filesystem validée.

Mapping des 9 process → repo réel : audité fichier par fichier avec Claude
(2026-08-14), 581/581 fichiers attribués, 0 ambigu. Voir la table
FILE_OVERRIDES / DIR_PREFIXES ci-dessous — c'est la source de vérité du
mapping, pas les anciens chiffres hardcodés de
`scripts/audit-neural-tier-budget.py` (désormais STALE — ce script a un
bug de calcul de ROOT qui le fait renvoyer des comptes à zéro).
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CODE_MAP_SCHEMA_VERSION = "1.0.0"

# code_map.py vit à core/jarvis_core/architecture/code_map.py — 3 niveaux
# sous la racine du repo.
ROOT = Path(__file__).resolve().parents[3]

PROD_ROOTS: tuple[str, ...] = ("core/jarvis_core", "hud/src", "dashboard/src", "deploy")
SOURCE_EXT = {".py", ".ts", ".tsx", ".yaml", ".yml", ".json", ".css"}
SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".next", "vendor", ".turbo", ".cache", "coverage", ".pytest_cache",
}

PROCESS_IDS: tuple[str, ...] = (
    "core", "hermes", "memory", "policy", "hud", "devices", "home", "voice", "vision",
)
PROCESS_LABELS: dict[str, str] = {
    "core": "CORE",
    "hermes": "HERMES",
    "memory": "MEMORY",
    "policy": "POLICY",
    "hud": "HUD",
    "devices": "DEVICES",
    "home": "HOME",
    "voice": "VOICE",
    "vision": "VISION",
}

# Exceptions fichier par fichier — priment sur DIR_PREFIXES. Auditées avec
# Claude le 2026-08-14 (executors/ mixte, fichiers vision/devices/home
# top-level de jarvis_core, policy.py, pi-salon, perception_dispatch.py,
# db/models.py).
# path relatif repo -> (primaryProcess, processRefs, role)
FILE_OVERRIDES: dict[str, tuple[str, tuple[str, ...], str | None]] = {
    "core/jarvis_core/executors/architecture.py": ("core", ("core",), None),
    "core/jarvis_core/executors/system.py": ("core", ("core",), None),
    "core/jarvis_core/executors/surfaces.py": ("core", ("core",), None),
    "core/jarvis_core/executors/device.py": ("devices", ("devices",), None),
    "core/jarvis_core/executors/home.py": ("home", ("home",), None),
    "core/jarvis_core/executors/memory.py": ("memory", ("memory",), None),
    "core/jarvis_core/executors/vision.py": ("vision", ("vision",), None),
    "core/jarvis_core/executors/camera.py": ("vision", ("vision",), None),
    "core/jarvis_core/executors/media.py": ("devices", ("devices",), None),
    "core/jarvis_core/gestures.py": ("vision", ("vision",), None),
    "core/jarvis_core/vision_objects.py": ("vision", ("vision",), None),
    "core/jarvis_core/camera_access.py": ("vision", ("vision",), None),
    "core/jarvis_core/perception_dispatch.py": (
        "vision",
        ("vision", "hud", "hermes"),
        "perception_capture_dispatch",
    ),
    "core/jarvis_core/devices.py": ("devices", ("devices",), None),
    "core/jarvis_core/device_software.py": ("devices", ("devices",), None),
    "core/jarvis_core/salon_player.py": ("devices", ("devices",), None),
    "core/jarvis_core/salon_ingest.py": ("devices", ("devices",), None),
    "core/jarvis_core/salon_speaker.py": ("devices", ("devices",), None),
    "core/jarvis_core/homeassistant.py": ("home", ("home",), None),
    "core/jarvis_core/plex.py": ("home", ("home",), None),
    "core/jarvis_core/policy.py": ("policy", ("policy",), None),
    "core/jarvis_core/db/models.py": ("core", ("core", "memory"), "shared_persistence"),
    "deploy/pi-salon/install_player_apps.py": ("devices", ("devices",), None),
    "deploy/pi-salon/install_player_apps2.py": ("devices", ("devices",), None),
    "deploy/pi-salon/jarvis_cam.py": ("vision", ("vision",), None),
    "deploy/pi-salon/jarvis_device_announce.py": ("devices", ("devices",), None),
    "deploy/pi-salon/jarvis_ear.py": ("voice", ("voice",), None),
}

# Préfixes de dossier — propriétaire par défaut de tout ce qui vit dessous
# (fichiers ET sous-dossiers), sauf override explicite ci-dessus. Premier
# match gagnant ; l'ordre n'a pas d'importance ici car les préfixes ne se
# chevauchent pas entre eux.
DIR_PREFIXES: tuple[tuple[str, str], ...] = (
    ("core/jarvis_core/hermes/", "hermes"),
    ("core/jarvis_core/memory/", "memory"),
    ("core/jarvis_core/voice/", "voice"),
    ("core/jarvis_core/personality/", "voice"),
    ("core/jarvis_core/vision/", "vision"),
    ("core/jarvis_core/holomat/", "vision"),
    ("core/jarvis_core/architecture/", "core"),
    ("core/jarvis_core/auth/", "core"),
    ("core/jarvis_core/db/", "core"),
    ("core/jarvis_core/intents/", "core"),
    ("core/jarvis_core/routing/", "core"),
    ("core/jarvis_core/surfaces/", "core"),
    ("core/jarvis_core/ws/", "core"),
    ("core/jarvis_core/missions/", "core"),
    ("core/jarvis_core/mission_dev/", "core"),
    ("core/jarvis_core/dev_agent/", "core"),
    ("core/jarvis_core/workspace/", "core"),
    ("core/jarvis_core/agents/", "core"),
    ("core/jarvis_core/executors/", "core"),
    ("hud/src/", "hud"),
    ("dashboard/src/", "hud"),
    ("deploy/hermes/", "hermes"),
    ("deploy/homeassistant/", "home"),
    ("deploy/vision-worker/", "vision"),
    ("deploy/windows-agent/", "devices"),
    ("deploy/pi-salon/", "devices"),
    ("deploy/bin/", "core"),
    ("deploy/manifests/", "core"),
    ("deploy/nginx/", "core"),
    ("deploy/scripts/", "core"),
    ("deploy/systemd/", "core"),
    ("deploy/traefik/", "core"),
    ("deploy/twingate/", "core"),
)

# Dossiers "application" à annoter explicitement (validé : HUD = plusieurs
# applications frontend, distinguables sans créer un 10e process).
DIR_ROLE: dict[str, str] = {
    "hud/src": "application:hud",
    "dashboard/src": "application:dashboard",
}


def _skip_dir(name: str) -> bool:
    return name in SKIP_DIRS or name.startswith("_") or name.startswith(".")


def _skip_file(name: str) -> bool:
    if name.startswith("_smoke_") or name.startswith("."):
        return True
    low = name.lower()
    if name in ("package-lock.json", "pnpm-lock.yaml", "yarn.lock"):
        return True
    if low.startswith("test_") or low.endswith("_test.py"):
        return True
    if low.endswith(".test.ts") or low.endswith(".test.tsx") or low.endswith(".spec.ts"):
        return True
    return False


def _classify_file(rel_path: str) -> tuple[str, tuple[str, ...], str | None]:
    """primaryProcess, processRefs, role pour un fichier scanné.

    Lève ValueError si aucune règle ne couvre le chemin — un scan ne doit
    jamais produire de fichier non attribué silencieusement.
    """
    override = FILE_OVERRIDES.get(rel_path)
    if override:
        return override
    for prefix, proc in DIR_PREFIXES:
        if rel_path.startswith(prefix):
            return proc, (proc,), None
    if rel_path.startswith("core/jarvis_core/") and "/" not in rel_path[len("core/jarvis_core/"):]:
        return "core", ("core",), None
    raise ValueError(f"code_map: fichier non attribuable — {rel_path}")


def _classify_dir(rel_dir: str) -> str | None:
    """Propriétaire par défaut d'un DOSSIER (pas d'override fichier ici).

    None = dossier "plomberie" mixte (ex. core/jarvis_core, hud, deploy
    bruts) — jamais matérialisé comme ArchitectureNode.
    """
    for prefix, proc in DIR_PREFIXES:
        if rel_dir == prefix.rstrip("/") or rel_dir.startswith(prefix):
            return proc
    return None


def _scan_files() -> list[str]:
    files: list[str] = []
    for rel_root in PROD_ROOTS:
        base = ROOT / rel_root
        if not base.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = sorted(d for d in dirnames if not _skip_dir(d))
            rp = Path(dirpath)
            for fn in sorted(filenames):
                if _skip_file(fn):
                    continue
                p = rp / fn
                if p.suffix.lower() in SOURCE_EXT:
                    files.append(p.relative_to(ROOT).as_posix())
    return sorted(files)


def _node_id(rel_path: str) -> str:
    return f"repo:{rel_path}"


@dataclass
class _Node:
    id: str
    name: str
    kind: str  # "process" | "directory" | "file"
    path: str | None
    parent_id: str | None
    depth: int
    primary_process: str | None
    process_refs: tuple[str, ...]
    role: str | None
    children: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "path": self.path,
            "parentId": self.parent_id,
            "depth": self.depth,
            "primaryProcess": self.primary_process,
            "processRefs": list(self.process_refs),
            "role": self.role,
            "children": list(self.children),
        }


def code_map() -> dict[str, Any]:
    """Compile l'ArchitectureGraph structurel — read-only, `contains` seul (V1).

    Aucun paramètre runtime (contrairement à `snapshot()`) : ce compilateur
    ne connaît que le filesystem du repo.
    """
    t0 = time.time()
    files = _scan_files()

    nodes: dict[str, _Node] = {}
    for pid in PROCESS_IDS:
        nodes[pid] = _Node(
            id=pid,
            name=PROCESS_LABELS[pid],
            kind="process",
            path=None,
            parent_id=None,
            depth=0,
            primary_process=pid,
            process_refs=(pid,),
            role=None,
        )

    def ensure_dir_chain(rel_dir: str, owner_proc: str) -> str:
        dir_id = _node_id(rel_dir)
        existing = nodes.get(dir_id)
        if existing is not None:
            return dir_id

        parent_dir = "/".join(rel_dir.split("/")[:-1])
        parent_owner = _classify_dir(parent_dir) if parent_dir else None
        if parent_dir and parent_owner == owner_proc:
            parent_id = ensure_dir_chain(parent_dir, owner_proc)
        else:
            parent_id = owner_proc

        depth = nodes[parent_id].depth + 1
        node = _Node(
            id=dir_id,
            name=rel_dir.split("/")[-1],
            kind="directory",
            path=rel_dir,
            parent_id=parent_id,
            depth=depth,
            primary_process=owner_proc,
            process_refs=(owner_proc,),
            role=DIR_ROLE.get(rel_dir),
        )
        nodes[dir_id] = node
        nodes[parent_id].children.append(dir_id)
        return dir_id

    for rel_path in files:
        proc, refs, role = _classify_file(rel_path)  # raises if truly unattributed
        rel_dir = "/".join(rel_path.split("/")[:-1])

        if rel_dir:
            dir_owner = _classify_dir(rel_dir) or proc
            parent_id = ensure_dir_chain(rel_dir, dir_owner)
        else:
            parent_id = proc

        file_id = _node_id(rel_path)
        depth = nodes[parent_id].depth + 1
        node = _Node(
            id=file_id,
            name=rel_path.split("/")[-1],
            kind="file",
            path=rel_path,
            parent_id=parent_id,
            depth=depth,
            primary_process=proc,
            process_refs=refs,
            role=role,
        )
        nodes[file_id] = node
        nodes[parent_id].children.append(file_id)

    stats_by_kind: dict[str, int] = {}
    stats_by_process: dict[str, int] = {}
    for n in nodes.values():
        stats_by_kind[n.kind] = stats_by_kind.get(n.kind, 0) + 1
        if n.kind == "file":
            stats_by_process[n.primary_process or "?"] = (
                stats_by_process.get(n.primary_process or "?", 0) + 1
            )

    return {
        "schemaVersion": CODE_MAP_SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "rootIds": list(PROCESS_IDS),
        "nodes": {nid: n.to_dict() for nid, n in nodes.items()},
        "stats": {
            "total": len(nodes),
            "byKind": stats_by_kind,
            "byProcess": stats_by_process,
        },
        "elapsed_ms": round((time.time() - t0) * 1000, 2),
    }
