"""P5 — backends dev.agent.run réels (Claude Code CLI / Cursor Agent CLI).

Le simulateur (``dev_agent_fake.py``) reste inchangé et sert aux smokes CI
(déterministe, sans réseau/CLI). Ce module ajoute le chemin réel : un
``run_id`` Core lance un vrai subprocess CLI dans le workspace local validé.

Contrat inchangé (voir ``dev_agent_fake.DevAgentRunSimulator``) : même
interface publique (``dev_capabilities``, ``handle_start``, ``handle_cancel``,
``handle_status``) pour se brancher dans ``run_agent_session`` exactement
comme le simulateur se branche dans ``fake_agent.py``.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from agent_lib import execute_result, run_collect_tests, validate_workspace_local_path

logger = logging.getLogger("jarvis.win.agent")

CAPABILITY_DEV_AGENT_RUN = "dev.agent.run"
ALLOWED_AGENTS = frozenset({"cursor", "claude"})

MAX_OUTPUT_BYTES = 200_000
STDOUT_PREVIEW_CHARS = 4000
GIT_TIMEOUT_S = 10.0
KILL_TIMEOUT_S = 10.0
COLLECT_TEST_TIMEOUT_S = 120.0


def _resolve_cli(*names: str) -> str | None:
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    return None


# ── Backends ──────────────────────────────────────────────────────────────


class DevAgentBackend:
    """Un backend sait construire l'argv CLI et parser sa sortie JSON."""

    agent_name = ""
    _api_key_env = ""
    _binary_names: tuple[str, ...] = ()

    def __init__(self) -> None:
        self._binary_path: str | None = None

    def available(self) -> tuple[bool, str]:
        binary = _resolve_cli(*self._binary_names)
        self._binary_path = binary
        if not binary:
            return False, "cli_not_found"
        if not os.environ.get(self._api_key_env, "").strip():
            return False, "api_key_missing"
        return True, ""

    def build_argv(self, prompt: str) -> list[str]:
        raise NotImplementedError

    async def spawn(self, *, prompt: str, cwd: Path) -> asyncio.subprocess.Process:
        argv = self.build_argv(prompt)
        return await asyncio.create_subprocess_exec(
            *argv,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )


class ClaudeCliBackend(DevAgentBackend):
    agent_name = "claude"
    _api_key_env = "ANTHROPIC_API_KEY"
    _binary_names = ("claude.cmd", "claude")

    def build_argv(self, prompt: str) -> list[str]:
        binary = self._binary_path or _resolve_cli(*self._binary_names)
        return [binary, "-p", "--output-format", "json", prompt]


class CursorCliBackend(DevAgentBackend):
    agent_name = "cursor"
    _api_key_env = "CURSOR_API_KEY"
    _binary_names = ("agent.cmd", "agent")

    def build_argv(self, prompt: str) -> list[str]:
        binary = self._binary_path or _resolve_cli(*self._binary_names)
        return [binary, "-p", "--output-format", "json", "--trust", prompt]


def parse_agent_json(raw: bytes) -> tuple[dict[str, Any] | None, str | None]:
    """RAW OUTPUT → PARSED RESULT | PARSE ERROR — jamais de faux succès."""
    text = raw.decode("utf-8", errors="replace").strip()
    if not text:
        return None, "empty_stdout"
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return None, f"json_decode_error: {exc}"
    if not isinstance(data, dict):
        return None, "json_not_object"
    return data, None


# ── Run bookkeeping ──────────────────────────────────────────────────────


@dataclass
class _RunEntry:
    run_id: str
    agent: str
    workspace_id: str
    device_id: str
    state: str = "ACCEPTED"
    process: asyncio.subprocess.Process | None = None
    pid: int | None = None
    cancelled: bool = False
    started_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    task: "asyncio.Task[None] | None" = None


