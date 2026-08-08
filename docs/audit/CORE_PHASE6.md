# Phase 6 — gate circuit produit Core

```powershell
cd core
python -m jarvis_core._smoke_phase6
```

## Livrables

| Domaine | Fichiers |
|---------|----------|
| Provider + host gate | `routing/provider.py`, `routing/host_gate.py`, `routing/router.py` |
| Hermes unifié | `hermes/delegate.py`, `hermes/bridge.py` |
| Executors segmentés | `executors/home.py`, `media.py`, `surfaces.py` |
| Surface publisher | `surfaces/publisher.py` |
| Catalogue alias | `intents/catalog.py` |
| E2E smoke | `_smoke_intent_circuit.py`, `_smoke_phase6.py` |

## Circuit unique

```
match_intent → Policy → resolve_execution_host → IntentExecutor
  ├── CORE   → executors/*
  └── HERMES → HermesIntentDelegate → HermesBridge
→ tool_event → surface / TTS
```

## P0 host gate

`CapabilityProvider.CORE` → `core_in_process` sur NUC, sans satellite.

## P1 Hermes

Chat et tuile passent par `_open_intent` → `_execute_intent` → delegate.

## P2 HUD (Core contract — 2026-08-08)

- Payload WS unifié `tool_event` (`timeline_payload` / `timeline_payload_agent`)
- Bootstrap `tool_timeline_snapshot` à la connexion WS
- WS `type: tool_timeline` · HTTP `GET /v1/tool-events`
- `surface_decision` étendu (web, terminal, holomat → ResultPanel / monitor)
- Doc HUD : `docs/hud/TOOL_TIMELINE.md`
- Gate : `python -m jarvis_core._smoke_p2_hud`

**Reste côté React (`hud/`)** : composant `ToolTimeline` consommant `tool_event`.
