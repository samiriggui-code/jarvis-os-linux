"""Client Cursor Cloud Agents API (Phase 2 — Mission Control Dev).

Docs : https://cursor.com/docs/cloud-agent/api/endpoints
Auth : Basic (clé en username, mot de passe vide) ou Bearer.
Clé : ``CURSOR_API_KEY`` dans ``/etc/jarvis/core.env`` uniquement — jamais git.

``autoCreatePR`` / deploy / commit forcé : **toujours false** par défaut côté
JARVIS. ``read_only`` → ``mode=plan`` ; sinon ``mode=agent``.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any
from urllib import error, request

logger = logging.getLogger("jarvis.cursor_agents")

DEFAULT_API_BASE = "https://api.cursor.com"
DEVICE_ID_CLOUD = "cursor-cloud"

# Statuts terminaux Get A Run (v1).
TERMINAL_RUN_STATUSES = frozenset({"FINISHED", "ERROR", "CANCELLED", "EXPIRED"})
ACTIVE_RUN_STATUSES = frozenset({"CREATING", "RUNNING"})


class CursorAgentsError(Exception):
    def __init__(self, message: str, *, code: str = "cursor_api_error", status: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


def api_key() -> str:
    return (os.environ.get("CURSOR_API_KEY") or "").strip()


def api_base() -> str:
    return (os.environ.get("JARVIS_CURSOR_API_BASE") or DEFAULT_API_BASE).strip().rstrip("/")


def is_configured() -> bool:
    return bool(api_key())


def resolve_repo_url(*, workspace_id: str, repo_name: str | None, local_path: str | None) -> str:
    """Dérive l'URL GitHub pour ``repos[].url``.

    Ordre :
    1. ``JARVIS_CURSOR_REPO_URL`` (prod NUC)
    2. ``JARVIS_CURSOR_REPO_URL_<WORKSPACE>`` (ex. JARVIS_CURSOR_REPO_URL_JARVIS_MAIN)
    3. ``repo_name`` si forme ``org/repo``
    """
    explicit = (os.environ.get("JARVIS_CURSOR_REPO_URL") or "").strip()
    if explicit:
        return explicit
    ws_key = "JARVIS_CURSOR_REPO_URL_" + str(workspace_id or "").strip().upper().replace("-", "_")
    per_ws = (os.environ.get(ws_key) or "").strip()
    if per_ws:
        return per_ws
    name = str(repo_name or "").strip().strip("/")
    if name.count("/") == 1 and " " not in name and not name.startswith("http"):
        return f"https://github.com/{name}"
    # local_path n'implique pas d'URL distante — refus honnête.
    _ = local_path
    return ""


def build_create_payload(
    *,
    prompt: str,
    repo_url: str,
    read_only: bool,
    starting_ref: str | None = None,
    name: str | None = None,
) -> dict[str, Any]:
    """Mappe DevAgentRunParams → body POST /v1/agents.

    - ``permissions.write`` n'existe pas en v1 public → ``mode=plan|agent``
    - ``autoCreatePR`` toujours False (pas de PR/deploy sans Policy explicite future)
    """
    repo: dict[str, Any] = {"url": repo_url}
    ref = (starting_ref or os.environ.get("JARVIS_CURSOR_STARTING_REF") or "main").strip()
    if ref:
        repo["startingRef"] = ref
    payload: dict[str, Any] = {
        "prompt": {"text": str(prompt or "").strip()},
        "repos": [repo],
        "autoCreatePR": False,
        "workOnCurrentBranch": False,
        "mode": "plan" if read_only else "agent",
    }
    if name:
        payload["name"] = str(name)[:100]
    return payload


def _auth_header(key: str) -> str:
    token = base64.b64encode(f"{key}:".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def _request(
    method: str,
    path: str,
    *,
    body: dict[str, Any] | None = None,
    timeout_s: float = 60.0,
) -> dict[str, Any]:
    key = api_key()
    if not key:
        raise CursorAgentsError("CURSOR_API_KEY absente", code="cursor_key_missing")
    url = f"{api_base()}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "Authorization": _auth_header(key),
        "Accept": "application/json",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = request.Request(
        url,
        data=data,
        method=method.upper(),
        headers=headers,
    )
    try:
        with request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw.strip():
                return {}
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {"data": parsed}
    except error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:400]
        except Exception:  # noqa: BLE001
            detail = str(exc)
        raise CursorAgentsError(
            f"Cursor API {method} {path} → HTTP {exc.code}: {detail}",
            code="cursor_http_error",
            status=int(exc.code),
        ) from exc
    except error.URLError as exc:
        raise CursorAgentsError(f"Cursor API injoignable : {exc}", code="cursor_unreachable") from exc
    except json.JSONDecodeError as exc:
        raise CursorAgentsError("Réponse Cursor non-JSON", code="cursor_bad_json") from exc


def create_agent(payload: dict[str, Any], *, timeout_s: float = 60.0) -> dict[str, Any]:
    """POST /v1/agents → ``{agent, run}``."""
    return _request("POST", "/v1/agents", body=payload, timeout_s=timeout_s)


def list_agents(*, limit: int = 20, timeout_s: float = 20.0) -> dict[str, Any]:
    """GET /v1/agents — sonde clé + compte d'agents récents (pas les tokens)."""
    n = max(1, min(int(limit), 100))
    return _request("GET", f"/v1/agents?limit={n}", timeout_s=timeout_s)


