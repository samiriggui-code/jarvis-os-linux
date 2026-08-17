"""Preuve Tool Bus Phase 1 — axe `Operation` + journal `tool_events`.

Ne couvre pas `_execute_intent` (nécessiterait un `Orchestrator` complet, avec
auth/WS/supervisor — hors de portée d'un smoke test) : couvre les deux pièces
qu'il assemble — `PolicyEngine.evaluate(operation=...)` et `tool_events.py` —
directement, comme `_smoke_p2.py` teste `IntentExecutor` sans Orchestrator.

    ./.venv/Scripts/python.exe -m jarvis_core._smoke_tool_events
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from .capabilities import CAPABILITIES
from .policy import Operation, PolicyEngine, RiskLevel

OK, KO = "  \033[32mOK\033[0m  ", "  \033[31mÉCHEC\033[0m  "
_failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"{OK if condition else KO}{label}" + (f" — {detail}" if detail else ""))
    if not condition:
        _failures.append(label)


async def main() -> int:
    print("\n\033[1m1. `Operation` — axe orthogonal à `RiskLevel`\033[0m")
    policy = PolicyEngine()

    baseline = policy.evaluate(action="core.monitor", risk=RiskLevel.INFO)
    check("sans `operation` : comportement inchangé (pas de confirmation)",
          baseline.allowed and not baseline.needs_confirmation)

    destructive = policy.evaluate(action="core.monitor", risk=RiskLevel.INFO,
                                   operation=Operation.DESTRUCTIVE)
    check("`DESTRUCTIVE` exige confirmation même en RiskLevel.INFO",
          destructive.needs_confirmation, destructive.reason or "")
    check("`DESTRUCTIVE` reste autorisée (juste confirmée, pas bloquée)",
          destructive.allowed)

    print("\n\033[1m2. `capabilities.py` — capacités classées hors défaut READ\033[0m")
    check("`home` est WRITE (domotique — état modifié, réversible)",
          CAPABILITIES["home"].operation is Operation.WRITE)
    check("`terminal` est EXECUTE (lance une commande)",
          CAPABILITIES["terminal"].operation is Operation.EXECUTE)
    check("`monitor` reste READ (défaut, consultation seule)",
          CAPABILITIES["monitor"].operation is Operation.READ)
    check("`memory.store_note` est WRITE (M4 Hermes note)",
          CAPABILITIES["memory-store-note"].operation is Operation.WRITE)
    non_default = sum(1 for c in CAPABILITIES.values() if c.operation is not Operation.READ)
    # 31 depuis l'ajout de `dev.board.start_run` (EXECUTE) — Mission DEV Board.
    check("30 capacités explicitement non-READ", non_default == 30, f"trouvé {non_default}")

    print("\n\033[1m3. `tool_events.py` — journal non bloquant, sur DB isolée\033[0m")
    tmp_dir = Path(tempfile.mkdtemp(prefix="jarvis_tool_events_"))
    db_url = f"sqlite:///{(tmp_dir / 'smoke.db').as_posix()}"

    from .db import session as db_session
    from .db.base import Base
    from .db.models import ToolEventRow  # noqa: F401 — enregistre la table sur Base.metadata AVANT create_all

    # `session_scope()` sans URL explicite (le cas normal, appelé depuis le fil
    # d'écriture de `tool_events.py`) résout `database_url()` depuis l'environnement.
    # Sans ceci, ce fil écrirait silencieusement vers la vraie base du projet —
    # exactement le genre de fuite déjà payé une fois (cf. REPRISE-2026-08-06 §2,
    # 79 lignes `provider='test'` dans `usage_events`). Isoler par l'environnement,
    # pas seulement par l'argument `url=`, est donc la condition du test propre.
    os.environ["JARVIS_DATABASE_URL"] = db_url

    db_session.reset_engine()
    engine = db_session.get_engine()
    Base.metadata.create_all(engine)

    from . import tool_events as te

    te.record_tool_event(te.ToolEvent(
        intent="home.control", stage="started", owner="core", risk=int(RiskLevel.HOME),
        operation=Operation.WRITE.value, role="user", user_id="u1", device_id="core",
    ))
    te.record_tool_event(te.ToolEvent(
        intent="home.control", stage="completed", owner="core", risk=int(RiskLevel.HOME),
        operation=Operation.WRITE.value, role="user", user_id="u1", device_id="core",
        duration_ms=12.5,
    ))
    te.record_tool_event(te.ToolEvent(
        intent="web.search", stage="failed", owner="hermes", toolset="web",
        risk=int(RiskLevel.INFO), operation=Operation.READ.value, role="user",
        user_id="u1", device_id="nuc", reason="backend extract absent",
    ))

    flushed = te.flush_tool_events(timeout=5.0)
    check("la file se vide dans le délai", flushed)

    from .db.models import ToolEventRow

    with db_session.session_scope(url=db_url) as s:
        # Extraire en dicts pendant que la session est ouverte : les objets
        # ORM s'expirent au commit, les relire après `with` lève
        # `DetachedInstanceError`.
        rows = [
            {"stage": r.stage, "device_id": r.device_id, "reason": r.reason}
            for r in s.query(ToolEventRow).order_by(ToolEventRow.id).all()
        ]

    check("3 événements écrits", len(rows) == 3, f"trouvé {len(rows)}")
    check("l'ordre started → completed est respecté",
          len(rows) >= 2 and rows[0]["stage"] == "started" and rows[1]["stage"] == "completed")
    check("`device_id` porté jusqu'en base (préparation multi-machine)",
          len(rows) >= 3 and rows[0]["device_id"] == "core" and rows[2]["device_id"] == "nuc")
    check("le refus Hermes est tracé avec sa raison",
          len(rows) >= 3 and rows[2]["reason"] == "backend extract absent")

    te.record_tool_event_sync(te.ToolEvent(
        intent="core.preferences", stage="started", owner="core",
        risk=int(RiskLevel.INFO), operation=Operation.WRITE.value,
    ))
    with db_session.session_scope(url=db_url) as s:
        count = s.query(ToolEventRow).count()
    check("`record_tool_event_sync` écrit immédiatement (tests/outils)", count == 4)

    print()
    if _failures:
        print(f"\033[31m{len(_failures)} échec(s) : {', '.join(_failures)}\033[0m\n")
        return 1
    print("\033[32mTool Bus Phase 1 vérifié — Operation, capabilities, journal.\033[0m\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
