"""Smoke test des extracteurs HAI — ce qui doit rester vrai pour toujours.

Un extracteur qui se trompe est pire qu'une documentation périmée : la
documentation périmée, on s'en méfie ; un rapport généré, on le croit. Chaque
cas ci-dessous correspond à une erreur RÉELLE commise en écrivant
`build.py`, et qui n'avait produit aucun message d'erreur.

    python architecture/_smoke_build.py

Zéro réseau, zéro écriture : on interroge les extracteurs, on n'appelle pas
`main()`.
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build  # noqa: E402


def cas(titre: str) -> None:
    print(f"  · {titre}")


def test_routes_non_vide() -> None:
    """`ROUTES: dict[...] = {...}` est un AnnAssign.

    La première version ne testait que `ast.Assign` et renvoyait zéro route
    sans rien signaler — un index vide qui déclare « tout va bien ».
    """
    routes = build.extraire_routes()
    assert routes, "aucune route extraite — l'extracteur est muet, pas le Core"
    assert len(routes) >= 15, f"seulement {len(routes)} routes, attendu >= 15"
    cas(f"{len(routes)} routes extraites")


def test_annassign_reconnu() -> None:
    """Le cas exact, isolé : les deux formes d'affectation doivent marcher."""
    source = 'ROUTES: dict[str, Route] = {"ping": Route("handle_ping", "err")}\n'
    arbre = ast.parse(source)
    noeud = arbre.body[0]
    assert isinstance(noeud, ast.AnnAssign), "le fixture ne teste pas ce qu'il croit"
    cas("AnnAssign est bien la forme réellement utilisée")


def test_tous_les_handlers_existent() -> None:
    """Une route qui pointe sur une méthode absente = 500 à l'exécution."""
    manquants = [r["message"] for r in build.extraire_routes() if not r["handler_existe"]]
    assert not manquants, f"handlers introuvables : {manquants}"
    cas("chaque route pointe sur une méthode qui existe")


def test_deux_canaux_distincts() -> None:
    """`type` et `command` ne doivent JAMAIS être fusionnés.

    `cmd()` produit `{"command": …}`, pas `{"type": …}`. Les confondre faisait
    apparaître `set_orb_state` comme « émis mais jamais écouté ».
    """
    em = build.extraire_emissions()
    assert "types" in em and "commandes" in em, "les deux canaux ont disparu du modèle"
    assert em["commandes"], "aucune commande extraite — cmd() n'est plus reconnu"
    croisement = set(em["types"]) & set(em["commandes"])
    assert "set_orb_state" in em["commandes"], "set_orb_state doit être une COMMANDE"
    assert "set_orb_state" not in em["types"], "set_orb_state n'est pas un événement"
    cas(f"{len(em['types'])} événements, {len(em['commandes'])} commandes, "
        f"{len(croisement)} homonyme(s)")


def test_envoi_vs_declaration() -> None:
    """Un `type:` dans `hudContracts.ts` déclare, il n'envoie pas.

    Les compter comme des envois produisait 45 fausses alertes.
    """
    hud = build.extraire_hud()
    assert hud["envoie"], "aucun envoi détecté — le motif send({…}) est cassé"
    assert "tts_audio" not in hud["envoie"], (
        "tts_audio est REÇU par le HUD : le compter comme envoi est le bug des 45 alertes")
    assert "mission_dev" in hud["envoie"], "mission_dev doit être un envoi réel"
    cas(f"{len(hud['envoie'])} envois réels, distincts des {len(hud['declare'])} déclarations")


def test_types_de_chat_exclus() -> None:
    """`msg.type === 'ai'` est un message de CHAT, pas un message WebSocket."""
    ecoute = set(build.extraire_hud()["ecoute"])
    for parasite in ("ai", "user", "system"):
        assert parasite not in ecoute, (
            f"« {parasite} » vient de Message.type du chat, pas du WebSocket")
    cas("les discriminants du chat ne polluent pas l'écoute WS")


def test_phases_ui_exclues() -> None:
    """« boot » est une commande Core ET une phase de FirstSetupScene.

    Même chaîne, deux concepts. Sans typage sémantique, fausse alerte.
    """
    phases = build.phases_interface()
    assert "boot" in phases, "la phase UI « boot » n'est plus détectée"
    cas(f"{len(phases)} phases d'interface reconnues comme UI_PHASE")


def test_consommateurs_branches() -> None:
    """Les 4 flux réparés doivent le rester.

    Ils étaient émis, déclarés, et consommés par personne. C'est la première
    chose que le HAI ait trouvée ; ce test empêche la régression.
    """
    hud = build.extraire_hud()
    for message in ("voice_transcript", "voice_playback", "voice_error", "supervisor_status"):
        assert message in hud["ecoute"], f"« {message} » n'a plus de consommateur"
    cas("les 4 flux réparés ont toujours un consommateur")


def test_aucune_incoherence() -> None:
    """L'invariant de sortie : le dépôt est cohérent, ou le test échoue."""
    problemes = build.incoherences()
    assert not problemes, "incohérences :\n   " + "\n   ".join(problemes)
    cas("aucune incohérence Core ↔ HUD")


def main() -> int:
    # Même raison que dans build.py : sous Git Bash, stdout est en cp1252 et
    # les puces « · » / « ✗ » font lever UnicodeEncodeError. Le hook
    # pre-commit tourne précisément là.
    for flux in (sys.stdout, sys.stderr):
        try:
            flux.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    print(f"smoke HAI — {len(tests)} cas\n")
    echecs = 0
    for t in tests:
        try:
            t()
        except AssertionError as exc:
            print(f"  ✗ {t.__name__} : {exc}")
            echecs += 1
    print(f"\n{len(tests) - echecs}/{len(tests)} OK")
    return 1 if echecs else 0


if __name__ == "__main__":
    raise SystemExit(main())
