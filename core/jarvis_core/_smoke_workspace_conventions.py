"""Smoke — convention workspaces Mission DEV.

    python -m jarvis_core._smoke_workspace_conventions
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import AsyncMock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.workspace import (  # noqa: E402
    WORKSPACE_JARVIS_MAIN,
    WorkspaceBinding,
    WorkspaceRegistry,
    WorkspaceRegistryError,
    classify_workspace_id,
    detect_jarvis_repo_root,
    is_path_under,
    laragon_www_root,
    validate_local_path,
)


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def test_git_root_matches_repo() -> None:
    git_out = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=str(ROOT.parent),
        capture_output=True,
        text=True,
        check=False,
    )
    check("git available", git_out.returncode == 0)
    git_root = Path(git_out.stdout.strip()).resolve()
    detected = detect_jarvis_repo_root()
    check("detect_jarvis_repo_root == git root", detected == git_root, str(detected))


def test_jarvis_main_registration() -> None:
    reg = WorkspaceRegistry()
    jarvis = detect_jarvis_repo_root()
    reg.register(
        WorkspaceBinding(
            workspace_id=WORKSPACE_JARVIS_MAIN,
            repo_name=jarvis.name,
            authoritative_device_id="test-portable",
            local_path=str(jarvis),
        ),
        persist=False,
    )
    binding = reg.get(WORKSPACE_JARVIS_MAIN)
    check("jarvis-main registered", binding is not None)
    check("local_path is git root", Path(binding.local_path).resolve() == jarvis)


def test_classify_and_validate() -> None:
    jarvis = detect_jarvis_repo_root()
    laragon = laragon_www_root()
    check("jarvis-main kind", classify_workspace_id(WORKSPACE_JARVIS_MAIN) == "JARVIS_MAIN")
    check("vendor kind", classify_workspace_id("jarvis-vendor-hermes") == "JARVIS_VENDOR")
    check("independent kind", classify_workspace_id("project-x") == "INDEPENDENT")

    vendor_path = jarvis / "vendor" / "test-audit"
    vendor_path.mkdir(parents=True, exist_ok=True)
    try:
        validate_local_path(str(vendor_path), "jarvis-vendor-hermes", jarvis_root=jarvis)
        check("vendor path accepted", True)
    finally:
        vendor_path.rmdir()

    try:
        validate_local_path(str(laragon), WORKSPACE_JARVIS_MAIN, jarvis_root=jarvis)
        check("laragon www as jarvis-main rejected", False)
    except WorkspaceRegistryError as exc:
        check("laragon www rejected", exc.code == "jarvis_main_path_mismatch", exc.code)


def test_path_traversal_rejected() -> None:
    sys.path.insert(0, str(ROOT.parent / "deploy" / "windows-agent"))
    import agent_lib  # type: ignore[import-untyped]

    laragon = laragon_www_root()
    roots = [laragon]
    check(
        "C:\\Windows rejected",
        not agent_lib.validate_workspace_local_path(r"C:\Windows\System32", roots),
    )
    jarvis = detect_jarvis_repo_root()
    check(
        "jarvis root accepted",
        agent_lib.validate_workspace_local_path(str(jarvis), roots),
    )


def test_same_local_path_claude_cursor() -> None:
    """Claude et Cursor partagent le même local_path via jarvis-main."""
    jarvis = detect_jarvis_repo_root()
    reg = WorkspaceRegistry()
    reg.register(
        WorkspaceBinding(
            workspace_id=WORKSPACE_JARVIS_MAIN,
            repo_name=jarvis.name,
            authoritative_device_id="test-portable",
            local_path=str(jarvis),
        ),
        persist=False,
    )
    p1 = reg.resolve_local_path(WORKSPACE_JARVIS_MAIN)
    p2 = reg.resolve_local_path(WORKSPACE_JARVIS_MAIN)
    check("same path twice", p1 == p2 == str(jarvis), f"{p1} vs {p2}")


def test_unknown_workspace_and_device() -> None:
    reg = WorkspaceRegistry()
    try:
        reg.resolve_local_path("missing-ws")
        check("unknown workspace raises", False)
    except WorkspaceRegistryError as exc:
        check("unknown workspace", exc.code == "workspace_not_found")

    jarvis = detect_jarvis_repo_root()
    reg.register(
        WorkspaceBinding(
            workspace_id=WORKSPACE_JARVIS_MAIN,
            repo_name=jarvis.name,
            authoritative_device_id="auth-dev",
            local_path=str(jarvis),
        ),
        persist=False,
    )
    try:
        reg.resolve_local_path(WORKSPACE_JARVIS_MAIN, device_id="wrong-dev")
        check("wrong device raises", False)
    except WorkspaceRegistryError as exc:
        check("wrong device", exc.code == "workspace_not_authoritative_on_device")


def test_independent_project() -> None:
    laragon = laragon_www_root()
    reg = WorkspaceRegistry()
    # Chemin fictif sous Laragon — pas besoin que le dossier existe pour validate
    indep = laragon / "_smoke-independent-test"
    validate_local_path(str(indep), "project-x", laragon_root=laragon)
    reg.register(
        WorkspaceBinding(
            workspace_id="project-x",
            repo_name="project-x",
            authoritative_device_id="test-portable",
            local_path=str(indep),
        ),
        persist=False,
    )
    check("independent registered", reg.get("project-x") is not None)


def test_v2_device_resolved_binding() -> None:
    """V2 — Core stocke device_id sans chemin Windows."""
    import os

    from jarvis_core.workspace.conventions import (
        DEVICE_RESOLVED_LOCAL_PATH,
        jarvis_main_binding,
        is_device_resolved_local_path,
    )

    saved = {
        k: os.environ.pop(k, None)
        for k in ("JARVIS_MAIN_LOCAL_PATH", "JARVIS_WORKSPACE_LEGACY_CORE_PATH")
    }
    try:
        binding = jarvis_main_binding(device_id="pc-test-v2")
        check("V2 local_path empty", is_device_resolved_local_path(binding.local_path))
        check("V2 device set", binding.authoritative_device_id == "pc-test-v2")
        check("V2 workspace_id", binding.workspace_id == WORKSPACE_JARVIS_MAIN)

        reg = WorkspaceRegistry()
        reg.register(binding, persist=False)
        stored = reg.get(WORKSPACE_JARVIS_MAIN)
        check(
            "V2 registered",
            stored is not None and stored.local_path == DEVICE_RESOLVED_LOCAL_PATH,
        )

        try:
            reg.resolve_local_path(WORKSPACE_JARVIS_MAIN)
            check("resolve on Core raises", False)
        except WorkspaceRegistryError as exc:
            check("device-resolved on Core", exc.code == "workspace_path_device_resolved")
    finally:
        for k, v in saved.items():
            if v is not None:
                os.environ[k] = v


def test_agent_resolves_jarvis_main() -> None:
    """V2 — Windows Agent résout jarvis-main localement."""
    sys.path.insert(0, str(ROOT.parent / "deploy" / "windows-agent"))
    from workspace_local import resolve_workspace_path  # type: ignore[import-untyped]

    jarvis = detect_jarvis_repo_root()
    resolved = Path(resolve_workspace_path(WORKSPACE_JARVIS_MAIN)).resolve()
    check("agent resolves jarvis-main", resolved == jarvis, str(resolved))


def main() -> None:
    print("-- Workspace conventions --")
    test_git_root_matches_repo()
    test_jarvis_main_registration()
    test_classify_and_validate()
    test_path_traversal_rejected()
    test_independent_project()
    test_same_local_path_claude_cursor()
    test_unknown_workspace_and_device()
    test_v2_device_resolved_binding()
    test_agent_resolves_jarvis_main()
    print("\nTous les tests workspace OK.")


if __name__ == "__main__":
    main()