def _porcelain_paths(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        if len(line) > 3:
            out[line[3:].strip()] = line[:2]
    return out


def _files_changed(before: str, after: str) -> list[str]:
    """Delta porcelain uniquement — ignore l'état dirty préexistant au run."""
    b = _porcelain_paths(before)
    a = _porcelain_paths(after)
    return sorted(p for p in a if a.get(p) != b.get(p))


async def _git_capture(cwd: Path, *args: str) -> str:
    try:
        proc = await asyncio.create_subprocess_exec(
            "git",
            *args,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=GIT_TIMEOUT_S)
        return out.decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        logger.warning("git %s a échoué : %s", " ".join(args), exc)
        return ""


async def _kill_tree(pid: int) -> None:
    """Tue UNIQUEMENT le PID donné + ses enfants — jamais taskkill par nom."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "taskkill",
            "/PID",
            str(pid),
            "/T",
            "/F",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=KILL_TIMEOUT_S)
    except Exception as exc:  # noqa: BLE001
        logger.warning("kill_tree pid=%s a échoué : %s", pid, exc)


class RealDevAgentRunner:
    """Backend réel dev.agent.run — 1 run actif / device (V1, cf. §34)."""

    def __init__(self, *, device_id: str, allowed_roots: list[str] | None = None) -> None:
        self.device_id = device_id
        self.allowed_roots = [
            Path(p).resolve()
            for p in (allowed_roots or [os.environ.get("JARVIS_WORKSPACE_ROOT", "C:\\laragon\\www")])
        ]
        self._backends: dict[str, DevAgentBackend] = {
            "claude": ClaudeCliBackend(),
            "cursor": CursorCliBackend(),
        }
        self._runs: dict[str, _RunEntry] = {}

    # ── discovery ────────────────────────────────────────────────────────

    def dev_capabilities(self) -> list[dict[str, Any]]:
        availability = {name: b.available() for name, b in self._backends.items()}
        any_available = any(ok for ok, _ in availability.values())
        try:
            from workspace_local import list_workspace_ids

            workspace_ids = list_workspace_ids()
        except Exception:  # noqa: BLE001
            workspace_ids = []
        caps: list[dict[str, Any]] = [
            {
                "capability_id": CAPABILITY_DEV_AGENT_RUN,
                "value": any_available,
                "metadata": {
                    "agents": sorted(n for n, (ok, _) in availability.items() if ok),
                    "backend": "real",
                },
            }
        ]
        for name, (ok, reason) in availability.items():
            caps.append(
                {
                    "capability_id": f"dev.agent.{name}",
                    "value": ok,
                    "metadata": {
                        "available": ok,
                        "reason": reason,
                        "headless": True,
                        "workspace_ids": workspace_ids,
                    },
                }
            )
        return caps

    def env_report(self) -> dict[str, bool]:
        return {
            "ANTHROPIC_API_KEY": bool(os.environ.get("ANTHROPIC_API_KEY", "").strip()),
            "CURSOR_API_KEY": bool(os.environ.get("CURSOR_API_KEY", "").strip()),
        }

    # ── validation ───────────────────────────────────────────────────────

    def _validate_path(self, local_path: str) -> bool:
        return validate_workspace_local_path(local_path, self.allowed_roots)

    def _device_busy(self) -> bool:
        return any(e.state in ("ACCEPTED", "RUNNING") for e in self._runs.values())

    # ── start / cancel / status ─────────────────────────────────────────

    async def handle_start(self, ws: Any, data: dict[str, Any], allowed: set[str]) -> dict[str, Any]:
        started = time.monotonic()
        request_id = str(data.get("request_id") or "")
        device_id = str(data.get("device_id") or self.device_id)
        params = data.get("params") if isinstance(data.get("params"), dict) else {}
        policy = data.get("policy") if isinstance(data.get("policy"), dict) else {}

        def _reject(code: str, message: str) -> dict[str, Any]:
            return execute_result(
                request_id=request_id,
                device_id=device_id,
                ok=False,
                started=started,
                capability_id=CAPABILITY_DEV_AGENT_RUN,
                error_code=code,
                error=message,
            )

        if not policy.get("granted", False):
            return _reject("policy_denied", "policy.granted=false")

        agent = str(params.get("agent") or "").strip().lower()
        if agent not in ALLOWED_AGENTS:
            return _reject("agent_not_allowed", f"agent hors allowlist : {agent}")

        backend = self._backends.get(agent)
        ok, reason = backend.available() if backend else (False, "cli_not_found")
        if not backend or not ok:
            return _reject("dev_agent_capability_missing", f"agent indisponible sur ce device : {agent} ({reason})")

        local_path = str(params.get("local_path") or "").strip()
        if not local_path:
            if not workspace_id:
                return _reject("workspace_id_required", "workspace_id requis si local_path absent")
            try:
                from workspace_local import resolve_workspace_path

                local_path = resolve_workspace_path(workspace_id)
            except ValueError as exc:
                return _reject("workspace_id_required", str(exc))
            except Exception as exc:  # noqa: BLE001
                return _reject("workspace_path_unresolved", f"workspace {workspace_id} : {exc}")

        if not self._validate_path(local_path):
            return _reject("workspace_path_denied", "local_path hors racines autorisées")

        run_id = str(params.get("run_id") or "")
        if not run_id:
            return _reject("run_id_required", "run_id requis")

        if run_id in self._runs and not self._runs[run_id].state in ("CANCELLED", "COMPLETED", "FAILED", "TIMEOUT"):
            return _reject("run_already_active", f"run déjà actif : {run_id}")

        if self._device_busy():
            return _reject("device_busy", "un run dev.agent.run est déjà actif sur ce device (V1 : 1 run/device)")

        timeout_s = float(params.get("timeout_s") or 600.0)
        workspace_id = str(params.get("workspace_id") or "").strip()
        prompt = str(params.get("prompt") or "")
        collect_tests = list(params.get("collect_tests") or [])

        entry = _RunEntry(run_id=run_id, agent=agent, workspace_id=workspace_id, device_id=device_id)
        self._runs[run_id] = entry
        entry.task = asyncio.create_task(
            self._execute_run(
                ws,
                entry=entry,
                backend=backend,
                prompt=prompt,
                cwd=Path(local_path),
                timeout_s=timeout_s,
                collect_tests=collect_tests,
            )
        )

        logger.info("DEV.AGENT.RUN · start run=%s agent=%s device=%s", run_id, agent, device_id)
        return execute_result(
            request_id=request_id,
            device_id=device_id,
            ok=True,
            started=started,
            capability_id=CAPABILITY_DEV_AGENT_RUN,
            summary=f"dev.agent.run accepté ({agent}, réel)",
            result={"run_id": run_id, "state": "ACCEPTED", "agent": agent},
        )

    async def handle_cancel(self, ws: Any, data: dict[str, Any], allowed: set[str] | None = None) -> dict[str, Any]:
        run_id = str(data.get("run_id") or "")
        request_id = str(data.get("request_id") or "")
        entry = self._runs.get(run_id)
        if entry is None:
            return {
                "type": "device.run.cancel_result",
                "ok": False,
                "request_id": request_id,
                "run_id": run_id,
                "error_code": "run_not_found",
            }
        entry.cancelled = True
        entry.state = "CANCELLED"
        entry.updated_at = time.time()
        if entry.pid:
            logger.info("DEV.AGENT.RUN · cancel run=%s pid=%s (kill ciblé)", run_id, entry.pid)
            asyncio.create_task(_kill_tree(entry.pid))
        return {
            "type": "device.run.cancel_result",
            "ok": True,
            "request_id": request_id,
            "run_id": run_id,
            "state": "CANCELLED",
        }

    async def handle_status(self, ws: Any, data: dict[str, Any], allowed: set[str] | None = None) -> dict[str, Any]:
        run_id = str(data.get("run_id") or "")
        request_id = str(data.get("request_id") or "")
        entry = self._runs.get(run_id)
        if entry is None:
            return {
                "type": "device.run.status_result",
                "ok": False,
                "request_id": request_id,
                "run_id": run_id,
                "error_code": "run_not_found",
            }
        return {
            "type": "device.run.status_result",
            "ok": True,
            "request_id": request_id,
            "run_id": run_id,
            "state": entry.state,
            "agent": entry.agent,
            "device_id": entry.device_id,
            "workspace_id": entry.workspace_id,
            "started_at": entry.started_at,
            "updated_at": entry.updated_at,
        }

    # ── execution réelle ─────────────────────────────────────────────────

    async def _send_json(self, ws: Any, payload: dict[str, Any]) -> None:
        try:
            await ws.send(json.dumps(payload))
        except Exception:  # noqa: BLE001
            return

    async def _send_progress(self, ws: Any, entry: _RunEntry, phase: str, message: str, seq: int) -> None:
        await self._send_json(
            ws,
            {
                "type": "device.run.progress",
                "run_id": entry.run_id,
                "device_id": entry.device_id,
                "phase": phase,
                "message": message,
                "sequence": seq,
            },
        )

    async def _send_failed(self, ws: Any, entry: _RunEntry, *, state: str, error_code: str, error_message: str) -> None:
        entry.state = state
        entry.updated_at = time.time()
        await self._send_json(
            ws,
            {
                "type": "device.run.failed",
                "run_id": entry.run_id,
                "device_id": entry.device_id,
                "state": state,
                "error_code": error_code,
                "error_message": error_message,
            },
        )

    async def _execute_run(
        self,
        ws: Any,
        *,
        entry: _RunEntry,
        backend: DevAgentBackend,
        prompt: str,
        cwd: Path,
        timeout_s: float,
        collect_tests: list[str] | None = None,
    ) -> None:
        seq = 0
        try:
            git_before = await _git_capture(cwd, "status", "--porcelain")

            seq += 1
            await self._send_progress(ws, entry, "process_started", "Lancement du CLI", seq)

            try:
                proc = await backend.spawn(prompt=prompt, cwd=cwd)
            except FileNotFoundError as exc:
                await self._send_failed(
                    ws, entry, state="FAILED", error_code="cli_spawn_failed", error_message=str(exc)
                )
                return

            entry.process = proc
            entry.pid = proc.pid
            entry.state = "RUNNING"
            entry.updated_at = time.time()

            seq += 1
            await self._send_progress(ws, entry, "running", f"CLI en cours (pid={proc.pid})", seq)

            started_at = entry.started_at
            try:
                stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
            except asyncio.TimeoutError:
                await _kill_tree(proc.pid)
                await self._send_failed(
                    ws,
                    entry,
                    state="TIMEOUT",
                    error_code="timeout",
                    error_message=f"Run expiré après {timeout_s}s",
                )
                return

            if entry.cancelled:
                await self._send_failed(
                    ws, entry, state="CANCELLED", error_code="cancelled", error_message="Run annulé"
                )
                return

            exit_code = proc.returncode
            seq += 1
            await self._send_progress(
                ws, entry, "output_received", f"stdout={len(stdout_b)}o stderr={len(stderr_b)}o", seq
            )
            seq += 1
            await self._send_progress(ws, entry, "verifying", "Analyse git diff", seq)

            git_after = await _git_capture(cwd, "status", "--porcelain")
            git_diff_stat = await _git_capture(cwd, "diff", "--stat")
            files_changed = _files_changed(git_before, git_after)

            tests: list[dict[str, Any]] = []
            if collect_tests:
                seq += 1
                await self._send_progress(
                    ws, entry, "tests_running", f"collect_tests ({len(collect_tests)})", seq
                )
                tests = await run_collect_tests(cwd, collect_tests, timeout_s=COLLECT_TEST_TIMEOUT_S)

            parsed, parse_error = parse_agent_json(stdout_b)
            duration_ms = int((time.time() - started_at) * 1000)

            stdout_truncated = len(stdout_b) > MAX_OUTPUT_BYTES
            stderr_truncated = len(stderr_b) > MAX_OUTPUT_BYTES

            claim = parsed.get("result") if parsed else None
            cli_reported_error = bool(parsed.get("is_error")) if parsed else False

            ok = exit_code == 0 and parse_error is None and not cli_reported_error
            if ok:
                error_code = None
                error_message = None
            elif parse_error is not None:
                error_code = "cli_json_parse_error"
                error_message = parse_error
            elif cli_reported_error:
                error_code = "cli_reported_error"
                error_message = str(claim or "agent a signalé une erreur")
            else:
                error_code = "cli_exit_nonzero"
                error_message = f"exit_code={exit_code}"

            result: dict[str, Any] = {
                "run_id": entry.run_id,
                "agent": entry.agent,
                "device_id": entry.device_id,
                "workspace_id": entry.workspace_id,
                "ok": ok,
                "exit_code": exit_code,
                "duration_ms": duration_ms,
                "agent_result": claim,
                "structured_output": ({**parsed, "producer": entry.agent} if (ok and parsed) else parsed),
                "files_changed": files_changed,
                "git_diff_stat": git_diff_stat[:4000],
                "git_diff_patch": None,
                "tests": tests,
                "error_code": error_code,
                "error_message": error_message,
                "stdout_preview": stdout_b[:STDOUT_PREVIEW_CHARS].decode("utf-8", errors="replace"),
                "stdout_bytes": len(stdout_b),
                "stdout_truncated": stdout_truncated,
                "stderr_preview": stderr_b[:STDOUT_PREVIEW_CHARS].decode("utf-8", errors="replace"),
                "stderr_bytes": len(stderr_b),
                "stderr_truncated": stderr_truncated,
                "git_before": git_before[:2000],
                "git_after": git_after[:2000],
            }

            entry.state = "COMPLETED" if ok else "FAILED"
            entry.updated_at = time.time()

            if ok:
                await self._send_json(
                    ws,
                    {
                        "type": "device.run.completed",
                        "run_id": entry.run_id,
                        "device_id": entry.device_id,
                        "result": result,
                    },
                )
                logger.info("DEV.AGENT.RUN · run=%s COMPLETED exit=%s", entry.run_id, exit_code)
            else:
                await self._send_json(
                    ws,
                    {
                        "type": "device.run.failed",
                        "run_id": entry.run_id,
                        "device_id": entry.device_id,
                        "state": "FAILED",
                        "error_code": error_code,
                        "error_message": error_message,
                        "result": result,
                    },
                )
                logger.warning(
                    "DEV.AGENT.RUN · run=%s FAILED code=%s exit=%s", entry.run_id, error_code, exit_code
                )
        except asyncio.CancelledError:
            if entry.pid:
                await _kill_tree(entry.pid)
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("DEV.AGENT.RUN · run=%s exception", entry.run_id)
            await self._send_failed(
                ws, entry, state="FAILED", error_code="unexpected_error", error_message=str(exc)
            )
