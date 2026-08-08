"""Surface Publisher — ResultPanel + open_space (Phase 6)."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger("jarvis.core")


async def publish_result_surface(
    orch: Any,
    surface_id: str,
    *,
    title: str,
    body: str,
    source: str = "",
    items: list[str] | None = None,
) -> None:
    """Diffuse un ResultPanel admissible dans la fenêtre d'app."""
    from ..surfaces.admission import SurfaceRejected, validate_document

    cid = "result-main"
    document = {
        "surfaces": {
            surface_id: {
                "root": [cid],
                "components": {
                    cid: {
                        "name": "ResultPanel",
                        "props": {
                            "title": title[:120],
                            "body": (body or "")[:8000],
                            "source": source[:80],
                            "items": list(items or [])[:40],
                        },
                        "state": "idle",
                    }
                },
            }
        }
    }
    try:
        permissions, context = orch._surface_guards()
        document = validate_document(
            document,
            orch.surfaces.catalog,
            permissions=permissions,
            context=context,
            bindings=orch.bindings,
        )
    except SurfaceRejected as exc:
        logger.warning("ResultPanel refusé · %s — %s", surface_id, exc)
        return
    except Exception as exc:  # noqa: BLE001
        logger.warning("ResultPanel impossible · %s", exc)
        return

    event = orch.surfaces.snapshot(document)
    await orch.broadcast(
        {
            "type": "hud_command",
            "action": "open_space",
            "app": surface_id,
        }
    )
    await asyncio.sleep(0.25)
    await orch.broadcast(event)
    await asyncio.sleep(0.15)
    again = orch.surfaces.resnapshot()
    if again is not None:
        await orch.broadcast(again)
