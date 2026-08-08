# Core P3 — tuiles restantes (2026-08-08)

> P0–P2b ✅ · **P3 Core local ✅** · ops NUC + HA live = plus tard

Gate : `python -m jarvis_core._smoke_p3_tiles` (+ `_smoke_phase6`).

## Livré (Core)

| # | Tâche | Fichiers | Done |
|---|--------|----------|------|
| 1 | `core.missions` | `missions/store.py`, `_execute_missions` | ✅ magasin JSON + voix |
| 2 | `vps.code` | `_execute_vps_code`, owner CORE | ✅ liste `JARVIS_PROJECTS_ROOT` |
| 3 | Spotify gate | `capabilities.py`, `.env.example` | ✅ `JARVIS_SPOTIFY_ENABLED=1` |
| 4 | HA adaptateur | `homeassistant.py` (existant) | ✅ smoke parsing offline |

## Ops (plus tard — rappel tests)

| Action | Commande / config |
|--------|-------------------|
| Sync Core NUC | `deploy/scripts/sync-to-nuc.sh` + `systemctl restart jarvis-core` |
| Profils voicebox | `deploy/scripts/setup-voicebox-profiles.sh` |
| Spotify Hermes | `deploy/scripts/verify-hermes-spotify.sh` + credentials Spotify dans Hermes |
| Core env Spotify | `JARVIS_SPOTIFY_ENABLED=1` dans `/etc/jarvis/core.env` |
| Home Assistant | `JARVIS_HASS_URL` + `JARVIS_HASS_TOKEN` dans `/etc/jarvis/core.env` |
| Tests live | `core/tools/nuc_p1_live.py` · WS `wss://jarvis.global-it-ss.com/ws` |
| Tests voix réels | enroll webcam · 2 visages (reporté — personne absente) |

## Commandes vocales (missions)

- « mes objectifs » / « objectifs » → liste
- « ajoute objectif … » → création
- « termine objectif … » → clôture

## Hors P3 (P4+)

- Device Manager complet (`Owner.DEVICE` généralisé)
- HA Zigbee scènes avancées
- HUD React ToolTimeline / compose
