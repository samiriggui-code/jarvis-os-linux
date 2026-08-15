# TODO — JARVIS OS

> Priorités courantes. État détaillé → [`claude/JARVIS_SESSION_STATE.md`](claude/JARVIS_SESSION_STATE.md) § **HANDOFF 2026-08-11**.

**Focus reprise maison (2026-08-11 soir)** : valider **veille HUD** + voix **jarvis3/hologramme** en local — **pas** de sync NUC sans go.

---

## Priorité immédiate (HUD / voix — local)

- [ ] **Valider veille** — `cd hud && npm run dev` : orbe + TopBar réel + ChatPeek + Ctrl+Shift A/S/G/D
- [ ] **Valider voix** — lab `jarvis3` + filtre hologramme ; auth/enrôlement à l’oreille
- [ ] Sync NUC fronts + cache `jarvis3` — **sur demande Samir seulement**
- [ ] Phase 2 : Dashboard pages → surfaces agentic (`SURFACE_*`) — pas bloquant veille
- [ ] Layout Engine V1 dans `AgenticDemoStage` (snapshots) — après validation veille

## Priorité Core / ops (inchangé)

- [x] **Architecture Awareness D1** — `architecture.snapshot()` + `_smoke_architecture_snapshot` (2026-08-13)
- [x] **Architecture Awareness D3** — `architecture.audit()` + `_smoke_architecture_audit` (2026-08-13)
- [x] **Architecture Awareness D2.0** — `architecture.explain()` déterministe + `_smoke_architecture_explain` (2026-08-13)
- [x] **Architecture Awareness D2.1** — `build_llm_bound_payload(snapshot, audit)` + `_smoke_architecture_llm_payload` (2026-08-13)
- [x] **Architecture Awareness D2.2** — `explain_live()` via Provider Manager + `_smoke_architecture_llm_live` (2026-08-13)
- [x] **Architecture Awareness intent Core** — `architecture.explain` via chat (`match_intent` + `chat_reply`, pas TTS/HUD) (2026-08-13)
- [ ] **Architecture Awareness** propose / HUD / D3.1 ON_DEMAND / vocal TTS (après feu vert séparé)
- [x] **Phase 0 Core** — `_smoke_phase0` + `tools/ws_cli.py` + `_smoke_auth_multi` (2026-08-08)
- [x] **Phase 2 Core** — gate `_smoke_phase2`, multi-profil offline, `enroll_member`, mixins nettoyés (2026-08-08)
- [x] **Phase 3 Core** — sessions WS par `connection_id`, `device_mode`, `executors_hud.py`, gate `_smoke_phase3` (2026-08-08)
- [x] **AUTH_SMOKE_TEST** verrouillé (gate P1/P2) — `deploy/scripts/auth-smoke-test.*` + `_smoke_auth_face` + workflow CI optionnel
- [x] **Sync Core NUC** avec fix AuthScene / logs face (2026-08-07 14:44) — HUD `index-DhFtL8FY.js` + Core ; smoke NUC PASS
- [x] **Intégration face Core** — enroll → verify → login ; smokes + `face_vault.html` PASS (2026-08-08)
- [ ] **Tests enroll réels** (webcam, 2 visages, parcours famille) — **REPORTÉ** : personne à la maison. Logique multi-profil déjà couverte offline (`_smoke_face_multi`).
- [ ] **`psycopg` local** — auth SQL complète (enroll/login réels, pas unlock dev seul)
- [x] **Phase 4 Core** — `holomat/` → `vision/`, lifecycle split, `device_hint`, gate `_smoke_phase4` (2026-08-08)
- [x] **Core Phase 6 + P0 executors** — tuiles système, `_smoke_p0_executors` (2026-08-08)
- [x] **Core P1 intégrations** — kanban mission dev, chat Hermes option, surface_decision ; `_smoke_p1` (2026-08-08)
- [x] **Core P2a — prod UX (Core local)** — timeout Hermes 120 s, fallback vocal, script voicebox ; gate `_smoke_p2a` (2026-08-08)
- [ ] **Core P2 — prod / UX (ops NUC)**
  - [ ] Profil voicebox `jarvis-fr` sur NUC — `deploy/scripts/setup-voicebox-profiles.sh` (puis aligner jarvis3 si clone)
  - [ ] Sync NUC : P0+P1+P2a → `/opt/jarvis/core` (quand Samir valide)
- [x] **Core P2b — contrat HUD (Core local)** — admission split, `hermes/events.py`, surface_decision ; gates `_smoke_p2b` (2026-08-08)
- [x] **Core P3 — tuiles restantes (Core local)** — missions, vps.code, gate Spotify, smoke HA ; `_smoke_p3_tiles` (2026-08-08)
- [ ] **Core P3 — ops + tests live** (quand Samir valide — voir `docs/audit/CORE_P3.md` § tests)

## Repoussé (hors scope session)

- [ ] **Intégration HUD kiosk** — AuthScene produit (**après** Core figé ; contrat = `FACE_AUTH_CONTRACT.md`)
- [ ] **P3 HUD** — `compose` depuis le navigateur
- [ ] Rétablir Freebox WAN **41223** (Pi)
- [ ] Chrome / Spotify Freebox
- [ ] **Bascule accès LAN** — `architecture/JARVIS-Acces-Reseau.md` §6
- [ ] Zigbee / vraies commandes HA

---

## Prochaines sessions

### Session 2 — Home Assistant
- [x] Pi salon voix/cam/player (ear + cam + ADB) — runtime 2026-08-07
- [ ] Lire [`architecture/JARVIS-Satellites.md`](architecture/JARVIS-Satellites.md)
- [ ] Inventaire HA au-delà des ping LAN

### Session 3 — HUD / Agentic UI
- [x] Preuve Surface Decision : `monitor` → SystemMonitor (Core)
- [x] Veille présence (brief composition) — local 2026-08-11
- [ ] Étendre règles Surface Decision (autres app_id)
- [ ] Câbler exécuteurs SOON (docker/storage/devices/missions/network)
- [ ] Câbler `hud/src/agentic/composer.ts` → WS `surface/compose`
- [ ] Valider `ApprovalCard` + exécution bout en bout
- [ ] Timeline HUD consommant `tool_event` (Phase 3 UI)
- [ ] Layout Engine V1 (sim → snapshots)
- [ ] Dashboard pages → surfaces agentic

### Session 4 — Code ciblé
- [ ] Appel vocal → Hermes (après P3 HUD)
- [ ] Mémoire persistante en base
- [ ] Patterns Eve (approbation → exécution)

---

## Décisions ouvertes (Samir)

1. **Skills Core vs Skills Hermes** — deux notions, un nom
2. **Portée sandbox** (vision §7.3)
3. **`ROLE_PERMISSIONS`** — `child` sans `memory.read` : valider ?

---

## Dette / hygiene

- [ ] Vider `vendor/` des 2 dossiers restants une fois dispatchés
- [ ] Désactiver auth mot de passe SSH sur Pi WAN (clé seule)
