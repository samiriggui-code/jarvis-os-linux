# Core Phase 5 — Capability Router

**Statut :** terminée (2026-08-08)  
**Prérequis :** [CORE_PHASE4.md](./CORE_PHASE4.md)

## Objectif

1. **`CapabilityRouter`** — scoring HostCapability + règle origine ✅
2. **`device_mode`** dans le routage (personal / shared / gateway) ✅
3. **Intent routing** — `executors_routing.py` ; tool_event `device_id` réel ✅
4. **TTS output** — `_bind_output_route(ws)` sur chat + exécution intent ✅

## Fichiers

```
core/jarvis_core/
├── capability_router.py
├── intents/executors_routing.py
└── _smoke_capability_router.py
```

## Règles (v1)

| Mode | Output (TTS) | Host (ex. camera) |
|------|----------------|-------------------|
| `personal` | Browser local sauf satellite avec `speaker.output` | Origine +100 si cap présente |
| `shared` | Idem — kiosk browser vs Pi ear | Origine prioritaire |
| `gateway` | Speaker si cap audio, sinon None | Score gateway bas |

Refus explicite si `personal` et `session_user_id ≠ bound_user_id`.

Intent → HostCapability :

| Intent | capability_id |
|--------|----------------|
| `core.holomat` | `camera.capture` |
| `home.control` | `home_assistant.gateway` |

## Validation

```bash
cd core
python -m jarvis_core._smoke_phase5
```

## Reporté

- Tests enroll webcam réels (foyer vide)
- Router multi-candidats avancé (RTT, co-présence)
- HUD consommateur `host_device_id` / `route` dans surface_result

## Prochaine étape

- HUD : lire `auth_status.device_hint` + `surface_result.route`
- Enroll réels au retour famille
