"""Smoke — la chaîne « tuile → Policy → exécutant » tient-elle debout ?

Ce que ce fichier vérifie n'est pas que le code s'exécute, mais que les **refus**
arrivent. Une capacité qui répond « oui » sans exécutant est le mode de panne du
dépôt ; les cas négatifs sont donc les plus importants ici.

    python -m jarvis_core._smoke_capabilities
"""

from __future__ import annotations

import asyncio
import sys

# Console Windows en cp1252 : sans ça, un tiret cadratin fait échouer le test au
# lieu de la chose testée. Même parade que `_smoke_p3.py`.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from .capabilities import (  # noqa: E402
    CAPABILITIES, Owner, allows, for_app, match_intent, toolsets_for,
)
from .policy import PolicyEngine, RiskLevel  # noqa: E402

OK, KO = "  ok  ", "  KO  "
_failures = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global _failures
    if not condition:
        _failures += 1
    print(f"[{OK if condition else KO}] {label}{(' — ' + detail) if detail else ''}")


async def main() -> int:
    policy = PolicyEngine()

    print("\n── Table des capacités ─────────────────────────────────────────")
    n = len(CAPABILITIES)
    check(f"capacités déclarées (>= 28)", n >= 28, str(n))

    home = for_app("home")
    assert home is not None
    # La domotique appartient au CORE, pas à Hermes : le contrat écrit
    # « Core → Home Assistant Adapter → HA API », et le §11 du cahier des charges
    # exige qu'elle tienne SANS LLM. La faire passer par un agent coûtait 475 s.
    check("home appartient au Core", home.owner is Owner.CORE)
    check("home ne délègue à aucun toolset", home.toolset is None)
    check("home → risque HOME", home.risk is RiskLevel.HOME)
    check("home est réalisable", home.available)

    check("capacités agent supprimées", all(
        name not in CAPABILITIES
        for name in ("reach", "browser", "files", "terminal", "analyze", "skills", "outils", "crons", "docker", "storage")
    ))

    video = for_app("video")
    assert video is not None
    check("video appartient au Core", video.owner is Owner.CORE)
    check("video ne délègue à aucun toolset", video.toolset is None)
    check("video est réalisable", video.available)

    print("\n── Aucun toolset agent ─────────────────────────────────────────")
    for role in (None, "pirate", "child", "user", "admin"):
        check(f"{role or 'anonyme'} ne délègue rien", toolsets_for(role) == set())

    print("\n── Rôle vs Dashboard ───────────────────────────────────────────")
    hub = for_app("hub")
    assert hub is not None
    check("hub refusé à user", not allows(hub, "user"))
    check("hub refusé à l'anonyme", not allows(hub, None))
    check("hub accordé à admin", allows(hub, "admin"))

    print("\n── Policy avant tout appel ─────────────────────────────────────")
    d_home = policy.evaluate(action=home.intent, risk=home.risk)
    check("domotique exige confirmation", d_home.needs_confirmation)

    d_shell = policy.evaluate(action="system.shell", risk=RiskLevel.VPS)
    check("shell : confirmation ADMIN", d_shell.needs_confirmation)

    print("\n── Routage d'une phrase ────────────────────────────────────────")
    # Le point de départ : cette phrase partait en `action="chat", risk=INFO`.
    c = match_intent("jarvis allume les lumières du salon")
    check("« allume les lumières » → maison", c is not None and c.intent == "home.control")
    check("… et au risque HOME, pas INFO", c is not None and c.risk is RiskLevel.HOME)

    c = match_intent("ouvre le terminal")
    check("« terminal » sans capacité agent", c is None)

    # Le plus long gagne : sinon l'ordre de déclaration décide, donc le hasard.
    c = match_intent("ouvre mission control dev")
    check("« mission control dev » l'emporte sur « mission control »",
          c is not None and c.intent == "core.mission_dev")

    c = match_intent("ferme les paramètres")
    check("« ferme les paramètres » → fermeture HUD", c is not None and c.intent == "hud.close_app")
    c = match_intent("ouvre les paramètres")
    check("« ouvre les paramètres » → ouverture prefs", c is not None and c.intent == "core.preferences")

    c = match_intent("regarde youtube")
    check("« regarde youtube » → streaming", c is not None and c.intent == "media.streaming")
    c = match_intent("lance netflix")
    check("« lance netflix » → streaming", c is not None and c.intent == "media.streaming")
    c = match_intent("regarde sur amazon prime")
    check("« regarde sur amazon prime » → streaming", c is not None and c.intent == "media.streaming")

    c = match_intent("qu est ce que je te montre")
    check("« qu'est-ce que je te montre » → vision", c is not None and c.intent == "vision.analyze")

    c = match_intent("que vois-tu")
    check("« que vois-tu » → scène Worker", c is not None and c.intent == "vision.scene")

    check("une question reste une conversation", match_intent("quelle heure est-il") is None)
    check("phrase vide → rien", match_intent("") is None)
    check("phrase inconnue → rien", match_intent("raconte-moi une blague") is None)

    c = match_intent("comment tu fonctionnes")
    check("« comment tu fonctionnes » → architecture.explain", c is not None and c.intent == "architecture.explain")
    c = match_intent("où tourne hermes")
    check("« où tourne hermes » → architecture.explain", c is not None and c.intent == "architecture.explain")
    c = match_intent("tes skills hermes")
    check("« tes skills hermes » reste introspect", c is not None and c.intent == "system.introspect")
    c = match_intent("carte hermes")
    check("« carte hermes » reste neural_map", c is not None and c.intent == "core.neural_map")

    print("\n── Cohérence propriétaire / toolset ────────────────────────────")

    # vps-terminal / pi-terminal : Terminal admin Dashboard, pas des tuiles
    # HUD — aucune phrase ne doit les router (`match_intent`), donc pas de
    # déclencheur à leur donner.
    NO_TRIGGER_OK = frozenset({
        "vps-terminal", "pi-terminal",
        "memory-search", "memory-recall", "memory-store-note",
    })
    sans_declencheur = [
        c.app_id for c in CAPABILITIES.values()
        if not c.triggers and c.app_id not in NO_TRIGGER_OK
    ]
    check("toute capacité a des déclencheurs", not sans_declencheur, ", ".join(sans_declencheur))
    bad = [c.app_id for c in CAPABILITIES.values() if c.toolset]
    check("aucun toolset dans Core", not bad, ", ".join(bad))

    # Clés dict != app_id quand plusieurs intentions partagent une tuile HUD.
    KEY_APP_MISMATCH_OK = frozenset({
        "capabilities", "introspect", "media-pause", "media-streaming",
        "software", "device-launch", "hud-close-app", "hud-toggle-app", "vision-analyze",
        "pc-health",
        "dev-board-create", "dev-board-assign", "dev-board-start-run",
    })
    dupes = [
        k for k, c in CAPABILITIES.items()
        if c.app_id != k and k not in KEY_APP_MISMATCH_OK
    ]
    check("clé == app_id (sauf tuiles partagées)", not dupes, ", ".join(dupes))

    intents = [c.intent for c in CAPABILITIES.values()]
    check("intentions uniques", len(intents) == len(set(intents)))

    print()
    if _failures:
        print(f"ÉCHEC — {_failures} vérification(s) en défaut.")
        return 1
    print("Tout passe.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
