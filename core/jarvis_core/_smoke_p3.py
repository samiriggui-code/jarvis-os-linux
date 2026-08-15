"""Preuve P3 — Hermes compose, le Core admet.

Critère du contrat (§9) : « La question caméra produit une composition valide
**sans JSX généré** ; une proposition invalide est **rejetée et visible** ».

Les réponses sont **rejouées** : ce fichier teste le chemin, hors ligne et sans
dépendre d'un fournisseur. La composition sur un vrai modèle a été vérifiée
séparément le 2026-08-05 (`qwen/qwen3.5-flash-02-23` via OpenRouter) — détail
dans `docs/architecture/JARVIS-Agentic-UI.md` §9.

Ce que le rejeu permet et qu'un vrai modèle ne permet pas : provoquer à volonté
les réponses aberrantes — composant inventé, JSX, prop fabriquée, écran noyé —
qu'un bon modèle ne produira presque jamais, et qui sont précisément celles
contre lesquelles l'admission existe.

    ./.venv/Scripts/python.exe -m jarvis_core._smoke_p3
"""

from __future__ import annotations

import asyncio
import json
import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from .composer import (
    CompositionRejected,
    SurfaceComposer,
    build_prompt,
    check_confidence,
    parse_proposal,
)
from .surface import (
    BindingResolver,
    SurfaceCatalog,
    SurfaceRejected,
    permissions_for,
    validate_document,
)

OK, KO = "  \033[32mOK\033[0m  ", "  \033[31mÉCHEC\033[0m  "
_failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"{OK if condition else KO}{label}" + (f" — {detail}" if detail else ""))
    if not condition:
        _failures.append(label)


class FakeProvider:
    """Rejoue une réponse. Le Core n'a pas à savoir d'où elle vient."""

    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.prompt: str | None = None

    async def complete(self, prompt: str, **kwargs: object) -> str:
        self.prompt = prompt
        return self.reply


def surface_doc(components: dict) -> dict:
    return {"surfaces": {"main": {"root": list(components), "components": components}}}


def proposal(confidence: float, components: dict, **extra) -> str:
    return json.dumps(
        {
            "confidence": confidence,
            "reasoning": "test",
            "alternatives": [],
            "document": surface_doc(components),
            **extra,
        },
        ensure_ascii=False,
    )


async def refuses(label: str, composer: SurfaceComposer, cat, perms, binder) -> None:
    """Attend un refus, à la composition OU à l'admission — les deux comptent."""
    try:
        p = await composer.propose("peu importe", surface_id="fenetre", permissions=perms)
        validate_document(p["document"], cat, permissions=perms, context=set(), bindings=binder)
    except (CompositionRejected, SurfaceRejected) as exc:
        check(label, True, str(exc)[:76])
    else:
        check(label, False, "ACCEPTÉ alors qu'il devait être refusé")


