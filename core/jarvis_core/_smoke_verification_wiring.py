"""Smoke M2.1 — Verification branchée aux hooks Core (allowlist + observers).

Sans MemPalace, Hermes bridge, HUD, NUC, HA, reviewers LLM.

    python -m jarvis_core._smoke_verification_wiring
"""
from __future__ import annotations

import asyncio
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def _pipe(root: Path, events: list | None = None):
    from jarvis_core.memory import build_memory_api
    from jarvis_core.verification import VerificationPipeline

    emit = None
    if events is not None:

        def emit(kind: str, payload: dict) -> None:
            events.append((kind, payload))

    api = build_memory_api(root=root, emit=emit)
    return VerificationPipeline(memory_api=api, emit=emit), api


async def test_allowlist_skips_hud() -> None:
    from jarvis_core.verification_hooks import build_verification_request, needs_verification

    assert needs_verification("hud.lock") is False
    assert needs_verification("web.search") is False
    assert needs_verification("core.preferences") is False
    assert await build_verification_request(
        intent="hud.lock",
        result={"ok": True},
        user_id="u",
        payload={},
    ) is None
    print("  OK — intent non vérifiable → pas de VerificationRequest")


async def test_remote_ok_one_memory() -> None:
    from jarvis_core.verification import RESULT_VALIDATED
    from jarvis_core.verification_hooks import build_verification_request, run_verification_safe

    with tempfile.TemporaryDirectory() as tmp:
        events: list = []
        pipe, api = _pipe(Path(tmp), events)
        result = {"ok": True, "output": "active", "error": "", "returncode": 0}
        req = await build_verification_request(
            intent="vps.terminal",
            result=result,
            user_id="smoke-m21",
            payload={"command": "systemctl is-active nginx", "mission_id": "m21-remote-1"},
            host="vps",
        )
        assert req is not None
        out = run_verification_safe(pipe, req)
        assert out is not None and out.validated and out.stage == RESULT_VALIDATED
        assert out.memory_status == "stored"
        assert out.evidence and "details" in out.evidence
        assert out.evidence.get("reviews") == []
        items = api.list("smoke-m21", kinds=["mission_result"])
        assert isinstance(items, list) and len(items) == 1
        print("  OK — remote RemoteResult OK → 1 mission_result + details/reviews prêts")


async def test_remote_fail_disputed_zero_memory() -> None:
    from jarvis_core.verification import RESULT_DISPUTED
    from jarvis_core.verification_hooks import build_verification_request, run_verification_safe

    with tempfile.TemporaryDirectory() as tmp:
        pipe, api = _pipe(Path(tmp))
        result = {"ok": False, "output": "", "error": "unit inactive", "returncode": 3}
        # claim success True (executor lie) but observation from same RemoteResult → ok False
        # claimed_success_from_result → False → RESULT_FAILED not DISPUTED
        # For DISPUTED we need claim True + observe False:
        req = await build_verification_request(
            intent="pi.terminal",
            result=result,
            user_id="smoke-m21",
            payload={"command": "false", "mission_id": "m21-remote-fail"},
            host="pi",
        )
        assert req is not None
        # Force claim success while observation stays fail (agent lied)
        req.claimed_success = True
        out = run_verification_safe(pipe, req)
        assert out is not None and out.stage == RESULT_DISPUTED
        assert out.validated is False
        assert len(api.list("smoke-m21", kinds=["mission_result"])) == 0  # type: ignore[arg-type]
        print("  OK — observer FAIL → DISPUTED + 0 memory")


async def test_hermes_claim_never_validated() -> None:
    from jarvis_core.verification import RESULT_DISPUTED
    from jarvis_core.verification_hooks import build_observation, build_verification_request, run_verification_safe

    obs = await build_observation(
        "system.shell",
        {"ok": True, "text": "Installation réussie, agent opérationnel"},
    )
    assert obs.success is False
    assert "not_proof" in obs.observed or "rejected" in obs.observed.lower() or "Hermes" in obs.observed

    with tempfile.TemporaryDirectory() as tmp:
        pipe, api = _pipe(Path(tmp))
        req = await build_verification_request(
            intent="system.shell",
            result={"ok": True, "text": "Agent installé avec succès"},
            user_id="smoke-m21",
            payload={"command": "echo done", "mission_id": "m21-hermes"},
            host="nuc",
        )
        assert req is not None
        assert req.claimed_success is True
        out = run_verification_safe(pipe, req)
        assert out is not None
        assert out.validated is False
        assert out.stage == RESULT_DISPUTED
        assert len(api.list("smoke-m21", kinds=["mission_result"])) == 0  # type: ignore[arg-type]
        print("  OK — Hermes claim seul → jamais RESULT_VALIDATED")


async def test_device_agent_ok_not_enough_without_registry() -> None:
    from jarvis_core.verification import RESULT_DISPUTED
    from jarvis_core.verification_hooks import build_verification_request, run_verification_safe

    with tempfile.TemporaryDirectory() as tmp:
        pipe, api = _pipe(Path(tmp))
        req = await build_verification_request(
            intent="core.cursor",
            result={"ok": True, "device_id": "pc-1", "app_id": "cursor", "summary": "lancé"},
            user_id="smoke-m21",
            payload={"mission_id": "m21-device-1"},
            orch=None,  # pas de registry → agent ok ignoré
        )
        out = run_verification_safe(pipe, req)
        assert out is not None and out.stage == RESULT_DISPUTED
        assert len(api.list("smoke-m21", kinds=["mission_result"])) == 0  # type: ignore[arg-type]
        print("  OK — agent ok sans registry → DISPUTED")