def get_agent_usage(
    agent_id: str,
    *,
    run_id: str | None = None,
    timeout_s: float = 20.0,
) -> dict[str, Any]:
    """GET /v1/agents/{id}/usage — tokens mesurés (Cloud Agents uniquement)."""
    from urllib.parse import quote

    aid = str(agent_id or "").strip()
    path = f"/v1/agents/{quote(aid)}/usage"
    rid = str(run_id or "").strip()
    if rid:
        path += f"?runId={quote(rid)}"
    return _request("GET", path, timeout_s=timeout_s)


def parse_cursor_usage(payload: dict[str, Any]) -> dict[str, int]:
    """Extrait input/output/total depuis ``totalUsage`` — jamais inventé."""
    total = payload.get("totalUsage") if isinstance(payload, dict) else None
    if not isinstance(total, dict):
        total = {}
    tin = int(total.get("inputTokens") or 0) + int(total.get("cacheReadTokens") or 0)
    tout = int(total.get("outputTokens") or 0) + int(total.get("cacheWriteTokens") or 0)
    billed = int(total.get("totalTokens") or 0)
    if billed <= 0:
        billed = tin + tout
    return {
        "tokens_in": tin,
        "tokens_out": tout,
        "total_tokens": billed,
        "cache_read": int(total.get("cacheReadTokens") or 0),
        "cache_write": int(total.get("cacheWriteTokens") or 0),
    }


def record_run_usage(agent_id: str, run_id: str) -> None:
    """Télémétrie locale après un run Cloud — n'échoue jamais vers l'appelant."""
    from .usage import record_event

    aid = str(agent_id or "").strip()
    rid = str(run_id or "").strip()
    parsed = {
        "tokens_in": 0,
        "tokens_out": 0,
        "total_tokens": 0,
        "cache_read": 0,
        "cache_write": 0,
    }
    try:
        raw = get_agent_usage(aid, run_id=rid)
        parsed = parse_cursor_usage(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("cursor usage %s/%s : %s", aid, rid, exc)
    record_event(
        provider="cursor",
        model="cursor-cloud-agent",
        tokens_in=int(parsed["tokens_in"]),
        tokens_out=int(parsed["tokens_out"]),
        cost_usd=0.0,
        meta={
            "agent_id": aid,
            "run_id": rid,
            "total_tokens": parsed["total_tokens"],
            "cache_read": parsed["cache_read"],
            "cache_write": parsed["cache_write"],
        },
    )


def get_run(agent_id: str, run_id: str, *, timeout_s: float = 30.0) -> dict[str, Any]:
    """GET /v1/agents/{id}/runs/{runId}."""
    aid = str(agent_id or "").strip()
    rid = str(run_id or "").strip()
    return _request("GET", f"/v1/agents/{aid}/runs/{rid}", timeout_s=timeout_s)


def cancel_run(agent_id: str, run_id: str, *, timeout_s: float = 30.0) -> dict[str, Any]:
    """POST /v1/agents/{id}/runs/{runId}/cancel."""
    aid = str(agent_id or "").strip()
    rid = str(run_id or "").strip()
    return _request("POST", f"/v1/agents/{aid}/runs/{rid}/cancel", body={}, timeout_s=timeout_s)


def map_run_status(status: str) -> str:
    """Statut Cloud → RunState.value (string)."""
    s = str(status or "").strip().upper()
    if s in ("CREATING", "RUNNING"):
        return "RUNNING" if s == "RUNNING" else "ACCEPTED"
    if s == "FINISHED":
        return "COMPLETED"
    if s == "CANCELLED":
        return "CANCELLED"
    if s in ("ERROR", "EXPIRED"):
        return "FAILED"
    return "RUNNING"


def result_from_cloud_run(
    *,
    local_run_id: str,
    workspace_id: str,
    cloud: dict[str, Any],
    agent_id: str,
    collect_git_diff: bool,
) -> dict[str, Any]:
    """Construit un dict compatible ``DevAgentRunResult.from_dict``.

    CLAIM = ``result`` (texte agent). OBSERVATIONS = branches git / durée —
    **pas** de faux ``git_diff_patch`` inventé (API Cloud n'en fournit pas).
    """
    status = str(cloud.get("status") or "").upper()
    ok = status == "FINISHED"
    claim = cloud.get("result")
    if claim is not None:
        claim = str(claim)
    git = cloud.get("git") if isinstance(cloud.get("git"), dict) else {}
    branches = list(git.get("branches") or []) if isinstance(git, dict) else []
    files_changed: list[str] = []
    for b in branches:
        if not isinstance(b, dict):
            continue
        branch = str(b.get("branch") or "").strip()
        repo = str(b.get("repoUrl") or "").strip()
        pr = str(b.get("prUrl") or "").strip()
        label = " / ".join(x for x in (repo, branch, pr) if x)
        if label:
            files_changed.append(label)

    git_diff_stat = None
    if collect_git_diff and branches:
        # Observation minimale honnête — pas un patch.
        git_diff_stat = f"cloud_branches={len(branches)}"

    return {
        "run_id": local_run_id,
        "agent": "cursor",
        "device_id": DEVICE_ID_CLOUD,
        "workspace_id": workspace_id,
        "ok": ok,
        "exit_code": 0 if ok else 1,
        "duration_ms": cloud.get("durationMs"),
        "agent_result": claim,  # CLAIM only
        "structured_output": {
            "source": "cursor_cloud_agents",
            "cloud_agent_id": agent_id,
            "cloud_run_id": str(cloud.get("id") or ""),
            "cloud_status": status,
            "git": git,
            "agent_url": f"https://cursor.com/agents/{agent_id}",
        },
        "files_changed": files_changed,
        "git_diff_stat": git_diff_stat,
        "git_diff_patch": None,  # jamais inventé
        "tests": [],
        "error_code": None if ok else str(status or "cloud_run_failed").lower(),
        "error_message": None if ok else (claim or f"Cloud run status={status}"),
    }
