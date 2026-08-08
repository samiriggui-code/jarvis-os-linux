"""Surfaces agentiques — diffusion HUD + exécution d'intentions.

Admission (validateur, catalogue, gravité) : ``surfaces/admission.py`` (P2b).
Publisher ResultPanel : ``surfaces/publisher.py``.

Le Core est le seul point de passage entre un agent et l'écran
(`docs/architecture/JARVIS-Agentic-UI.md` §6).
"""

from __future__ import annotations

import inspect
import logging
import time
import uuid
from typing import Any

logger = logging.getLogger("jarvis.surface")

# ── Admission (P2b) — surfaces/admission.py ───────────────────────────────
from .surfaces.admission import (  # noqa: E402
    ANONYMOUS_PERMISSIONS,
    BindingResolver,
    CATALOG_PATH,
    GRAVITY_TO_RISK,
    MAX_COMPONENTS_PER_SURFACE,
    MAX_COMPONENTS_TOTAL,
    MAX_OVERLAYS,
    REGIONS,
    ROLE_PERMISSIONS,
    SIZES,
    SurfaceCatalog,
    SurfaceRejected,
    gravity_for,
    permissions_for,
    resolve_bindings,
    risk_of,
    validate_document,
)

PROTOCOL_VERSION = 1


def _pointer(path: str) -> list[str]:
    """Décode un JSON Pointer (RFC 6901).

    L'ordre de dé-échappement compte : `~1` avant `~0`, sinon `~01` devient
    `/` au lieu de `~1`.
    """
    if path == "":
        return []
    if not path.startswith("/"):
        raise SurfaceRejected(f"pointeur invalide (doit commencer par « / ») : {path}")
    return [seg.replace("~1", "/").replace("~0", "~") for seg in path[1:].split("/")]


def apply_patch(doc: dict[str, Any], ops: list[dict[str, Any]]) -> dict[str, Any]:
    """Applique un JSON Patch — `add`, `replace`, `remove` uniquement.

    **Tout ou rien** : on travaille sur une copie profonde et on ne la retourne
    qu'en cas de succès complet. Un patch à moitié appliqué laisserait le Core
    et le HUD dans deux états différents, sans que rien ne le signale.

    `move`, `copy` et `test` ne servent pas à une surface : les admettre
    ouvrirait des cas d'erreur pour rien.
    """
    import copy as _copy

    work = _copy.deepcopy(doc)

    for op in ops:
        kind = op.get("op")
        path = op.get("path")
        if kind not in ("add", "replace", "remove") or not isinstance(path, str):
            raise SurfaceRejected(f"opération invalide : {op}")

        segments = _pointer(path)
        if not segments:
            raise SurfaceRejected("patch sur la racine refusé")

        cursor: Any = work
        for seg in segments[:-1]:
            if isinstance(cursor, list):
                try:
                    cursor = cursor[int(seg)]
                except (ValueError, IndexError) as exc:
                    raise SurfaceRejected(f"« {path} » : segment « {seg} » invalide") from exc
            elif isinstance(cursor, dict) and seg in cursor:
                cursor = cursor[seg]
            else:
                raise SurfaceRejected(f"« {path} » : segment « {seg} » absent")

        last = segments[-1]

        if isinstance(cursor, list):
            index = len(cursor) if last == "-" else int(last)
            if kind == "add":
                cursor.insert(index, op.get("value"))
            elif kind == "replace":
                cursor[index] = op.get("value")
            else:
                del cursor[index]
        elif isinstance(cursor, dict):
            if kind == "replace" and last not in cursor:
                raise SurfaceRejected(f"« {path} » : clé absente, « replace » refusé")
            if kind == "remove":
                if last not in cursor:
                    raise SurfaceRejected(f"« {path} » : clé absente, rien à supprimer")
                del cursor[last]
            else:
                cursor[last] = op.get("value")
        else:
            raise SurfaceRejected(f"« {path} » : le parent n'est pas un conteneur")

    return work


