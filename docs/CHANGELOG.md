# Changelog — jalons de session

> Jalons **projet / session**, pas le détail git. Pour l'historique git : `git log`.

---

## 2026-08-10 — Enrôlement formulaire + profil DB

- Boot : orbe centré, espace net avant **JARVIS** (AuthScene + SystemBootGate)
- FirstSetup : formulaire clic (prénom → civilité → naissance) ; Jarvis commente ; Valider/Reprendre ; puis face (cam+micro) → voix ×3
- Core DB : migration `004_user_profile` (`users.title`, `users.birth_date`) + enroll WS
- Preuve : smoke `_smoke_user_profile` OK ; NUC migrate + wipe users (first_run) ; fronts sync OK

## 2026-08-10 — HUD Vision glass + agentic → NUC

- Langage Vision (SF, `#0A84FF`, glass densifié light|night via `--jv-*` / `SpatialTheme`)
- Agentic : `AgentSurface` ComposeAffordance glass ; `vision.tsx` / Primitives / ApprovalCard sans shout ALL-CAPS
- Chrome HUD : AppStage / AppGrid / DashboardStage / GlassModal / GlassPill + panneaux VisionChrome
- **Produit** : `Background` = `SpatialBackdrop` (dégradés colorés) ; toggle Clair/Nuit (auth + TopBar) — plus seulement `?lab=vision`
- Preuve build : `hud` + `dashboard` `npm run build` OK
- Preuve deploy : `sync-fronts-nuc.ps1` → `/opt/jarvis/hud/dist` ; `curl :8080` **200**

## 2026-08-10 — CrewAI (idées only, pas de runtime)

- Personas / CR tâches / sequential vs hierarchical → `JARVIS-VISION-ORCHESTRATION.md` § fan-out
- Structured outputs → note `JARVIS-Tool-Bus.md` (ToolEvent déjà typé)
- Amont [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) dans `vendor/README.md` § Déjà dispatchés — **pas** de clone

## 2026-08-10 — memU (idées only, pas d’install)

