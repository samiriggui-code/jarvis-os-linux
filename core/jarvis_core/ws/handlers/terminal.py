"""Terminal admin multi-hôte (NUC / VPS / Pi salon) — Dashboard.

Point d'entrée dédié, pas la route générique `surface`/action `intent` :
celle-ci dérive la gravité d'un composant de surface déjà monté (pensée pour
un clic sur un composant HUD existant), pas pour « tape une commande et
exécute-la ». Ici on réutilise les mêmes briques bas niveau (Policy,
approbation, IntentExecutor) sans passer par le catalogue de composants —
même garde-fou, entrée adaptée à l'usage réel.

NUC → `system.shell` (Owner.HERMES, chemin existant, inchangé).
VPS / Pi → `vps.terminal` / `pi.terminal` (Owner.CORE, `remote_exec.py`,
SSH dédié — voir capabilities.py et le plan Terminal admin).
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("jarvis.core")

from ...capabilities import for_intent
from ...policy import RiskLevel

_HOST_INTENTS = {
    "nuc": "system.shell",
    "vps": "vps.terminal",
    "pi": "pi.terminal",
}


class TerminalHandlerMixin:

    async def handle_terminal(self, ws: Any, data: dict[str, Any]) -> None:
        action = str(data.get("action") or "exec")

        if action == "exec":
            await self._terminal_exec(ws, data)
            return
        if action == "approval":
            await self._terminal_approval(ws, data)
            return

        await ws.send(json.dumps({
            "type": "terminal_result",
            "ok": False,
            "error": f"action inconnue : {action}",
        }))

    async def _terminal_exec(self, ws: Any, data: dict[str, Any]) -> None:
        host = str(data.get("host") or "").strip().lower()
        command = str(data.get("command") or "").strip()
        intent = _HOST_INTENTS.get(host)

        if intent is None:
            await ws.send(json.dumps({
                "type": "terminal_result",
                "ok": False,
                "error": f"hôte inconnu : « {host} » (nuc / vps / pi)",
            }))
            return
        if not command:
            await ws.send(json.dumps({"type": "terminal_result", "ok": False, "error": "commande vide"}))
            return

        # Le Terminal touche tout le foyer + le VPS — ADMIN seul, avant même
        # la Policy. `allows()` (capabilities.py) fait la même chose pour les
        # tuiles HUD ; ici la vérification est directe puisqu'il n'y a pas de
        # tuile.
        role = self._session_role(ws)
        if str(role or "").lower() != "admin":
            logger.warning("terminal REFUSÉ (rôle) · %s · rôle=%s", host, role)
            await ws.send(json.dumps({
                "type": "terminal_result",
                "ok": False,
                "error": "Terminal réservé à l'administrateur.",
            }))
            return

        cap = for_intent(intent)
        risk = cap.risk if cap else RiskLevel.ADMIN
        decision = self.policy.evaluate(action=intent, text=command, risk=risk)

        if not decision.allowed and not decision.needs_confirmation:
            logger.warning("terminal REFUSÉ · %s · « %s » — %s", host, command[:80], decision.reason)
            await ws.send(json.dumps({
                "type": "terminal_result",
                "ok": False,
                "host": host,
                "error": decision.reason,
            }))
            return

        if decision.needs_confirmation:
            approval_id, event = self.surfaces.open_approval(
                intent=intent,
                gravity=risk.name.lower(),
                reason=decision.reason or "Confirmation requise.",
                surface_id="terminal",
            )
            self._pending_prompts[approval_id] = command
            self._terminal_hosts[approval_id] = host
            logger.info(
                "terminal EN ATTENTE · %s · approval=%s · « %s » — %s",
                host, approval_id, command[:80], decision.reason,
            )
            await self.broadcast(event)
            await ws.send(json.dumps({
                "type": "terminal_pending",
                "ok": True,
                "host": host,
                "command": command,
                "approval_id": approval_id,
                "reason": decision.reason,
            }))
            return

        logger.info("terminal AUTORISÉ · %s · « %s »", host, command[:80])
        await self._terminal_run(ws, host, intent, command)

    async def _terminal_approval(self, ws: Any, data: dict[str, Any]) -> None:
        approval_id = str(data.get("approval_id") or "")
        granted = bool(data.get("granted"))

        # On vérifie AVANT de fermer que cette approbation nous appartient
        # (surface_id="terminal") — sinon cet endpoit pourrait accorder/rejeter
        # une carte ouverte par un tout autre chemin (HUD, `handle_surface`).
        pending = self.surfaces.document.get("pending", {}).get("approvals", {})
        peek = pending.get(approval_id)
        if peek is None or peek.get("surface_id") != "terminal":
            await ws.send(json.dumps({
                "type": "terminal_result",
                "ok": False,
                "error": "demande inconnue ou déjà traitée",
            }))
            return

        closed = self.surfaces.close_approval(approval_id, granted)
        if closed is None:
            await ws.send(json.dumps({
                "type": "terminal_result",
                "ok": False,
                "error": "demande inconnue ou déjà traitée",
            }))
            return

        event, record = closed
        logger.info(
            "terminal approbation %s · approval=%s",
            "ACCORDÉE" if granted else "REFUSÉE", approval_id,
        )
        await self.broadcast(event)

        host = self._terminal_hosts.pop(approval_id, "")

        if not granted:
            self._pending_prompts.pop(approval_id, None)
            await ws.send(json.dumps({
                "type": "terminal_result", "ok": True, "granted": False, "host": host,
            }))
            return

        command = self._pending_prompts.pop(approval_id, "")
        intent = str(record.get("intent") or "")
        if not command or not intent:
            await ws.send(json.dumps({
                "type": "terminal_result",
                "ok": False,
                "error": "commande introuvable (approbation expirée ?)",
            }))
            return

        await self._terminal_run(ws, host, intent, command)

    async def _terminal_run(self, ws: Any, host: str, intent: str, command: str) -> None:
        payload = {"command": command, "prompt": command}
        try:
            result = await self.intents.execute(intent, payload)
        except Exception as exc:  # noqa: BLE001 — une commande distante en échec ne casse pas la connexion
            logger.exception("terminal ÉCHEC · %s · « %s »", host, command[:80])
            await ws.send(json.dumps({
                "type": "terminal_result",
                "ok": False,
                "host": host,
                "error": str(exc),
            }))
            return

        # M2.1 — terminal contourne _execute_intent : Verification ici.
        # RemoteResult (vps/pi) = observation ; system.shell Hermes ≠ preuve.
        verification_meta = None
        verify = getattr(self, "_verify_after_execution", None)
        if callable(verify):
            verification_meta = await verify(
                intent=intent,
                result=result,
                payload=payload,
                user_id=self._session_user_id(ws) or "local",
                host=host,
                proposition=f"Terminal {host}: {command[:120]}",
            )

        base = {"type": "terminal_result", "host": host}
        if verification_meta is not None:
            base["verification"] = verification_meta
        if isinstance(result, dict):
            keep = {k: v for k, v in result.items() if k in ("ok", "output", "error", "returncode", "text")}
            await ws.send(json.dumps({**base, "ok": bool(keep.get("ok")), **keep}))
        else:
            await ws.send(json.dumps({**base, "ok": True, "output": str(result)}))