class SurfaceBroadcaster:
    """Fabrique les enveloppes et tient la séquence.

    `seq` est monotone PAR RUN. Le HUD s'en sert pour détecter un trou et
    réclamer un snapshot : sans ça un delta perdu produirait une interface
    silencieusement fausse. En P0 on n'émet que des snapshots, mais la
    numérotation est déjà juste — la garde côté HUD peut donc être testée.
    """

    def __init__(self, catalog: SurfaceCatalog | None = None) -> None:
        self.catalog = catalog or SurfaceCatalog()
        self.run_id: str = ""
        self._seq = 0
        # Copie de vérité côté Core. Les deltas y sont appliqués avant émission,
        # pour qu'une resynchronisation renvoie l'état RÉEL et non l'original.
        self.document: dict[str, Any] = {}

    def _envelope(self, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._seq += 1
        return {
            "v": PROTOCOL_VERSION,
            "type": kind,
            "id": uuid.uuid4().hex,
            "ts": int(time.time() * 1000),
            "run_id": self.run_id,
            "seq": self._seq,
            "payload": payload,
        }

    def snapshot(self, document: dict[str, Any]) -> dict[str, Any]:
        """Nouvelle composition. Elle REMPLACE la précédente (décision §10.2-4).

        D'où le `run_id` neuf et la séquence remise à zéro : le HUD comprend
        qu'il ne s'agit pas de la suite de ce qu'il affichait.
        """
        self.run_id = uuid.uuid4().hex
        self._seq = 0
        self.document = document
        return self._envelope("SURFACE_SNAPSHOT", {"document": document})

    def resnapshot(self) -> dict[str, Any] | None:
        """Réémet l'état courant SANS changer de `run_id`.

        Réponse à une demande de resynchronisation : le HUD a détecté un trou
        et jeté son état. On lui redonne la vérité en gardant la composition
        en cours — un nouveau `run_id` lui ferait croire à une composition
        différente.
        """
        if not self.document:
            return None
        return self._envelope("SURFACE_SNAPSHOT", {"document": self.document})

    def open_approval(
        self, *, intent: str, gravity: str, reason: str, surface_id: str
    ) -> tuple[str, dict[str, Any]]:
        """Ouvre une demande d'autorisation et l'INJECTE dans la surface."""
        approval_id = uuid.uuid4().hex[:12]
        card_id = f"approval_{approval_id}"

        self.document.setdefault("pending", {}).setdefault("approvals", {})[approval_id] = {
            "intent": intent,
            "gravity": gravity,
            "reason": reason,
            "surface_id": surface_id,
        }

        surface = self.document.setdefault("surfaces", {}).setdefault(
            surface_id, {"root": [], "components": {}}
        )
        surface["components"][card_id] = {
            "name": "ApprovalCard",
            "props": {
                "approvalId": approval_id,
                "action": intent,
                "gravity": gravity,
                "reason": reason,
            },
            "state": "pending",
            "region": "top",
            "size": "wide",
            "children": [],
        }
        if card_id not in surface["root"]:
            surface["root"].insert(0, card_id)

        return approval_id, self._envelope("SURFACE_SNAPSHOT", {"document": self.document})

    def close_approval(
        self, approval_id: str, granted: bool
    ) -> tuple[dict[str, Any], dict[str, Any]] | None:
        """Retire la demande et sa carte. Rend `(état à rediffuser, demande)`."""
        pending = self.document.get("pending", {}).get("approvals", {})
        record = pending.pop(approval_id, None)
        if record is None:
            return None

        surface_id = record.get("surface_id", "")
        card_id = f"approval_{approval_id}"
        surface = self.document.get("surfaces", {}).get(surface_id)
        if surface:
            surface.get("components", {}).pop(card_id, None)
            surface["root"] = [r for r in surface.get("root", []) if r != card_id]

        event = self._envelope("SURFACE_SNAPSHOT", {"document": self.document})
        return event, record

    def delta(self, ops: list[dict[str, Any]]) -> dict[str, Any]:
        """Mise à jour incrémentale de la composition en cours."""
        self.document = apply_patch(self.document, ops)
        return self._envelope("SURFACE_DELTA", {"ops": ops})


class IntentNotExecutable(Exception):
    """Aucun exécutant pour cette intention. Refus explicite, jamais silence."""


class IntentExecutor:
    """Le maillon « Autorisation → **Exécution** » (§7.2 du contrat)."""

    def __init__(self) -> None:
        self._handlers: dict[str, Any] = {}

    def register(self, action: str, handler: Any) -> None:
        """Inscrit un exécutant. Réinscrire écrase — le dernier gagne."""
        self._handlers[action] = handler
        logger.info("exécutant enregistré · %s", action)

    @property
    def actions(self) -> list[str]:
        return sorted(self._handlers)

    def can(self, action: str) -> bool:
        return action in self._handlers

    async def execute(self, action: str, payload: dict[str, Any] | None = None) -> Any:
        """Exécute une intention DÉJÀ autorisée."""
        handler = self._handlers.get(action)
        if handler is None:
            raise IntentNotExecutable(
                f"« {action} » : aucun exécutant enregistré. L'action a été "
                "autorisée mais rien ne sait la réaliser."
            )

        result = handler(payload or {})
        if inspect.isawaitable(result):
            result = await result
        return result
