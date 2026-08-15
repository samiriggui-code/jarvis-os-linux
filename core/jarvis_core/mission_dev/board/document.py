"""Document Agentic UI — DevIssueBoard (surface mission-control-dev)."""
from __future__ import annotations

from typing import Any

from .service import MissionDevBoardService

BOARD_COMPONENT = "dev-board-main"
SURFACE_ID = "mission-control-dev"


def mission_dev_board_document(
    *,
    board: dict[str, Any] | None = None,
    inbox: dict[str, Any] | None = None,
    voice_hint: str | None = None,
) -> dict[str, Any]:
    """Construit le snapshot SURFACE pour le HUD (composant registre DevIssueBoard)."""
    b = board or {}
    ib = inbox or {}
    issues = b.get("issues") if isinstance(b.get("issues"), list) else []
    blocked = ib.get("blocked") if isinstance(ib.get("blocked"), list) else []
    review = ib.get("review") if isinstance(ib.get("review"), list) else []
    inbox_count = len(blocked) + len(review)

    hint = voice_hint or (
        "Voix : « mission control dev » · « nouveau ticket … » · "
        "« assigne à cursor » · « lance le run »"
    )

    return {
        "surfaces": {
            SURFACE_ID: {
                "root": [BOARD_COMPONENT],
                "components": {
                    BOARD_COMPONENT: {
                        "name": "DevIssueBoard",
                        "props": {
                            "title": "Mission DEV · Board",
                            "columns": list(b.get("columns") or []),
                            "issues": issues[:80],
                            "inbox_count": inbox_count,
                            "inbox_blocked": blocked[:12],
                            "inbox_review": review[:12],
                            "voice_hint": hint[:500],
                        },
                        "state": "idle",
                        "region": "center",
                        "size": "fill",
                    }
                },
            }
        }
    }


def build_live_board_document(service: MissionDevBoardService) -> dict[str, Any]:
    return mission_dev_board_document(
        board=service.list_board(),
        inbox=service.inbox(),
    )
