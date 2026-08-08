# Core Phase 1 — découpage Orchestrator

**Statut :** terminée (2026-08-08)  
**Prérequis :** [CORE_PHASE0.md](./CORE_PHASE0.md) — smokes ALL PASS

## Objectif

Remplacer le monolithe `jarvis_core/__init__.py` (~4244 lignes) par un entry point mince + mixins testables.

## Structure

```
core/jarvis_core/
├── __init__.py              # entry point (~130 lignes) : handler, main, run, re-exports
├── orchestrator.py          # class Orchestrator (héritage mixins)
├── orchestrator_lifecycle.py
├── intents/
│   ├── executors.py         # _execute_*, _open_intent, surfaces résultat
│   └── registry.py          # register_capabilities, register_bindings
└── ws/
    ├── routes.py            # HOST, PORT, ROUTES, constantes boot/session
    └── handlers/
        ├── auth.py
        ├── chat.py
        ├── holomat.py
        ├── surface.py
        ├── system.py
        └── voice.py
```

## Re-exports publics (`from jarvis_core import …`)

| Symbole | Source |
|---------|--------|
| `Orchestrator` | `orchestrator.py` |
| `HOST`, `PORT`, `ROUTES`, `Route` | `ws/routes.py` |
| `SalonNullWs`, `_SalonNullWs` | `ws/routes.py` |
| `handler`, `main`, `run` | `__init__.py` |

## Validation

```bash
cd core
python -c "from jarvis_core import Orchestrator; Orchestrator()"
python -m jarvis_core._smoke_phase0
```

Gate : **ALL PASS** (offline, Windows).

## Scripts utilitaires

| Script | Rôle |
|--------|------|
| `core/scripts/extract_phase1.py` | Extraction AST initiale (one-shot) |
| `core/scripts/fix_phase1_imports.py` | En-têtes + imports relatifs après extraction |

## Hors scope Phase 1

- Capability Router (DECISIONS.md — après multi-profil face produit)
- HUD / vendor
- Nouvelles fonctionnalités Core

## Prochaine étape (Phase 2)

Voir [CORE_PHASE2.md](./CORE_PHASE2.md) — **terminée** (2026-08-08). Suite : Phase 3.
