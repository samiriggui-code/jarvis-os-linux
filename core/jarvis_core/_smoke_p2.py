"""Preuve P2 — Policy + HITL, bout en bout, sans WebSocket ni navigateur.

Critère d'acceptation du contrat (§9) : « Une action `admin` est **bloquée** ;
l'approbation **débloque** ; le refus est **tracé** ».

Le troisième point était le seul vrai : ça bloquait, ça traçait, mais rien ne
débloquait — `close_approval` jetait l'intention. Ce fichier échoue si la
régression revient.

    ./.venv/Scripts/python.exe -m jarvis_core._smoke_p2
"""

from __future__ import annotations

import asyncio
import sys

# La console Windows est en cp1252 : sans ça, la première flèche « → » tue le
# script avec un UnicodeEncodeError et on croit à un échec du test. Même piège
# que `agent-reach doctor` (cf. agent_reach_status.py).
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from .policy import PolicyEngine, RiskLevel
from .surface import (
    BindingResolver,
    IntentExecutor,
    IntentNotExecutable,
    SurfaceBroadcaster,
    SurfaceRejected,
    gravity_for,
    permissions_for,
    risk_of,
    validate_document,
)

OK, KO = "  \033[32mOK\033[0m  ", "  \033[31mÉCHEC\033[0m  "
_failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"{OK if condition else KO}{label}" + (f" — {detail}" if detail else ""))
    if not condition:
        _failures.append(label)


def rejects(label: str, fn) -> None:
    """Attend un refus. Un document accepté ici est un trou de sécurité."""
    try:
        fn()
    except SurfaceRejected as exc:
        check(label, True, str(exc)[:78])
    else:
        check(label, False, "ACCEPTÉ alors qu'il devait être refusé")


def doc(name: str, **node) -> dict:
    return {"surfaces": {"main": {"root": ["c1"], "components": {"c1": {"name": name, **node}}}}}


