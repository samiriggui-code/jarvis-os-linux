"""Convention workspaces Mission DEV / P5 — chemins autoritaires.

Règles figées (cf. docs/architecture/JARVIS-WORKSPACES.md) :

- ``jarvis-main`` → racine Git réelle du repo JARVIS sur le portable DEV
- ``jarvis-vendor-*`` → sous ``<jarvis-root>/vendor/``
- projets indépendants → sous ``JARVIS_WORKSPACE_ROOT`` (défaut Laragon www)
- NUC ``/opt/jarvis/...`` = runtime prod uniquement, jamais workspace DEV
"""
from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .registry import WorkspaceRegistryError

if TYPE_CHECKING:
    from .types import WorkspaceBinding

logger = logging.getLogger("jarvis.workspace")

WORKSPACE_JARVIS_MAIN = "jarvis-main"
WORKSPACE_VENDOR_PREFIX = "jarvis-vendor-"
VENDOR_DIR_NAME = "vendor"
LARAGON_WWW_DEFAULT = Path(r"C:\laragon\www")

# V2 — chemin résolu sur le device autoritaire (Core/NUC ne stocke pas le path Windows)
DEVICE_RESOLVED_LOCAL_PATH = ""


def is_device_resolved_local_path(local_path: str | None) -> bool:
    return not str(local_path or "").strip()


def laragon_www_root() -> Path:
    """Racine Laragon autorisée pour projets indépendants + contrôle Windows Agent."""
    raw = os.environ.get("JARVIS_WORKSPACE_ROOT", "").strip()
    if raw:
        return Path(raw).resolve()
    if os.name == "nt" and LARAGON_WWW_DEFAULT.is_dir():
        return LARAGON_WWW_DEFAULT.resolve()
    return Path(os.environ.get("JARVIS_PROJECTS_ROOT", str(LARAGON_WWW_DEFAULT))).resolve()


def git_toplevel(start: Path | None = None) -> Path | None:
    """``git rev-parse --show-toplevel`` — None si hors repo."""
    cwd = (start or Path.cwd()).resolve()
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode != 0:
        return None
    top = out.stdout.strip()
    return Path(top).resolve() if top else None


def detect_jarvis_repo_root(*, start: Path | None = None) -> Path:
    """Racine Git JARVIS — env ``JARVIS_MAIN_LOCAL_PATH`` prioritaire, sinon détection."""
    env = os.environ.get("JARVIS_MAIN_LOCAL_PATH", "").strip()
    if env:
        root = Path(env).resolve()
        _assert_git_root(root)
        return root

    # Core package : core/jarvis_core/workspace → repo = parents[2] from core/
    default_start = Path(__file__).resolve().parents[2]
    detected = git_toplevel(start or default_start)
    if detected is None:
        raise WorkspaceRegistryError(
            "racine Git JARVIS introuvable — définir JARVIS_MAIN_LOCAL_PATH",
            code="jarvis_git_root_missing",
        )
    return detected


def _assert_git_root(path: Path) -> None:
    resolved = path.resolve()
    if not (resolved / ".git").exists() and git_toplevel(resolved) != resolved:
        raise WorkspaceRegistryError(
            f"local_path n'est pas une racine Git : {resolved}",
            code="not_git_root",
        )


def is_path_under(child: Path, root: Path) -> bool:
    """Comparaison canonique — rejette sortie de racine (.., junctions résolues)."""
    try:
        child.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def classify_workspace_id(workspace_id: str) -> str:
    """Catégorie logique — pas de champ DB supplémentaire."""
    wid = str(workspace_id or "").strip()
    if wid == WORKSPACE_JARVIS_MAIN:
        return "JARVIS_MAIN"
    if wid.startswith(WORKSPACE_VENDOR_PREFIX):
        return "JARVIS_VENDOR"
    return "INDEPENDENT"


