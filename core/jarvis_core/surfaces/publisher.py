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
    """Diffuse un ResultPanel admissible dans la fenêtre d'app.

    Repli historique — équivalent à ``publish_component_surface`` avec
    ``component="ResultPanel"``. Conservé tel quel : plusieurs appelants
    (executors, mission_dev) passent par cette signature précise.
    """
    await publish_component_surface(
        orch,
        surface_id,
        component="ResultPanel",
        props={
            "title": title[:120],
            "body": (body or "")[:8000],
            "source": source[:80],
            "items": list(items or [])[:40],
        },
    )


async def publish_component_surface(
    orch: Any,
    surface_id: str,
    *,
    component: str,
    props: dict[str, Any],
) -> None:
    """Diffuse n'importe quel composant du catalogue UI dans la fenêtre d'app.

    ``component`` doit être un nom présent dans ``ui_catalog.json`` (généré
    par le HUD) — sinon ``validate_document`` refuse le document et rien ne
    s'affiche (comportement voulu : mieux vaut un refus journalisé qu'un
    composant inventé silencieusement accepté).
    """
    from ..surfaces.admission import SurfaceRejected, validate_document

    cid = "result-main"
    document = {
        "surfaces": {
            surface_id: {
                "root": [cid],
                "components": {
                    cid: {
                        "name": component,
                        "props": props,
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
        logger.warning("%s refusé · %s — %s", component, surface_id, exc)
        return
    except Exception as exc:  # noqa: BLE001
        logger.warning("%s impossible · %s", component, exc)
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
