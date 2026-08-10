"""Smoke — la chaîne « tuile → Policy → exécutant » tient-elle debout ?

Ce que ce fichier vérifie n'est pas que le code s'exécute, mais que les **refus**
arrivent. Une capacité qui répond « oui » sans exécutant est le mode de panne du
dépôt ; les cas négatifs sont donc les plus importants ici.

    python -m jarvis_core._smoke_capabilities
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import replace

# Console Windows en cp1252 : sans ça, un tiret cadratin fait échouer le test au
# lieu de la chose testée. Même parade que `_smoke_p3.py`.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from .capabilities import (  # noqa: E402
    CAPABILITIES, Owner, allows, for_app, match_intent, toolsets_for,
)
from .hermes import HermesBridge, HermesRefused, HermesUnavailable  # noqa: E402
from .policy import Decision, PolicyEngine, RiskLevel  # noqa: E402

OK, KO = "  ok  ", "  KO  "
_failures = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global _failures
    if not condition:
        _failures += 1
    print(f"[{OK if condition else KO}] {label}{(' — ' + detail) if detail else ''}")


async def main() -> int:
    policy = PolicyEngine()
    bridge = HermesBridge(url="http://127.0.0.1:1", key="")

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

    docker = for_app("docker")
    assert docker is not None
    check("docker délègue au toolset terminal", docker.toolset == "terminal")
    check("docker est réalisable", docker.available)

    video = for_app("video")
    assert video is not None
    check("video appartient au Core", video.owner is Owner.CORE)
    check("video ne délègue à aucun toolset", video.toolset is None)
    check("video est réalisable", video.available)

    print("\n── Délégation par rôle ─────────────────────────────────────────")
    check("anonyme ne délègue rien", toolsets_for(None) == set())
    check("rôle inconnu ne délègue rien", toolsets_for("pirate") == set())
    check("enfant : pas le web", "web" not in toolsets_for("child"))
    check("utilisateur : le web oui", "web" in toolsets_for("user"))
    check("enfant : pas de shell", "terminal" not in toolsets_for("child"))
    check("admin : shell oui", "terminal" in toolsets_for("admin"))

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

    print("\n── Le pont refuse — et dit pourquoi ────────────────────────────")

    async def refuses(label: str, coro, expected: type[Exception]) -> None:
        try:
            await coro
        except expected as exc:
            check(label, True, str(exc)[:64])
        except Exception as exc:  # noqa: BLE001
            check(label, False, f"mauvaise exception : {type(exc).__name__} {exc}")
        else:
            check(label, False, "AUCUN refus — c'est le défaut qu'on traque")

    reach = for_app("reach")
    assert reach is not None

    await refuses(
        "décision négative → refus",
        bridge.ask(reach, "cherche", role="admin", decision=Decision(allowed=False, reason="non")),
        HermesRefused,
    )
    await refuses(
        "enfant → refus de délégation",
        bridge.ask(reach, "cherche", role="child", decision=Decision(allowed=True)),
        HermesRefused,
    )
    await refuses(
        "anonyme → refus de délégation",
        bridge.ask(reach, "cherche", role=None, decision=Decision(allowed=True)),
        HermesRefused,
    )
    docker_sans_toolset = replace(docker, toolset=None)
    await refuses(
        "capacité sans toolset → refus",
        bridge.ask(docker_sans_toolset, "ps", role="admin", decision=Decision(allowed=True)),
        HermesRefused,
    )
    await refuses(
        "capacité non-Hermes → refus",
        bridge.ask(video, "joue", role="admin", decision=Decision(allowed=True)),
        HermesRefused,
    )
    await refuses(
        "domotique → jamais déléguée à Hermes",
        bridge.ask(home, "allume", role="admin", decision=Decision(allowed=True)),
        HermesRefused,
    )
    await refuses(
        "sans clé API → indisponible, pas silencieux",
        bridge.ask(reach, "cherche", role="admin", decision=Decision(allowed=True)),
        HermesUnavailable,
    )

    print("\n── Routage d'une phrase ────────────────────────────────────────")
    # Le point de départ : cette phrase partait en `action="chat", risk=INFO`.
    c = match_intent("jarvis allume les lumières du salon")
    check("« allume les lumières » → maison", c is not None and c.intent == "home.control")
    check("… et au risque HOME, pas INFO", c is not None and c.risk is RiskLevel.HOME)

    c = match_intent("ouvre le terminal")
    check("« terminal » → shell au risque VPS", c is not None and c.risk is RiskLevel.VPS)

    # Le plus long gagne : sinon l'ordre de déclaration décide, donc le hasard.
    c = match_intent("ouvre mission control dev")
    check("« mission control dev » l'emporte sur « mission control »",
          c is not None and c.intent == "core.mission_dev")

    check("une question reste une conversation", match_intent("quelle heure est-il") is None)
    check("phrase vide → rien", match_intent("") is None)
    check("phrase inconnue → rien", match_intent("raconte-moi une blague") is None)

    print("\n── Cohérence propriétaire / toolset ────────────────────────────")

    # vps-terminal / pi-terminal : Terminal admin Dashboard, pas des tuiles
    # HUD — aucune phrase ne doit les router (`match_intent`), donc pas de
    # déclencheur à leur donner.
    NO_TRIGGER_OK = frozenset({"vps-terminal", "pi-terminal"})
    sans_declencheur = [
        c.app_id for c in CAPABILITIES.values()
        if not c.triggers and c.app_id not in NO_TRIGGER_OK
    ]
    check("toute capacité a des déclencheurs", not sans_declencheur, ", ".join(sans_declencheur))
    bad = [c.app_id for c in CAPABILITIES.values() if c.owner is not Owner.HERMES and c.toolset]
    check("aucun toolset sur une capacité non-Hermes", not bad, ", ".join(bad))

    # Clés dict != app_id quand plusieurs intentions partagent une tuile HUD.
    KEY_APP_MISMATCH_OK = frozenset({
        "capabilities", "introspect", "media-pause", "media-streaming",
        "software", "device-launch",
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