async def test_device_online_validates() -> None:
    from jarvis_core.devices import DeviceRegistry
    from jarvis_core.verification import RESULT_VALIDATED
    from jarvis_core.verification_hooks import build_verification_request, run_verification_safe

    with tempfile.TemporaryDirectory() as tmp:
        pipe, api = _pipe(Path(tmp))
        reg = DeviceRegistry(ttl_s=60)
        reg.register("pc-win", type="windows", runtime_kind="windows_agent")
        orch = SimpleNamespace(devices=reg)
        req = await build_verification_request(
            intent="device.app_launch",
            result={"ok": True, "device_id": "pc-win", "app_id": "notepad"},
            user_id="smoke-m21",
            payload={"mission_id": "m21-device-ok"},
            orch=orch,
        )
        out = run_verification_safe(pipe, req)
        assert out is not None and out.validated and out.stage == RESULT_VALIDATED
        assert out.memory_status == "stored"
        print("  OK — device online (registry) → VALIDATED + memory")


async def test_idempotent_replay() -> None:
    from jarvis_core.verification_hooks import build_verification_request, run_verification_safe

    with tempfile.TemporaryDirectory() as tmp:
        pipe, api = _pipe(Path(tmp))
        result = {"ok": True, "output": "ok", "returncode": 0, "error": ""}
        payload = {"command": "uptime", "mission_id": "m21-idem"}
        for _ in range(3):
            req = await build_verification_request(
                intent="vps.terminal",
                result=result,
                user_id="smoke-m21",
                payload=payload,
                host="vps",
            )
            run_verification_safe(pipe, req)
        items = api.list("smoke-m21", kinds=["mission_result"])
        assert isinstance(items, list) and len(items) == 1
        assert items[0].id == "mr:m21-idem"
        print("  OK — replay mission_id → 1 record")


async def test_secret_in_observed_memory_rejected() -> None:
    from jarvis_core.verification import MEMORY_STORE_REJECTED, Observation, RESULT_VALIDATED
    from jarvis_core.verification_hooks import build_verification_request, run_verification_safe

    with tempfile.TemporaryDirectory() as tmp:
        events: list = []
        pipe, api = _pipe(Path(tmp), events)
        req = await build_verification_request(
            intent="vps.terminal",
            result={"ok": True, "output": "x", "returncode": 0, "error": ""},
            user_id="smoke-m21",
            payload={"command": "cat secret", "mission_id": "m21-secret"},
            host="vps",
        )
        assert req is not None
        req.observe = Observation(
            observed="ok api_key=sk-abcdefghijklmnopqrstuvwxyz012345",
            success=True,
            details={"source": "remote_exec", "reviews": []},
        )
        out = run_verification_safe(pipe, req)
        assert out is not None and out.validated and out.stage == RESULT_VALIDATED
        assert out.memory_status == "rejected"
        assert any(k == MEMORY_STORE_REJECTED for k, _ in events)
        assert len(api.list("smoke-m21", kinds=["mission_result"])) == 0  # type: ignore[arg-type]
        print("  OK — secret → VALIDATED + MEMORY_STORE_REJECTED")


async def test_routing_mixin_hook_skips_and_runs() -> None:
    """Exercice _verify_after_execution sans WS (mixin isolé)."""
    from jarvis_core.intents.executors_routing import IntentRoutingMixin
    from jarvis_core.memory import build_memory_api
    from jarvis_core.verification import VerificationPipeline

    class _O(IntentRoutingMixin):
        pass

    with tempfile.TemporaryDirectory() as tmp:
        o = _O()
        o.verification = VerificationPipeline(memory_api=build_memory_api(root=Path(tmp)))
        # hors allowlist
        assert await o._verify_after_execution(
            intent="hud.lock",
            result={"ok": True},
            payload={},
            user_id="smoke-m21",
        ) is None
        # remote OK
        meta = await o._verify_after_execution(
            intent="vps.terminal",
            result={"ok": True, "output": "1", "returncode": 0, "error": ""},
            payload={"command": "echo 1", "mission_id": "m21-mixin"},
            user_id="smoke-m21",
            host="vps",
        )
        assert meta is not None and meta["validated"] is True
        assert meta["memory_status"] == "stored"
        assert meta["card_outcome"] == "verified"
        assert meta["action_requested"]
        assert meta["result_observed"]
        print("  OK — mixin _verify_after_execution (skip HUD + remote)")


async def _main_async() -> None:
    await test_allowlist_skips_hud()
    await test_remote_ok_one_memory()
    await test_remote_fail_disputed_zero_memory()
    await test_hermes_claim_never_validated()
    await test_device_agent_ok_not_enough_without_registry()
    await test_device_online_validates()
    await test_idempotent_replay()
    await test_secret_in_observed_memory_rejected()
    await test_routing_mixin_hook_skips_and_runs()


def main() -> int:
    print("=== smoke verification wiring M2.1 ===")
    asyncio.run(_main_async())
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