async def main() -> int:
    cat = SurfaceCatalog()
    admin = permissions_for("admin", cat)
    binder = BindingResolver()
    binder.register("system.cpu", "system.read", lambda: 42.0, "number")
    binder.register("system.host", "system.read", lambda: "lenovo", "string")

    print("\n\033[1m1. Le prompt injecte le catalogue, filtré\033[0m")
    prompt_admin = build_prompt("montre la charge machine", cat, permissions=admin,
                                binding_sources=binder.describe())
    check("les composants permis sont listés", "SystemMonitor" in prompt_admin)
    check("les sources de liaison sont listées AVEC leur type",
          "system.cpu" in prompt_admin and '"type": "number"' in prompt_admin)
    check("le JSX est explicitement interdit", "JSX" in prompt_admin)
    check("l'invention de données est interdite", "$bind" in prompt_admin)

    prompt_child = build_prompt("montre la mémoire", cat, permissions=permissions_for("child", cat))
    check("un composant non permis n'est PAS proposé à l'enfant",
          "MemoryPanel" not in prompt_child and "SystemMonitor" in prompt_child)

    print("\n\033[1m2. Lecture d'une réponse de modèle\033[0m")
    good = proposal(0.9, {"c1": {"name": "SystemMonitor", "state": "idle", "region": "left"}})
    check("JSON nu", parse_proposal(good)["confidence"] == 0.9)
    check("JSON dans un bloc ```json",
          parse_proposal(f"Voici :\n```json\n{good}\n```\nVoilà.")["confidence"] == 0.9)
    check("JSON précédé de bavardage",
          parse_proposal(f"Bien sûr ! {good}")["confidence"] == 0.9)

    for label, raw in [
        ("réponse vide refusée", "   "),
        ("réponse sans JSON refusée", "Je ne peux pas faire ça."),
        ("proposition sans `document` refusée", '{"confidence": 0.9}'),
        ("proposition sans `confidence` refusée", '{"document": {"surfaces": {}}}'),
        ("`confidence` hors bornes refusée", '{"confidence": 4, "document": {"surfaces": {}}}'),
    ]:
        try:
            parse_proposal(raw)
            check(label, False, "ACCEPTÉE")
        except CompositionRejected as exc:
            check(label, True, str(exc)[:70])

    print("\n\033[1m3. Le plancher de confiance\033[0m")
    try:
        check_confidence({"confidence": 0.2, "reasoning": "je ne sais pas trop"})
        check("confiance basse refusée", False, "ACCEPTÉE")
    except CompositionRejected as exc:
        check("confiance basse refusée", True, str(exc)[:76])
    check_confidence({"confidence": 0.8})
    check("confiance haute acceptée", True)

    print("\n\033[1m4. Une proposition invalide est REJETÉE — et visible\033[0m")
    for label, reply in [
        ("composant inventé refusé",
         proposal(0.95, {"c1": {"name": "CameraFeed", "state": "idle"}})),
        ("JSX généré refusé",
         proposal(0.95, {"c1": {"name": "<div>coucou</div>", "state": "idle"}})),
        ("région hors vocabulaire refusée",
         proposal(0.95, {"c1": {"name": "SystemMonitor", "state": "idle", "region": "partout"}})),
        ("état inconnu refusé",
         proposal(0.95, {"c1": {"name": "SystemMonitor", "state": "explosé"}})),
        ("prop inventée refusée",
         proposal(0.95, {"c1": {"name": "SystemMonitor", "state": "idle", "props": {"x": 1}}})),
        ("liaison vers une source inconnue refusée",
         proposal(0.95, {"c1": {"name": "ActionRequest", "state": "idle",
                                "props": {"label": {"$bind": "foyer.code"}, "action": "a"}}})),
        ("écran noyé refusé (budget d'attention)",
         proposal(0.95, {f"c{i}": {"name": "SystemMonitor", "state": "idle"} for i in range(13)})),
    ]:
        await refuses(label, SurfaceComposer(cat, FakeProvider(reply)), cat, admin, binder)

    print("\n\033[1m5. Une proposition valide passe, et le CORE sert la donnée\033[0m")
    valid = proposal(0.92, {
        "c1": {"name": "SystemMonitor", "state": "idle", "region": "left", "size": "normal"},
        "c2": {"name": "ActionRequest", "state": "idle", "region": "center",
               "props": {"label": {"$bind": "system.host"}, "action": "system.refresh"}},
    })
    provider = FakeProvider(valid)
    composer = SurfaceComposer(cat, provider)
    # `surface_id` désigne la FENÊTRE d'accueil. Le gabarit du prompt fait
    # produire au modèle une surface nommée « main » ; le HUD, lui, cherche l'id
    # de l'app. Une composition atterrissait donc sous une clé que personne ne
    # regardait — admise, diffusée, invisible. La clé est maintenant imposée.
    p = await composer.propose("montre la charge machine", surface_id="terminal",
                               permissions=admin, binding_sources=binder.describe())
    check("proposition acceptée", p["confidence"] == 0.92)
    check("le prompt a bien été construit avec la question",
          "montre la charge machine" in (provider.prompt or ""))
    check("la surface atterrit dans la fenêtre demandée, pas dans « main »",
          list(p["document"]["surfaces"]) == ["terminal"],
          f"clés={list(p['document']['surfaces'])}")

    doc = validate_document(p["document"], cat, permissions=admin, context=set(), bindings=binder)
    served = doc["surfaces"]["terminal"]["components"]["c2"]["props"]["label"]
    check("la liaison est servie par le Core, pas par le modèle", served == "lenovo",
          f"label={served!r}")
    check("aucun JSX nulle part",
          all("<" not in c["name"] for c in doc["surfaces"]["terminal"]["components"].values()))

    print("\n\033[1m6. Sans LLM, le Core ne casse pas\033[0m")

    class DeadProvider:
        async def complete(self, prompt: str, **kwargs: object) -> str:
            raise ConnectionError("aucun fournisseur joignable")

    try:
        await SurfaceComposer(cat, DeadProvider()).propose(
            "x", surface_id="fenetre", permissions=admin
        )
        check("l'absence de LLM remonte comme une erreur", False, "silencieux")
    except ConnectionError as exc:
        check("l'absence de LLM remonte comme une erreur", True, str(exc))
    except CompositionRejected as exc:
        check("l'absence de LLM remonte comme une erreur", True, str(exc)[:60])

    print()
    if _failures:
        print(f"\033[31m{len(_failures)} échec(s) : {', '.join(_failures)}\033[0m\n")
        return 1
    print("\033[32mP3 vérifié — composé, refusé quand il faut, admis sans passe-droit.\033[0m")
    print("\033[33mRéponses rejouées ici. Composition sur vrai modèle vérifiée "
          "le 2026-08-05 (qwen3.5-flash via OpenRouter) — cf. contrat §9.\033[0m\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