def validate_local_path(
    local_path: str,
    workspace_id: str,
    *,
    jarvis_root: Path | None = None,
    laragon_root: Path | None = None,
    allow_device_resolved: bool = True,
) -> Path | None:
    """Valide un chemin avant enregistrement Core.

    Si ``local_path`` est vide et ``allow_device_resolved``, le binding est V2 :
    le Windows Agent résout le chemin localement.
    """
    if is_device_resolved_local_path(local_path):
        if not allow_device_resolved:
            raise WorkspaceRegistryError(
                "local_path requis (mode V1)",
                code="workspace_path_empty",
            )
        return None

    resolved = Path(local_path).resolve()
    laragon = (laragon_root or laragon_www_root()).resolve()
    jarvis = (jarvis_root or detect_jarvis_repo_root()).resolve()
    kind = classify_workspace_id(workspace_id)

    if kind == "JARVIS_MAIN":
        if resolved != jarvis:
            raise WorkspaceRegistryError(
                f"jarvis-main doit être la racine Git JARVIS ({jarvis}), pas {resolved}",
                code="jarvis_main_path_mismatch",
            )
        _assert_git_root(resolved)
        return resolved

    if kind == "JARVIS_VENDOR":
        vendor_root = (jarvis / VENDOR_DIR_NAME).resolve()
        if not is_path_under(resolved, vendor_root):
            raise WorkspaceRegistryError(
                f"vendor workspace hors {vendor_root} : {resolved}",
                code="vendor_path_outside",
            )
        return resolved

    if not is_path_under(resolved, laragon):
        raise WorkspaceRegistryError(
            f"projet indépendant hors {laragon} : {resolved}",
            code="independent_path_outside_laragon",
        )
    return resolved


def jarvis_main_binding(
    *,
    device_id: str,
    local_path: str | None = None,
) -> WorkspaceBinding:
    """Binding jarvis-main — V2 par défaut (path résolu sur le device).

    V1 compat : si ``JARVIS_MAIN_LOCAL_PATH`` est défini sur cette machine Core,
    ou si ``local_path`` est passé explicitement, le path est stocké côté Core.
    """
    from .types import WorkspaceBinding

    env_path = os.environ.get("JARVIS_MAIN_LOCAL_PATH", "").strip()
    explicit = str(local_path or "").strip()
    legacy_core = os.environ.get("JARVIS_WORKSPACE_LEGACY_CORE_PATH", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )

    resolved_path = DEVICE_RESOLVED_LOCAL_PATH
    repo_name = "jarvis-main"

    if explicit:
        root = Path(explicit).resolve()
        validate_local_path(str(root), WORKSPACE_JARVIS_MAIN, jarvis_root=root)
        resolved_path = str(root)
        repo_name = root.name
    elif env_path and legacy_core:
        root = Path(env_path).resolve()
        validate_local_path(str(root), WORKSPACE_JARVIS_MAIN, jarvis_root=root)
        resolved_path = str(root)
        repo_name = root.name
        logger.info(
            "jarvis-main V1 compat · path stocké côté Core (%s) — préférer V2 device-resolved",
            resolved_path,
        )
    else:
        detected = detect_jarvis_repo_root_optional()
        if detected is not None and legacy_core and not env_path:
            validate_local_path(str(detected), WORKSPACE_JARVIS_MAIN, jarvis_root=detected)
            resolved_path = str(detected)
            repo_name = detected.name

    return WorkspaceBinding(
        workspace_id=WORKSPACE_JARVIS_MAIN,
        repo_name=repo_name,
        authoritative_device_id=device_id,
        local_path=resolved_path,
        sync_mode="local_only",
    )


def detect_jarvis_repo_root_optional(*, start: Path | None = None) -> Path | None:
    """Détection Git locale — smokes / dev Core sur le repo. None si hors repo."""
    try:
        return detect_jarvis_repo_root(start=start)
    except WorkspaceRegistryError:
        return None


def ensure_jarvis_main(registry: Any, *, persist: bool = True) -> Any | None:
    """Enregistre ``jarvis-main`` si ``JARVIS_MAIN_DEVICE_ID`` est défini."""
    device_id = os.environ.get("JARVIS_MAIN_DEVICE_ID", "").strip()
    if not device_id:
        existing = registry.get(WORKSPACE_JARVIS_MAIN)
        if existing is None:
            logger.info(
                "jarvis-main non auto-enregistré — JARVIS_MAIN_DEVICE_ID absent "
                "(smokes enregistrent manuellement)"
            )
        return existing

    binding = jarvis_main_binding(device_id=device_id)
    existing = registry.get(WORKSPACE_JARVIS_MAIN)
    if existing and existing.local_path != binding.local_path:
        logger.warning(
            "jarvis-main local_path mis à jour · %s → %s",
            existing.local_path,
            binding.local_path,
        )
    registered = registry.register(binding, persist=persist)
    if is_device_resolved_local_path(registered.local_path):
        logger.info(
            "jarvis-main · device=%s · path=<device-resolved>",
            registered.authoritative_device_id,
        )
    else:
        logger.info(
            "jarvis-main · device=%s · path=%s (V1 compat)",
            registered.authoritative_device_id,
            registered.local_path,
        )
    return registered
