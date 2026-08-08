# Core P2 — prod UX + contrat HUD (2026-08-08)

> P0 ✅ · P1 ✅ · **P2a ✅ · P2b ✅ (Core local)** · ops NUC = sync + voicebox

Gates : `_smoke_p2a`, `_smoke_p2b`, `_smoke_hermes_events` (+ `_smoke_phase6`).

## P2a — Prod NUC (urgence ressenti utilisateur)

| # | Tâche | Fichiers | Critère done |
|---|--------|----------|--------------|
| 1 | Timeout Hermes SSE | `hermes/bridge.py`, env `JARVIS_HERMES_TIMEOUT` | ✅ défaut **120 s** ; gate `_smoke_p2a` |
| 2 | Message vocal timeout | `executors_routing.py` `_fallback_web_surface` | ✅ phrase distincte timeout vs panne |
| 3 | Profil TTS local | `deploy/scripts/setup-voicebox-profiles.sh` | script idempotent ; à lancer sur NUC/VPS |
| 4 | Sync NUC | `deploy/scripts/sync-to-nuc.sh` | P0+P1+P2a sur NUC + restart `jarvis-core` |

## P2b — Contrat HUD (Core seulement)

| # | Tâche | Fichiers | Statut |
|---|--------|----------|--------|
| 5 | Timeline tool_event | `docs/hud/TOOL_TIMELINE.md` | ✅ doc + gate `_smoke_p2_hud` |
| 6 | Split surface admission | `surfaces/admission.py` + `surface.py` shim | ✅ |
| 7 | Hermes events module | `hermes/events.py` | ✅ re-export `tool_events` |
| 8 | Surface Decision | `surface_decision.py` mappings skills/cron/outils | ✅ gate `_smoke_p2b` |

## Hors P2 (P3+)

- HUD React : `ToolTimeline`, `ApprovalCard` E2E, `compose` WS
- `core.missions`, `vps.code`, Spotify on
- Session HA / Zigbee
- Auth `psycopg` local dev

## Réf. latence

`docs/claude/JARVIS_SESSION_STATE.md` § Exploitation latence Hermes