async def main() -> int:
    bus = SurfaceBroadcaster()
    cat = bus.catalog
    policy = PolicyEngine()

    print("\n\033[1m1. Gravité dérivée du catalogue, pas du client\033[0m")
    check(
        "action déclarée admin → admin",
        gravity_for(cat, "ActionRequest", "service.restart") == "admin",
    )
    check("action inconnue d'un composant → admin", gravity_for(cat, "SystemMonitor", "x") == "admin")
    check("composant hors catalogue → admin", gravity_for(cat, "Inconnu", "x") == "admin")
    check("réponse d'approbation → info", gravity_for(cat, "ApprovalCard", "approval.grant") == "info")

    print("\n\033[1m2. Admission — les contrôles P2\033[0m")
    rejects("prop inconnue refusée", lambda: validate_document(
        doc("ActionRequest", state="idle", props={"label": "x", "action": "y", "pirate": 1}), cat))
    rejects("prop obligatoire absente refusée", lambda: validate_document(
        doc("ActionRequest", state="idle", props={"label": "x"}), cat))
    rejects("prop de mauvais type refusée", lambda: validate_document(
        doc("ActionRequest", state="idle", props={"label": 42, "action": "y"}), cat))
    rejects("$bind sans résolveur refusé", lambda: validate_document(
        doc("ActionRequest", state="idle", props={"label": {"$bind": "system.cpu"}, "action": "y"}), cat))

    binder = BindingResolver()
    binder.register("system.cpu", "system.read", lambda: "12 %")
    binder.register("foyer.secret", "foyer.read", lambda: "MOT DE PASSE")

    rejects("$bind vers une source inconnue refusé", lambda: validate_document(
        doc("ActionRequest", state="idle", props={"label": {"$bind": "user.password"}, "action": "y"}),
        cat, bindings=binder, permissions={"system.read"}))

    rejects("$bind vers une source non permise refusé", lambda: validate_document(
        doc("ActionRequest", state="idle", props={"label": {"$bind": "foyer.secret"}, "action": "y"}),
        cat, bindings=binder, permissions={"system.read"}))

    served = validate_document(
        doc("ActionRequest", state="idle", props={"label": {"$bind": "system.cpu"}, "action": "y"}),
        cat, bindings=binder, permissions={"system.read"})
    check("$bind autorisé : c'est le CORE qui sert la valeur",
          served["surfaces"]["main"]["components"]["c1"]["props"]["label"] == "12 %")
    rejects("permission manquante refusée", lambda: validate_document(
        doc("SystemMonitor", state="idle"), cat, permissions=set()))
    rejects("contexte matériel absent refusé", lambda: validate_document(
        {"surfaces": {"m": {"root": ["c"], "components": {"c": {"name": "SystemMonitor", "state": "idle"}}}}},
        _catalog_needing("camera", cat), context=set()))

    many = {f"c{i}": {"name": "SystemMonitor", "state": "idle"} for i in range(13)}
    rejects("budget d'attention : 13 composants refusés", lambda: validate_document(
        {"surfaces": {"m": {"root": list(many), "components": many}}}, cat))

    two = {f"o{i}": {"name": "SystemMonitor", "state": "idle", "region": "overlay"} for i in range(2)}
    rejects("budget d'attention : 2 overlays refusés", lambda: validate_document(
        {"surfaces": {"m": {"root": list(two), "components": two}}}, cat))

    valid = doc("ActionRequest", state="idle", region="center",
                props={"label": "Redémarrer", "action": "service.restart"})
    try:
        validate_document(valid, cat, permissions=permissions_for("admin", cat), context=set())
        check("document légitime toujours admis", True)
    except SurfaceRejected as exc:
        check("document légitime toujours admis", False, str(exc))

    print("\n\033[1m3. Une action admin est BLOQUÉE\033[0m")
    bus.snapshot(valid)
    gravity = gravity_for(cat, "ActionRequest", "service.restart")
    decision = policy.evaluate(action="service.restart", risk=RiskLevel(risk_of(gravity)))
    check("la Policy exige une confirmation", decision.needs_confirmation, decision.reason or "")
    check("elle n'est pas autorisée d'emblée", not decision.allowed)

    approval_id, _ = bus.open_approval(
        intent="service.restart", gravity=gravity, reason=decision.reason or "", surface_id="main")
    check("la demande vit dans le document (survit au resync)",
          approval_id in bus.document["pending"]["approvals"])
    check("une ApprovalCard est ajoutée par le CORE",
          f"approval_{approval_id}" in bus.document["surfaces"]["main"]["components"])

    print("\n\033[1m4. L'approbation DÉBLOQUE — le maillon qui manquait\033[0m")
    executed: list[dict] = []
    intents = IntentExecutor()
    intents.register("service.restart", lambda payload: executed.append(payload) or "redémarré")

    closed = bus.close_approval(approval_id, granted=True)
    check("close_approval rend la demande au lieu de la jeter", closed is not None)
    assert closed is not None
    _, record = closed
    check("l'intention approuvée est récupérable", record.get("intent") == "service.restart",
          f"intent={record.get('intent')!r}")

    result = await intents.execute(str(record["intent"]), {"approval_id": approval_id})
    check("l'exécutant est APPELÉ", len(executed) == 1, f"résultat={result!r}")
    check("la carte a disparu de la surface",
          f"approval_{approval_id}" not in bus.document["surfaces"]["main"]["components"])

    print("\n\033[1m5. Le refus est TRACÉ, et n'exécute rien\033[0m")
    bus.snapshot(valid)
    approval_id2, _ = bus.open_approval(
        intent="service.restart", gravity="admin", reason="test", surface_id="main")
    closed2 = bus.close_approval(approval_id2, granted=False)
    assert closed2 is not None
    check("le refus retire aussi la demande", approval_id2 not in bus.document["pending"]["approvals"])
    check("aucune exécution supplémentaire", len(executed) == 1)

    print("\n\033[1m6. Sans exécutant : refus explicite, jamais succès silencieux\033[0m")
    try:
        await IntentExecutor().execute("service.restart", {})
    except IntentNotExecutable as exc:
        check("une action sans exécutant lève", True, str(exc)[:78])
    else:
        check("une action sans exécutant lève", False, "elle a été acquittée en silence")

    print()
    if _failures:
        print(f"\033[31m{len(_failures)} échec(s) : {', '.join(_failures)}\033[0m\n")
        return 1
    print("\033[32mP2 vérifié — bloqué, débloqué, tracé, exécuté.\033[0m\n")
    return 0


def _catalog_needing(context_name: str, base):
    """Copie du catalogue où SystemMonitor réclame un contexte matériel.

    Aucun composant n'en déclare aujourd'hui ; on en fabrique un pour prouver
    que le contrôle mord, plutôt que de le déclarer sans jamais l'exercer.
    """
    import copy

    clone = copy.deepcopy(base)
    clone._by_name["SystemMonitor"]["requiredContext"] = [context_name]
    return clone


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
