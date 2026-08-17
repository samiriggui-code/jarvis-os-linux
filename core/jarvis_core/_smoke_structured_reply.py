"""Réponse structurée {speech, component, props} — parsing + validité catalogue.

    python -m jarvis_core._smoke_structured_reply
"""
from __future__ import annotations

import asyncio
import json
import sys
from unittest.mock import AsyncMock, patch

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    from jarvis_core.providers import (
        STRUCTURED_COMPONENTS,
        AIProviderManager,
        ProviderMode,
        _parse_structured_reply,
    )
    from jarvis_core.surfaces.admission import SurfaceCatalog

    print("Réponse structurée — parsing et conformité catalogue")

    # ── 1. JSON propre par composant ────────────────────────────────────
    for name in STRUCTURED_COMPONENTS:
        payload = {"speech": "ok", "component": name, "props": {"x": 1}}
        r = _parse_structured_reply(json.dumps(payload))
        check(f"parse propre · {name}", r["component"] == name and r["speech"] == "ok")

    # ── 2. Clôture markdown ``` json ... ``` ────────────────────────────
    fenced = "```json\n" + json.dumps({"speech": "s", "component": "ResultPanel", "props": {}}) + "\n```"
    r = _parse_structured_reply(fenced)
    check("clôture markdown retirée", r["component"] == "ResultPanel" and r["speech"] == "s")

    # ── 3. Composant halluciné -> repli ResultPanel, speech préservé ────
    r = _parse_structured_reply(json.dumps({"speech": "vrai texte", "component": "FakeWidget", "props": {}}))
    check("composant inconnu -> repli ResultPanel", r["component"] == "ResultPanel")
    check("repli garde le speech d'origine (pas le JSON brut)", r["speech"] == "vrai texte")
    check(
        "repli ResultPanel a tous les champs obligatoires",
        set(r["props"]) >= {"title", "body", "source", "items"},
    )

    # ── 4. Pas du JSON du tout -> texte brut = speech + body ────────────
    r = _parse_structured_reply("Bonjour, il est 14h.")
    check("texte brut -> ResultPanel", r["component"] == "ResultPanel")
    check("texte brut préservé dans speech", r["speech"] == "Bonjour, il est 14h.")

    # ── 5. JSON vide/absent -> jamais de crash ──────────────────────────
    r = _parse_structured_reply("")
    check("chaîne vide -> pas de crash", r["component"] == "ResultPanel" and r["speech"])

    # ── 6. Chaque props obligatoire déclarée matche le vrai catalogue UI ─
    catalog = SurfaceCatalog()
    check("catalogue UI chargé (non vide)", len(catalog.names) > 0)
    for name, meta in STRUCTURED_COMPONENTS.items():
        entry = catalog.get(name)
        check(f"« {name} » présent dans ui_catalog.json", entry is not None)
        if entry is None:
            continue
        real_required = set(entry.get("props", {}).get("required") or [])
        declared = set(meta["required_props"])
        check(
            f"« {name} » — props déclarées == required réel du catalogue",
            declared == real_required,
        )

    # ── 7. complete_structured() bout-en-bout, réseau mocké ─────────────
    import os

    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "x"}, clear=False):
        pm = AIProviderManager()
        pm._mode = ProviderMode.CLOUD
        fake_json = json.dumps(
            {
                "speech": "Voici le tableau.",
                "component": "DataTable",
                "props": {"title": "T", "columns": ["A"], "rows": [["1"]]},
            }
        )
        with patch.object(pm, "_openrouter_complete", AsyncMock(return_value=fake_json)):
            out = asyncio.run(pm.complete_structured("compare ces deux trucs"))
            check("complete_structured bout-en-bout · component", out["component"] == "DataTable")
            check("complete_structured bout-en-bout · speech", out["speech"] == "Voici le tableau.")
            check(
                "complete_structured bout-en-bout · props transmises",
                out["props"] == {"title": "T", "columns": ["A"], "rows": [["1"]]},
            )

    print("\nStructured reply smokes : ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
