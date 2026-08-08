"""Magasin d'objectifs utilisateur — fichier JSON local (P3)."""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..db.config import default_data_dir

from .drain import (
    MISSION_BLOCKED,
    MISSION_DONE,
    MISSION_FAILED,
    MISSION_RUNNING,
    STEP_DONE,
    STEP_RUNNING,
    advance_step,
    mission_progress,
    runnable_steps,
)

logger = logging.getLogger("jarvis.missions")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Mission:
    id: str
    title: str
    status: str  # open | running | blocked_hitl | done | failed
    created_at: str
    updated_at: str
    user_id: str | None = None
    steps: list[dict[str, Any]] | None = None
    blocked_reason: str = ""
    mission_dev_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if d.get("steps") is None:
            d["steps"] = []
        return d


class MissionStore:
    """Objectifs foyer — un fichier, pas de LLM."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or (default_data_dir() / "missions.json")

    def _load(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        raw = self.path.read_text(encoding="utf-8").strip()
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("missions.json illisible — réinitialisation")
            return []
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        if isinstance(data, dict) and isinstance(data.get("missions"), list):
            return [x for x in data["missions"] if isinstance(x, dict)]
        return []

    def _save(self, rows: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"version": 1, "updated_at": _utc_now(), "missions": rows}
        self.path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    def list_missions(self, *, user_id: str | None = None, include_done: bool = True) -> list[Mission]:
        out: list[Mission] = []
        for row in self._load():
            if user_id and row.get("user_id") not in (None, user_id):
                continue
            if not include_done and row.get("status") == "done":
                continue
            try:
                row.setdefault("steps", [])
                row.setdefault("blocked_reason", "")
                row.setdefault("mission_dev_id", "")
                out.append(Mission(**{k: row[k] for k in Mission.__dataclass_fields__ if k in row}))
            except (TypeError, KeyError):
                continue
        out.sort(key=lambda m: m.created_at)
        return out

    def add(self, title: str, *, user_id: str | None = None) -> Mission:
        clean = (title or "").strip()
        if not clean:
            raise ValueError("titre vide")
        now = _utc_now()
        mission = Mission(
            id=uuid.uuid4().hex[:12],
            title=clean[:240],
            status="open",
            created_at=now,
            updated_at=now,
            user_id=user_id,
        )
        rows = self._load()
        rows.append(mission.to_dict())
        self._save(rows)
        logger.info("objectif ajouté · %s · user=%s", mission.id, user_id or "?")
        return mission

    def complete(self, ref: str, *, user_id: str | None = None) -> Mission | None:
        """Marque done par id ou par titre (partiel, insensible à la casse)."""
        needle = (ref or "").strip().lower()
        if not needle:
            return None
        rows = self._load()
        found: dict[str, Any] | None = None
        for row in rows:
            if user_id and row.get("user_id") not in (None, user_id):
                continue
            if row.get("status") == "done":
                continue
            mid = str(row.get("id") or "")
            title = str(row.get("title") or "").lower()
            if mid == needle or needle in title or title in needle:
                found = row
                break
        if found is None:
            return None
        found["status"] = "done"
        found["updated_at"] = _utc_now()
        self._save(rows)
        return Mission(**{k: found[k] for k in Mission.__dataclass_fields__ if k in found})

    def delete(self, ref: str, *, user_id: str | None = None) -> bool:
        needle = (ref or "").strip().lower()
        rows = self._load()
        kept: list[dict[str, Any]] = []
        removed = False
        for row in rows:
            if user_id and row.get("user_id") not in (None, user_id):
                kept.append(row)
                continue
            mid = str(row.get("id") or "")
            title = str(row.get("title") or "").lower()
            if not removed and (mid == needle or needle in title):
                removed = True
                continue
            kept.append(row)
        if removed:
            self._save(kept)
        return removed

    def start_drain(
        self,
        title: str,
        steps: list[dict[str, Any]],
        *,
        user_id: str | None = None,
        mission_dev_id: str = "",
    ) -> Mission:
        """Crée une mission en mode drain (étapes DAG)."""
        clean = (title or "").strip()
        if not clean:
            raise ValueError("titre vide")
        now = _utc_now()
        mission = Mission(
            id=uuid.uuid4().hex[:12],
            title=clean[:240],
            status=MISSION_RUNNING,
            created_at=now,
            updated_at=now,
            user_id=user_id,
            steps=list(steps),
            mission_dev_id=mission_dev_id,
        )
        rows = self._load()
        rows.append(mission.to_dict())
        self._save(rows)
        logger.info("drain démarré · %s · %d steps", mission.id, len(steps))
        return mission

    def _replace_row(self, row: dict[str, Any]) -> None:
        rows = self._load()
        for i, r in enumerate(rows):
            if r.get("id") == row.get("id"):
                rows[i] = row
                break
        self._save(rows)

    def _find_row(self, ref: str, *, user_id: str | None = None) -> dict[str, Any] | None:
        needle = (ref or "").strip().lower()
        for row in self._load():
            if user_id and row.get("user_id") not in (None, user_id):
                continue
            mid = str(row.get("id") or "")
            title = str(row.get("title") or "").lower()
            if mid == needle or needle in title:
                return row
        return None

    def begin_step(self, mission_ref: str, step_id: str, *, user_id: str | None = None) -> bool:
        row = self._find_row(mission_ref, user_id=user_id)
        if row is None:
            return False
        steps = row.get("steps") if isinstance(row.get("steps"), list) else []
        if not advance_step(steps, step_id, status=STEP_RUNNING):
            return False
        row["steps"] = steps
        row["status"] = MISSION_RUNNING
        row["updated_at"] = _utc_now()
        self._replace_row(row)
        return True

    def finish_step(
        self,
        mission_ref: str,
        step_id: str,
        *,
        ok: bool = True,
        tool_event_id: str = "",
        summary: str = "",
        user_id: str | None = None,
    ) -> dict[str, Any] | None:
        row = self._find_row(mission_ref, user_id=user_id)
        if row is None:
            return None
        steps = row.get("steps") if isinstance(row.get("steps"), list) else []
        status = STEP_DONE if ok else STEP_FAILED
        patch: dict[str, Any] = {}
        if tool_event_id:
            patch["tool_event_id"] = tool_event_id
        if summary:
            patch["summary"] = summary
        if not advance_step(steps, step_id, status=status, **patch):
            return None
        row["steps"] = steps
        prog = mission_progress(steps)
        if prog["failed"]:
            row["status"] = MISSION_FAILED
        elif prog["pending"] == 0 and prog["done"] == prog["total"]:
            row["status"] = MISSION_DONE
        else:
            row["status"] = MISSION_RUNNING
        row["updated_at"] = _utc_now()
        self._replace_row(row)
        return {"mission_id": row.get("id"), "progress": prog, "runnable": runnable_steps(steps)}

    def block(self, mission_ref: str, reason: str, *, user_id: str | None = None) -> bool:
        row = self._find_row(mission_ref, user_id=user_id)
        if row is None:
            return False
        row["status"] = MISSION_BLOCKED
        row["blocked_reason"] = (reason or "")[:500]
        row["updated_at"] = _utc_now()
        self._replace_row(row)
        return True
