# Core Phase 3 — sessions WS + device_mode

**Statut :** terminée (2026-08-08)  
**Prérequis :** [CORE_PHASE2.md](./CORE_PHASE2.md) — gate Phase 2 ALL PASS

## Objectif

1. **Session par connexion WS** — `ConnectionRegistry` + `ConnectionSessionStore` ✅
2. **`device_mode`** — `personal|shared|gateway` + `bound_user_id` sur DeviceRegistry ✅
3. **Découpe executors** — `intents/executors_hud.py` (HUD + enrollment) ✅
4. Rename `holomat/` — **reporté** (noms cibles non arbitrés)

## Structure ajoutée Phase 3

```
core/jarvis_core/
├── auth/session_store.py       # session par connection_id
├── ws/connection.py            # uuid par WebSocket
├── intents/executors_hud.py    # _execute_hud, _start_kiosk_enrollment
├── _smoke_phase3.py            # gate Phase 3
└── devices.py                  # device_mode, bound_user_id
```

## Comportement session

| Connexion | Session |
|-----------|---------|
| WS bind → `connection_id` | login/logout/status scoped |
| disconnect | `auth.on_disconnect` ferme la session de cette connexion |
| smokes offline | fallback global (`connection_id=None`) |

## Device mode

| Mode | Usage |
|------|-------|
| `personal` | appareil lié à `bound_user_id` |
| `shared` | kiosk / salon (défaut) |
| `gateway` | NUC / point d'entrée |

Enregistrement via `device.register` :

```json
{
  "type": "device",
  "action": "register",
  "device_id": "phone-samir",
  "device_mode": "personal",
  "bound_user_id": "<user_id>"
}
```

## Validation

```bash
cd core
python -m jarvis_core._smoke_phase3

./deploy/scripts/core-phase3-smoke.sh
.\deploy\scripts\core-phase3-smoke.ps1
```

Gate : Phase 3 smokes + régression Phase 2.

## Prochaine étape (Phase 4)

- Rename package `holomat/` si noms cibles arbitrés
- Découpe restante `orchestrator_lifecycle.py` si nécessaire
- Tests enroll webcam (foyer) — hors gate offline

## Hors scope Phase 3

- HUD produit · voix speaker-ID · routing intent par device_mode (lecture seule pour l'instant)
