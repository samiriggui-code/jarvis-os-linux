"""Phase 2 — handlers WS."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger("jarvis.core")

from ...policy import RiskLevel


class SurfaceHandlerMixin:

    async def handle_boot(self, ws: Any, data: dict[str, Any]) -> None:
        """Le HUD signale la fin de sa cinématique — l'annonce peut partir.

        C'est ce qui SYNCHRONISE la voix avec l'image : le Core ne devine pas
        la durée de la cinématique, il attend qu'on la lui dise. Changer la
        durée du voyage, ajouter un acte, mettre une machine plus lente — rien
        de tout cela ne désynchronise quoi que ce soit.
        """
        action = str(data.get("action") or "announce")
        if action == "skip":
            # Refresh / session déjà ouverte : pas de monologue boot.
            # On arme quand même le signal pour ne pas bloquer le grace timer,
            # et on envoie un boot_state end silencieux.
            self._boot_requested(ws).set()
            self._boot_skip = True
            logger.info("boot skip demandé par le HUD (session déjà ouverte)")
            await self._send_boot_state(ws, spoken=False)
            return
        if action != "announce":
            await ws.send(json.dumps({"type": "core_error", "reason": f"action boot inconnue : {action}"}))
            return
        self._boot_skip = False
        logger.info("cinématique terminée — annonce du boot demandée par le HUD")
        self._boot_requested(ws).set()
    def _boot_requested(self, ws: Any) -> asyncio.Event:
        """Signal « ce client est prêt à entendre le boot », un par connexion."""
        events = getattr(self, "_boot_events", None)
        if events is None:
            events = {}
            self._boot_events = events
        key = id(ws)
        if key not in events:
            events[key] = asyncio.Event()
        return events[key]
    async def handle_surface(self, ws: Any, data: dict[str, Any]) -> None:
        """Admet un document de surface et le diffuse au HUD.

        Le Core est le SEUL chemin entre un agent et l'écran : rien n'atteint
        le HUD sans passer par cette validation. En P0 l'émetteur est un
        fichier JSON écrit à la main ; en P3 ce sera Hermes. Le contrôle est le
        même — c'est tout l'intérêt de le poser maintenant.

        Un refus repart à l'appelant avec sa raison, et n'est jamais diffusé :
        une composition invalide ne doit pas atteindre l'écran, même
        partiellement.
        """
        from ...surface import SurfaceRejected, validate_document

        action = str(data.get("action") or "snapshot")

        if action == "catalog":
            await ws.send(
                json.dumps(
                    {
                        "type": "surface_catalog",
                        "ok": True,
                        "components": self.surfaces.catalog.names,
                    }
                )
            )
            return

        if action == "intent":
            # Une intention remontée par un composant. Elle n'exécute RIEN par
            # elle-même : la Policy tranche, et seule une autorisation permet
            # d'aller plus loin. C'est l'invariant du produit :
            #   IA → Proposition → Policy Engine → Autorisation → Exécution
            from ...surface import gravity_for, risk_of

            intent = str(data.get("intent") or "")
            surface_id = str(data.get("surface_id") or "")
            component_id = str(data.get("component_id") or "")

            # ⚠ La gravité est DÉRIVÉE du catalogue, jamais reçue du client.
            # Elle était lue dans `data["gravity"]` : n'importe quel WebSocket
            # pouvait donc annoncer `gravity: "info"` pour une action `admin` et
            # traverser la Policy sans confirmation. Le HUD calculait bien la
            # bonne valeur, mais un contrôle appliqué du côté contrôlé n'est pas
            # un contrôle.
            component_name = self._surface_component_name(surface_id, component_id)
            gravity = gravity_for(self.surfaces.catalog, component_name, intent)

            claimed = data.get("gravity")
            if isinstance(claimed, str) and claimed.lower() != gravity:
                logger.warning(
                    "gravité annoncée « %s » ignorée · %s → %s (catalogue, composant %s)",
                    claimed,
                    intent,
                    gravity,
                    component_name or "?",
                )

            decision = self.policy.evaluate(action=intent, risk=RiskLevel(risk_of(gravity)))

            if not decision.allowed and not decision.needs_confirmation:
                logger.warning("intention REFUSÉE · %s (%s) — %s", intent, gravity, decision.reason)
                await ws.send(
                    json.dumps(
                        {"type": "surface_error", "ok": False, "intent": intent, "reason": decision.reason}
                    )
                )
                return

            if decision.needs_confirmation:
                approval_id, event = self.surfaces.open_approval(
                    intent=intent,
                    gravity=gravity,
                    reason=decision.reason or "Confirmation requise.",
                    surface_id=surface_id,
                )
                logger.info(
                    "intention EN ATTENTE · %s (%s) · approval=%s — %s",
                    intent,
                    gravity,
                    approval_id,
                    decision.reason,
                )
                await self.broadcast(event)
                await ws.send(
                    json.dumps({"type": "surface_result", "ok": True, "pending": approval_id})
                )
                return

            # Autorisée sans confirmation — gravité faible uniquement.
            logger.info("intention AUTORISÉE · %s (%s)", intent, gravity)
            await self._execute_intent(ws, intent, {"surface_id": surface_id, "component_id": component_id})
            return

        if action == "approval":
            approval_id = str(data.get("approval_id") or "")
            granted = bool(data.get("granted"))
            closed = self.surfaces.close_approval(approval_id, granted)
            if closed is None:
                await ws.send(
                    json.dumps({"type": "surface_error", "ok": False, "reason": "demande inconnue ou déjà traitée"})
                )
                return
            event, record = closed
            # Tracé dans les deux sens : une autorisation comme un refus doivent
            # laisser une trace. Un refus silencieux est indistinguable d'un bug.
            logger.info("approbation %s · approval=%s", "ACCORDÉE" if granted else "REFUSÉE", approval_id)
            await self.broadcast(event)

            if not granted:
                # Une phrase mise de côté pour cette demande n'a plus de raison
                # d'exister. La garder ferait s'accumuler en mémoire ce que
                # l'utilisateur vient précisément de refuser.
                self._pending_prompts.pop(approval_id, None)
                await ws.send(json.dumps({"type": "surface_result", "ok": True, "granted": False}))
                return

            # ⚠ Le maillon qui manquait. L'intention approuvée était perdue ici :
            # la carte disparaissait, l'état était rediffusé, et rien ne
            # s'exécutait. « Autorisation → Exécution » s'arrêtait à la flèche.
            await self._execute_intent(
                ws,
                str(record.get("intent") or ""),
                {"surface_id": record.get("surface_id", ""), "approval_id": approval_id},
                granted=True,
            )
            return

        if action == "open":
            # Une tuile du volet Applications. C'est une INTENTION, pas une app :
            # ce qui l'exécute derrière (Core, Hermes, agent d'appareil) ne
            # remonte jamais à l'utilisateur.
            #
            # Le chemin est identique à celui d'une intention émise par un
            # composant — même Policy, même carte d'autorisation, même exécution.
            # Le lanceur ne bénéficie d'aucun raccourci : c'est ce qui empêche
            # « cliquer sur Maison » d'être plus permissif que « demander à
            # Hermes d'allumer le salon ».
            from ...capabilities import for_app

            app_id = str(data.get("app") or "")
            cap = for_app(app_id)
            if cap is None:
                await ws.send(
                    json.dumps(
                        {
                            "type": "surface_error",
                            "ok": False,
                            "app": app_id,
                            "reason": f"intention inconnue : « {app_id} »",
                        }
                    )
                )
                return

            await self._open_intent(ws, cap, str(data.get("prompt") or "").strip())
            return

        if action == "compose":
            # P3 — une question produit une surface. Le chemin est volontairement
            # identique à celui d'un document écrit à la main : la proposition du
            # LLM ne bénéficie d'AUCUN passe-droit, elle traverse la même
            # admission. C'est tout l'intérêt d'avoir fait P2 avant.
            from ...composer import CompositionRejected, SurfaceComposer

            question = str(data.get("question") or "").strip()
            if not question:
                await ws.send(
                    json.dumps({"type": "surface_error", "ok": False, "reason": "question vide"})
                )
                return

            # La fenêtre visée. Sans elle, la composition atterrissait sous la
            # clé « main » du gabarit tandis que le HUD cherchait l'id de l'app :
            # admise, diffusée, et invisible. On l'exige donc explicitement.
            target = str(data.get("surface_id") or "").strip()
            if not target:
                await ws.send(
                    json.dumps(
                        {"type": "surface_error", "ok": False, "reason": "`surface_id` absent — on ne compose pas dans le vide"}
                    )
                )
                return

            permissions, context = self._surface_guards()
            composer = SurfaceComposer(self.surfaces.catalog, self.providers)

            try:
                proposal = await composer.propose(
                    question,
                    surface_id=target,
                    permissions=permissions,
                    binding_sources=self.bindings.describe(permissions),
                )
                document = validate_document(
                    proposal["document"],
                    self.surfaces.catalog,
                    permissions=permissions,
                    context=context,
                    bindings=self.bindings,
                )
            except (CompositionRejected, SurfaceRejected) as exc:
                # Critère de sortie P3 : « une proposition invalide est rejetée
                # ET VISIBLE ». Journal serveur et retour client, comme un refus
                # d'admission ordinaire.
                logger.warning("composition refusée · « %s » — %s", question[:60], exc)
                await ws.send(
                    json.dumps(
                        {
                            "type": "surface_error",
                            "ok": False,
                            "reason": str(exc),
                            "question": question,
                        }
                    )
                )
                return
            except Exception as exc:  # noqa: BLE001
                # Pas de LLM joignable, réseau coupé… `JARVIS BASE` doit survivre
                # sans IA : on refuse la composition, on ne casse pas le Core.
                logger.error("composition impossible · %s", exc)
                await ws.send(
                    json.dumps(
                        {"type": "surface_error", "ok": False, "reason": f"composition indisponible : {exc}"}
                    )
                )
                return

            event = self.surfaces.snapshot(document)
            await self.broadcast(event)
            logger.info(
                "surface COMPOSÉE · run=%s · surface=%s · confiance=%.2f · « %s »",
                event["run_id"][:8],
                target,
                proposal["confidence"],
                question[:60],
            )
            await ws.send(
                json.dumps(
                    {
                        "type": "surface_result",
                        "ok": True,
                        "composed": True,
                        "surface_id": target,
                        "confidence": proposal["confidence"],
                        "reasoning": proposal["reasoning"],
                    }
                )
            )
            return

        if action == "resync":
            # Le HUD a détecté un trou de séquence et jeté son état. On lui
            # renvoie l'état RÉEL (deltas compris), sans changer de `run_id` :
            # ce n'est pas une nouvelle composition, c'est la même, retrouvée.
            event = self.surfaces.resnapshot()
            if event is None:
                await ws.send(json.dumps({"type": "surface_error", "ok": False, "reason": "aucune surface en cours"}))
                return
            logger.info("resynchronisation · run=%s", event["run_id"][:8])
            await ws.send(json.dumps(event))
            return

        if action == "delta":
            ops = data.get("ops")
            if not isinstance(ops, list) or not ops:
                await ws.send(json.dumps({"type": "surface_error", "ok": False, "reason": "`ops` vide ou absent"}))
                return
            try:
                permissions, context = self._surface_guards()
                event = self.surfaces.delta(ops)
                # Le document patché doit rester admissible : un delta ne doit
                # pas pouvoir introduire par la bande un composant hors
                # catalogue — ni une permission, une prop ou une liaison de
                # données — que le snapshot aurait refusé.
                validate_document(
                    self.surfaces.document,
                    self.surfaces.catalog,
                    permissions=permissions,
                    context=context,
                    bindings=self.bindings,
                )
            except SurfaceRejected as exc:
                logger.warning("delta refusé : %s", exc)
                await ws.send(json.dumps({"type": "surface_error", "ok": False, "reason": str(exc)}))
                return
            await self.broadcast(event)
            logger.info("delta diffusé · run=%s · seq=%s · %d op(s)", event["run_id"][:8], event["seq"], len(ops))
            await ws.send(json.dumps({"type": "surface_result", "ok": True, "seq": event["seq"]}))
            return

        if action != "snapshot":
            await ws.send(
                json.dumps({"type": "surface_error", "ok": False, "reason": f"action inconnue : {action}"})
            )
            return

        try:
            permissions, context = self._surface_guards()
            document = validate_document(
                data.get("document"),
                self.surfaces.catalog,
                permissions=permissions,
                context=context,
                bindings=self.bindings,
            )
        except SurfaceRejected as exc:
            # Bruyant des deux côtés : journal serveur ET retour au client.
            logger.warning("surface refusée : %s", exc)
            await ws.send(json.dumps({"type": "surface_error", "ok": False, "reason": str(exc)}))
            return

        event = self.surfaces.snapshot(document)
        await self.broadcast(event)
        logger.info(
            "surface diffusée · run=%s · surfaces=%s",
            event["run_id"][:8],
            ", ".join(document.get("surfaces", {})),
        )
        await ws.send(json.dumps({"type": "surface_result", "ok": True, "run_id": event["run_id"]}))
