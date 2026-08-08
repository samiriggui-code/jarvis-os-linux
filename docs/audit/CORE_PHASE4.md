# Core Phase 4 — vision rename + lifecycle split

**Statut :** terminée (2026-08-08)  
**Prérequis :** [CORE_PHASE3.md](./CORE_PHASE3.md) — gate Phase 3 ALL PASS

## Objectif

1. **Rename Python** `holomat/` → `vision/` ✅ (protocole WS `type: holomat` **inchangé**)
2. **Shim compat** `jarvis_core.holomat` → re-export `vision` + `DeprecationWarning` ✅
3. **Découpe lifecycle** — `orchestrator_speech.py`, `orchestrator_boot.py`, `orchestrator_session.py` ✅
4. **Device hint** — liaison WS ↔ `device_id` ; `auth_status.device_hint` pour mode `personal` ✅

## Structure Phase 4

```
core/jarvis_core/
├── vision/                    # ex-holomat (FaceEngine, runner, mesh)
├── holomat/__init__.py          # shim deprecated
├── orchestrator_speech.py
├── orchestrator_boot.py
├── orchestrator_session.py
└── _smoke_phase4.py
```

## Protocole vs code

| Couche | Nom |
|--------|-----|
| WS events | `type: holomat` (figé — FACE_AUTH_CONTRACT.md) |
| Supervisor boot | composant `holomat` (alias produit) |
| Package Python | `jarvis_core.vision` |
| Intent capability | `core.holomat` (inchangé) |

## Device hint (personal)

Quand le HUD envoie `device.register` sur la même connexion WS :

```json
{
  "type": "auth_status",
  "device_hint": {
    "device_id": "tablet-zahra",
    "device_mode": "personal",
    "bound_user_id": "<uuid>"
  }
}
```

Pas de login automatique — indice pour le HUD (session persistante future).

## Validation

```bash
cd core
python -m jarvis_core._smoke_phase4

./deploy/scripts/core-phase4-smoke.sh
.\deploy\scripts\core-phase4-smoke.ps1
```

Gate : Phase 4 smokes + régression Phase 3.

## Prochaine étape

- Routing intent par `device_mode` (Capability Router)
- Tests enroll webcam réels (foyer)
- Découpe restante `intents/executors.py` si nécessaire

## Hors scope Phase 4

- Rename protocole WS · HUD produit · service systemd `jarvis-holomat`