- Wiki MEMORY renforcé + `deploy/hermes/memories/README.md`
- Progressive retrieve / 3 magasins figés / refus memU NUC → vision + Outils + registre
- Amont [NevaMind-AI/memU](https://github.com/NevaMind-AI/memU) dans `vendor/README.md` § Déjà dispatchés

## 2026-08-10 — awesome-llm-apps (idées only, pas de clone)

- Trust-gate + audit trail → `docs/architecture/JARVIS-Tool-Bus.md`
- Corrective RAG / refus → `deploy/hermes/skills/deep-research` + `agent-reach`
- Always-on / veille + voice Live réf. → `JARVIS-VISION-ORCHESTRATION.md`
- Scope creep + evals≠self-rewrite → `.cursor/rules/dev-lifecycle.mdc`
- Amont listé `vendor/README.md` § Déjà dispatchés

## 2026-08-10 — Dev lifecycle Cursor (idées Addy, sans pack)

- `.cursor/rules/dev-lifecycle.mdc` : `/spec` avant multi-couches, preuves ≠ CR, personas `/ship`
- Amont [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) listé dans `vendor/README.md` § Déjà dispatchés — **pas** cloné
- Fan-out personas ajouté dans `JARVIS-VISION-ORCHESTRATION.md`

## 2026-08-10 — DeerFlow dispatché (idées → Hermes skills)

- Pris : `deep-research`, progressive load (`TRIGGER` YAML), convention skill pack, fan-out doc Mission
- `vendor/deerflow2.0-enhanced-main` **supprimé** ; amont noté dans `vendor/README.md` § Déjà dispatchés
- NUC : skills seedés + `jarvis-hermes` restart (health ok)

## 2026-08-10 — Skill Hermes deep-research (méthodo DeerFlow)

- `deploy/hermes/skills/deep-research/SKILL.md` — recherche multi-angles ; fetch via `agent-reach` uniquement
- Renvois : `jarvis-os`, `agent-reach`, `SOUL.md`
- Seed PS1 : copie **tous** les skills sous `deploy/hermes/skills/` (comme le `.sh`)
- Décision : skills méthodo Hermes ≠ Capabilities Core ; pas de runtime DeerFlow

## 2026-08-09 — Vision orchestration + deploy NUC documentés

- Doc [`docs/architecture/JARVIS-VISION-ORCHESTRATION.md`](architecture/JARVIS-VISION-ORCHESTRATION.md) + entrée `DECISIONS.md`
- Scripts deploy alignés prod : `sync-core-only-nuc.ps1`, `sync-core-only-nuc.sh`, `sync-fronts-nuc.ps1`, `sync-to-nuc.sh` (SSH alias, skip pip par défaut, exclusions data NUC)

## 2026-08-08 — Core P3 (tuiles restantes)

- `core.missions` — magasin `data/missions.json`, exécuteur vocal liste/ajout/clôture
- `vps.code` — owner CORE, liste projets `JARVIS_PROJECTS_ROOT`
- `media.music` — disponible si `JARVIS_SPOTIFY_ENABLED=1` (+ Hermes spotify)
- Gate : `_smoke_p3_tiles` · doc `docs/audit/CORE_P3.md`

## 2026-08-08 — Core P2b (contrat HUD — segmentation)

- `surfaces/admission.py` — validateur + catalogue (extrait de `surface.py`)
- `hermes/events.py` — mapping SSE → `AgentToolEvent`
- `surface_decision.py` — mappings skills / cron / outils / cursor
- Gates : `_smoke_p2b`, `_smoke_hermes_events` (inclus `_smoke_phase6`)

## 2026-08-08 — Core P2a (timeout Hermes + fallback vocal)

- `JARVIS_HERMES_TIMEOUT` · défaut SSE **120 s** (était 45 s) · `resolve_hermes_timeout()` dans `hermes/bridge.py`
- `web.search` timeout → phrase vocale explicite + Google (`_fallback_web_surface`)
- Script ops : `deploy/scripts/setup-voicebox-profiles.sh` (jarvis-fr / jarvis-en / jarvis-soft)
- Gate : `python -m jarvis_core._smoke_p2a` (inclus dans `_smoke_phase6`)

## 2026-08-08 — Diag latence Hermes (NUC live)

- Timeout Core SSE Hermes **45 s** vs runs web souvent **> 60 s** → message « Hermes indisponible — réponse locale »
- Tests live : `wss://jarvis.global-it-ss.com/ws` · `core/tools/nuc_p1_live.py` · pas de sync requise pour observer
- Mémo : `docs/claude/JARVIS_SESSION_STATE.md` § Exploitation latence

## 2026-08-08 — Core Phase 5 terminée

- **CapabilityRouter** : origine + device_mode ; HostCapability scoring ; refus personal mismatch
- **Intent routing** : `executors_routing.py` ; tool_event `device_id` ; `surface_result.route`
- **Gate** : `python -m jarvis_core._smoke_phase5` ; doc `docs/audit/CORE_PHASE5.md`

## 2026-08-08 — Core Phase 4 terminée

- **Rename Python** : `jarvis_core.holomat` → `jarvis_core.vision` ; shim deprecated ; protocole WS `type: holomat` inchangé
- **Lifecycle split** : `orchestrator_speech.py`, `orchestrator_boot.py`, `orchestrator_session.py`
- **Device hint** : WS ↔ `device_id` ; `auth_status.device_hint` pour appareils `personal`
- **Gate** : `python -m jarvis_core._smoke_phase4` ALL PASS ; scripts `deploy/scripts/core-phase4-smoke.*`
- **Doc** : `docs/audit/CORE_PHASE4.md`

## 2026-08-08 — Core Phase 3 terminée

- **Sessions WS** : `ConnectionRegistry` + `ConnectionSessionStore` ; login/logout/status scoped par connexion ; `on_disconnect` ferme la session du client
- **Device mode** : `personal|shared|gateway` + `bound_user_id` sur `DeviceRegistry`
- **Refactor** : `intents/executors_hud.py` (HUD + enrollment kiosk)
- **Gate** : `python -m jarvis_core._smoke_phase3` ALL PASS (+ régression Phase 2) ; scripts `deploy/scripts/core-phase3-smoke.*`
- **Doc** : `docs/audit/CORE_PHASE3.md`

## 2026-08-08 — Core Phase 2 terminée

- **Gate** : `python -m jarvis_core._smoke_phase2` ALL PASS ; scripts `deploy/scripts/core-phase2-smoke.*`
- **Multi-profil offline** : `_smoke_face_multi` ; `enroll_member` + `face_reset_user`
- **Refactor WS** : `ws/peripherals.py` ; imports morts retirés des mixins handlers
- **Doc** : `docs/audit/CORE_PHASE2.md` — tests enroll réels reportés (foyer vide)

## 2026-08-08 — Face Auth Core + page dev auth-first

- **Face Mesh Core** : `holomat/face_mesh.py` (468 landmarks → embedding) ; verify disque-first sans PostgreSQL
- **Contrat WS** : enroll/verify/login aligné `docs/architecture/FACE_AUTH_CONTRACT.md`
- **Smokes** : `python -m jarvis_core._smoke_phase0` ALL PASS ; `_smoke_auth_face` PASS (FaceEngine + `face_frame` < 5 s)
- **Parcours dev** : `face_vault.html` refonte auth-first (scan auto → refus si inconnu → enroll → retour auth) ; mesh overlay + bbox Core
- **Outils** : `face_smoke.html` (debug technique), `cam_test.html`, `ws_cli.py`, serve `:8770`

## 2026-08-07 — Satellite salon (Pi) + Freebox + wake

Runtime aligné local ↔ NUC ↔ Pi (hashes). Commit deploy + Core salon.

- **Pi** `deploy/pi-salon/` : `jarvis-ear` (:8767 bouche + wake `hey_jarvis` + ADB player), `jarvis-cam` (:8768 MJPEG)
- **Core** : `salon_speaker` / `salon_ingest` (:8766) / `salon_player` → Freebox via Pi
- **nginx** : `/v1/salon/` → ingest ; HUD kiosk NUC **off**
- Freebox : TV Bro installé ; VLC / Netflix / YouTube / Disney / Plex
- Accès hors maison : NUC WAN OK ; Pi via `jarvis-pi-via-nuc` si `:41223` HS
- HUD : face-only lock (PIN retiré UI), gestes opt-in, allègements kiosk
- **Tool Bus Phase 2** + **Surface Decision** (preuve) : `core.monitor` / `system.cpu` → `SURFACE_SNAPSHOT` SystemMonitor (Core only, pas de modif React)
- **Device Capability Discovery Phase 0** : `DeviceRegistry` + NUC `nuc-main` + `GET /v1/devices`
- **Device 1 VALIDÉ** : UUID `pc_client`/`web_hud` dans registre (portable + iPhone) ; caps honnêtes ; stratégie figée Device 2 Pi → puis Router (pas HA cerveau, pas Hermes unique)
- **Device 2 VALIDÉ** : Pi `jarvis-device-announce` → `pi-salon` online (cam LG, audio, HA gateway, Freebox player)
- Restart NUC Core/Hermes : FaceEngine Holomat prêt ; retester auth faciale HUD
- **AUTH_SMOKE_TEST** : câble Camera → `face_frame` → FaceEngine validé (< 1 s) ; gate P1/P2 + workflow CI optionnel ; régression `dbfa270` classée (workflow HUD, pas modèles)

## 2026-08-06 (midi) — Auth / device / agentic honesty

- Auth HUD : face + PIN uniquement (voix MFA retirée) ; enrôlement gated PIN admin
- Device policy : mic idle ON, cam sleep, gestes opt-in par persona
- Catalogue HUD + Core `capabilities.available` : docker/storage/code/devices/network/missions → SOON / indisponible
- Déployé NUC : HUD `index-DqbE4fNX.js`, dashboard dist, `capabilities.py` ; Core active

## 2026-08-06

### Accès réseau — décision
- **Twingate écarté** : un client + un compte par appareil, coût multiplié par
  habitant. Remplacé par LAN direct (foyer, rien à installer) + WireGuard
  (Samir seul). Contrat : `architecture/JARVIS-Acces-Reseau.md`
- Mesures : 86 ms par aller-retour, dont **2 ms de Core** — tout le reste est
  du trajet. Rien à optimiser dans le code
- Préparé, **non activé** : `deploy/nginx/jarvis-lan.conf`,
  `setup-lan-tls.sh` (DNS-01 Cloudflare), `check-dns-rebinding.sh`,
  `setup-wireguard.sh`, `wg-add-peer.sh`
- Risque identifié qui commande la conception : un nom résolu **uniquement**
  par le DNS public rend le HUD injoignable *dans* la maison si le WAN tombe

### Enrôlement
- Cause du décalage narration/écran trouvée : cinq étapes attendent des
  signaux, **120 s** de délai cumulé possible
- Relances d'attente branchées sur les cinq étapes, avec des événements
  **déjà en cache** — audible sans régénération facturée
- ⚠ Diagnostic intermédiaire **erroné puis corrigé** : les trois signaux
  `enroll.voice` / `face.landmarks` / `face.model` ont bien des émetteurs
  (`__init__.py:2048`, `:1934`, `:1936`/`:1970`). Rien à câbler

### Cause racine unique du 06/08
- Checks rouges, enrôlement inerte et fausse alerte HDMI remontent tous à
  **caméra + micro non autorisés** sur la nouvelle origine. Changer d'origine
  remet les permissions à zéro

### Périphériques
- Fausse alerte « Vérifiez le raccordement HDMI » corrigée : la sonde lisait
  une absence de **permission** comme une absence de **matériel** — elle dit
  maintenant d'autoriser le micro, ce qui pointe la vraie cause

---

## 2026-08-05

### Infra
- Clé SSH dédiée Pi salon : `jarvis_pi_salon_ed25519`, alias `jarvis-pi-wan` (port 41223)
- Port forwarding Pi vérifié ; auth par clé opérationnelle

### Mémoire Claude
- Création structure `docs/claude/`, `JARVIS_CONTEXT.md`, `DECISIONS.md`, `TODO.md`, `ARCHITECTURE.md`

### État technique (non commité)
- P2 clos : `surface.py` + `IntentExecutor` + smokes
- P3 Core prouvé : `composer.py` + smokes + test OpenRouter
- Boot HUD, gestes MediaPipe, Hermes deploy scripts
- `usage.py` async (fix blocage asyncio)

---

## 2026-08-04 — 2026-08-05 (commits)

- Auth : Core ne fait plus confiance au HUD ; voix retirée comme facteur
- Voix : transcription branchée ; séquences auth/enrollment parlées
- Orbe : trame intérieure visible
- Mission Control DEV : modules nommés ; « créer un projet » fonctionnel
- Architecture : index généré avec garde-fou dérive contrats
- Déploiement : HUD servi ; plan de ports fixé

---

## 2026-08-03 — 2026-08-04

- Contrat Agentic UI validé (`JARVIS-Agentic-UI.md`)
- Vision plateforme consignée (`JARVIS-Core-Plateforme.md`)
