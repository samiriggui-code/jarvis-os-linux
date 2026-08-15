"""Smoke M2 — VerificationPipeline → MemoryAPI (mission_result).

Sans MemPalace, Hermes, HUD, NUC. Observer injecté (déterministe).

    python -m jarvis_core._smoke_verification_memory
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

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


def _req(**kwargs):
    from jarvis_core.verification import Observation, VerificationRequest

    defaults = dict(
        mission_id="m-win-agent-2026-08-12",
        user_id="smoke-m2",
        intent="windows.agent.install",
        proposition="Installer Windows Agent sur PC",
        action_demanded="deploy/windows-agent install",
        claimed_result="Agent installé et connecté",
        claimed_success=True,
        observe=Observation(
            observed=(
                "2026-08-12 · Windows Agent process actif ; "
                "WebSocket Core connected ; capabilities smoke OK"
            ),
            success=True,
            details={"ws": "connected", "process": "running"},
        ),
        device_id="pc-windows-1",
        wing="pc-windows",
        room="missions",
        title="Windows Agent installé",
        importance="high",
    )
    defaults.update(kwargs)
    return VerificationRequest(**defaults)


def test_1_validated_produces_exactly_one_mission_result() -> None:
    from jarvis_core.verification import RESULT_VALIDATED

    with tempfile.TemporaryDirectory() as tmp:
        events: list = []
        pipe, api = _pipe(Path(tmp), events)
        out = pipe.run(_req())
        assert out.validated and out.stage == RESULT_VALIDATED, out.to_dict()
        assert out.memory_status == "stored"
        assert out.memory_record_id == "mr:m-win-agent-2026-08-12"
        assert out.evidence and out.evidence.get("validated") is True
        assert out.evidence.get("observed")
        assert out.evidence.get("validator") == "core.verify"
        assert out.evidence.get("at")

        kinds = [k for k, _ in events]
        assert RESULT_VALIDATED in kinds
        assert "RESULT_OBSERVED" in kinds
        assert "ACTION_EXECUTED" in kinds

        items = api.list("smoke-m2", kinds=["mission_result"])
        assert isinstance(items, list) and len(items) == 1
        rec = items[0]
        assert rec.id == "mr:m-win-agent-2026-08-12"
        assert rec.evidence and rec.evidence.validated
        assert rec.scope.mission_id == "m-win-agent-2026-08-12"
        assert rec.scope.device_id == "pc-windows-1"
        assert "observed:" in rec.content
        print("  1 OK — validated → exactement 1 mission_result + evidence")


def test_2_observed_but_not_validated_zero_memory() -> None:
    from jarvis_core.verification import Observation, RESULT_DISPUTED

    with tempfile.TemporaryDirectory() as tmp:
        pipe, api = _pipe(Path(tmp))
        out = pipe.run(
            _req(
                observe=Observation(
                    observed="process absent ; ws disconnected",
                    success=False,
                )
            )
        )
        assert out.stage == RESULT_DISPUTED
        assert out.validated is False
        assert out.memory_status == "skipped"
        items = api.list("smoke-m2", kinds=["mission_result"])
        assert isinstance(items, list) and len(items) == 0
        print("  2 OK — observed non validé → 0 mission_result")


def test_3_failed_mission_zero_success_memory() -> None:
    from jarvis_core.verification import RESULT_FAILED

    with tempfile.TemporaryDirectory() as tmp:
        pipe, api = _pipe(Path(tmp))
        out = pipe.run(
            _req(
                claimed_success=False,
                claimed_result="Install failed",
            )
        )
        assert out.stage == RESULT_FAILED
        assert out.validated is False
        items = api.list("smoke-m2", kinds=["mission_result"])
        assert isinstance(items, list) and len(items) == 0
        print("  3 OK — mission échouée → 0 mission_result succès")


def test_4_idempotent_replay() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        pipe, api = _pipe(Path(tmp))
        out1 = pipe.run(_req())
        out2 = pipe.run(_req())  # retry / replay même mission_id
        assert out1.validated and out2.validated
        assert out1.memory_record_id == out2.memory_record_id
        items = api.list("smoke-m2", kinds=["mission_result"])
        assert isinstance(items, list) and len(items) == 1
        print("  4 OK — replay → toujours exactement 1 record")


def test_5_evidence_in_final_record() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        pipe, api = _pipe(Path(tmp))
        out = pipe.run(_req())
        rec = api.recall(out.memory_record_id or "", "smoke-m2")
        assert rec is not None
        assert rec.evidence is not None
        assert rec.evidence.validated is True
        assert "WebSocket" in rec.evidence.observed or "ws" in rec.evidence.observed.lower() or "process" in rec.evidence.observed.lower()
        assert rec.evidence.validator == "core.verify"
        assert rec.evidence.at
        print("  5 OK — evidence présente dans le record final")


def test_6_secret_still_rejected_after_validation() -> None:
    """RESULT_VALIDATED reste true ; Memory reject → MEMORY_STORE_REJECTED."""
    from jarvis_core.verification import Observation, MEMORY_STORE_REJECTED, RESULT_VALIDATED

    with tempfile.TemporaryDirectory() as tmp:
        events: list = []
        pipe, api = _pipe(Path(tmp), events)
        out = pipe.run(
            _req(
                mission_id="m-secret",
                observe=Observation(
                    observed="ok but api_key=sk-abcdefghijklmnopqrstuvwxyz012345 leaked in log",
                    success=True,
                ),
            )
        )
        assert out.validated is True
        assert out.stage == RESULT_VALIDATED
        assert out.memory_status == "rejected"
        assert out.memory_reject and out.memory_reject.get("code") == "secret_detected"
        assert any(k == MEMORY_STORE_REJECTED for k, _ in events)
        items = api.list("smoke-m2", kinds=["mission_result"])
        assert isinstance(items, list) and len(items) == 0
        print("  6 OK — secret rejeté ; mission reste validated + MEMORY_STORE_REJECTED")


def test_7_claim_alone_never_stores() -> None:
    """Sans observation indépendante → pas de Memory (incomplete)."""
    from jarvis_core.verification import Observation, RESULT_FAILED

    with tempfile.TemporaryDirectory() as tmp:
        pipe, api = _pipe(Path(tmp))

        def boom() -> Observation:
            raise RuntimeError("observer down")

        out = pipe.run(_req(observe=boom))
        assert out.validated is False
        assert out.stage == RESULT_FAILED
        assert len(api.list("smoke-m2", kinds=["mission_result"])) == 0  # type: ignore[arg-type]
        print("  7 OK — claim seul / observer down → 0 mission_result")


def main() -> int:
    print("=== smoke verification → memory M2 ===")
    test_1_validated_produces_exactly_one_mission_result()
    test_2_observed_but_not_validated_zero_memory()
    test_3_failed_mission_zero_success_memory()
    test_4_idempotent_replay()
    test_5_evidence_in_final_record()
    test_6_secret_still_rejected_after_validation()
    test_7_claim_alone_never_stores()
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
