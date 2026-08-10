# Décisions validées — JARVIS OS

> **Ne pas réouvrir** sans demande explicite de Samir.  
> Décisions ouvertes → [`TODO.md`](TODO.md) §Décisions ouvertes.

---

## Sécurité & auth

| Date | Décision |
|------|----------|
| 2026-08 | Le Core **ne fait pas confiance** à une identité envoyée par le HUD |
| 2026-08-07 | **Auth = phrase vocale** (STT). Face **retirée** du parcours auth / enroll / lock / admin. Holomat reste pour gestes & objets uniquement. Phrase challenge : « Jarvis, active-toi ». Core : `voice/verify_phrase` + `enroll_phrase` → `attest_biometric(method=voice)` → `auth.login`. UI : orbe + `AuthVoiceWave` (pas de fenêtre caméra). **Supersède** « la voix n'est pas un facteur » et le contrat face-auth comme facteur d'accès. |
| 2026-08-07 | **Contrat AUTH vs ENROLL (figé)** : (1) **AUTH** = dire « Jarvis, active-toi » → `verify_phrase` → login. (2) **ENROLL** = créer/lier le profil vocal (FirstSetup) — premier profil sans gate ; ajout membre = auth admin d'abord. (3) Wake hands-free « hey Jarvis » ≠ phrase d'auth (alias accepté en transition seulement). (4) HUD capture la voix ; **pas** de séquence Core `auth` en parallèle (évite TTS « hey Jarvis » + `voice_no_match` pendant que le HUD verify déjà). |
| 2026-08-07 | ~~Contrat Face/Auth~~ — archivé pour Holomat technique ; **n'est plus** le facteur d'accès HUD. |
| 2026-08 | ~~La voix n'est pas un facteur d'authentification~~ — **révoqué** 2026-08-07 (phrase STT). |
| 2026-08-08 | **Foyer Samir — rôles à l'enroll (pas de noms en dur dans le code)** : 1er compte → **ADMIN** (Samir). **USER** = adultes permanents du foyer (Zahra, Malika — mêmes droits ; Malika reste USER même si elle habite ailleurs). **CHILD** = Ines, Syrine. Pas de rôle GUEST pour la famille proche. Identify à l'usage (face / voix) → permissions du rôle enrollé. |

## Agentic UI

| Date | Décision |
|------|----------|
| 2026-08-04 | Contrat [`architecture/JARVIS-Agentic-UI.md`](architecture/JARVIS-Agentic-UI.md) = **source de vérité** |
| 2026-08 | Pas de JSX généré ; catalogue `ui_catalog.json` ; admission côté Core |
| 2026-08 | `composer.py` appelle `providers.complete()` — pas Hermes directement (Provider Manager = passage unique LLM) |
| 2026-08 | Plancher de confiance sur les compositions LLM (question hors-sujet → refus) |
| 2026-08 | P2 **avant** P3 — garde-fou avant composition agentique |

## Tool Bus / Agent Runtime

| Date | Décision |
|------|----------|
| 2026-08-09 | **Vision orchestration** (figée) : JARVIS = Core chef d’orchestre ; agents = outils ; rapport agent ≠ preuve ; verify Core obligatoire avant « terminé » ; voix = restitution filtrée (événements `TASK_*`) ; HUD = supervision multi-agent. Doc : [`architecture/JARVIS-VISION-ORCHESTRATION.md`](architecture/JARVIS-VISION-ORCHESTRATION.md). Prochaine évolution : couche Mission → Evidence → Verify → Report. |
| 2026-08-10 | **Skills méthodo vs Capabilities** : extraction DeerFlow = méthodologie dans `deploy/hermes/skills/` (ex. `deep-research`) ; exécution Internet = `agent-reach` ; Capabilities Core inchangées. **Pas** de déploiement DeerFlow/LangGraph comme second cerveau. Amont listé dans `vendor/README.md` § Déjà dispatchés ; dossier vendor **supprimé** 2026-08-10. |
| 2026-08-10 | **Addy agent-skills = dev Cursor only** : idées `/spec` + preuves + personas `/ship` dans `.cursor/rules/dev-lifecycle.mdc`. **Pas** d’install dans Hermes ni clone `vendor/`. |
| 2026-08-10 | **awesome-llm-apps = idées only** : trust-gate/audit, corrective RAG, always-on doc, scope creep Cursor ; gen-UI déjà couvert ; voice Live ≠ auth. **Pas** de clone monorepo. Amont : `vendor/README.md`. |
| 2026-08-10 | **memU = idées only** : wiki `MEMORY.md` + progressive retrieve ; 3 magasins max ; pas de `memu-hermes` / cloud / auto-skills / 4ᵉ store. Amont : `vendor/README.md`. |
| 2026-08-10 | **CrewAI = idées only** : personas role/goal/backstory + CR tâches + sequential/hierarchical dans vision fan-out ; Flows → Mission Core ; pas de runtime CrewAI (Hermes reste agent #1). Amont : `vendor/README.md`. |

| Date | Décision |
|------|----------|
| 2026-08-07 | **Architecture A** : la boucle agent reste **dans Hermes** ; le Core reçoit un **stream d'événements** et expose les capacités périphériques. Le Core **n'est pas** un second agent. |
| 2026-08-07 | Évolution de `Capability` + `IntentExecutor` + `HermesBridge` vers Tool Bus — **sans** dupliquer terminal / file / browser / HA / Plex Hermes. |
| 2026-08-07 | HA + Plex Mode-3 restent **adapters Core** (déterministes) ; enregistrés comme Tools, pas déplacés vers Hermes. |
| 2026-08-07 | Nomenclature : **IntentCapability** = `Capability` existant (alias doc + `IntentCapability = Capability`) ; **HostCapability** = capacité machine. Pas de rename massif. |
| 2026-08-07 | Ne jamais exposer la chaîne de pensée privée du LLM au HUD — seulement `tool.*` / `agent.*` synthétiques. |
| 2026-08-07 | Hermes 0.20.0 NUC expose déjà SSE tool lifecycle (`stream:true` + `/v1/runs/{id}/events`). **Pas de WebSocket agent.** Visibilité = consommer l'API existante, sans patch Hermes. |
| 2026-08-07 | `ToolEvent.device_id` / `AgentToolEvent.device_id` optionnel dès le contrat (NUC/VPS/Pi/phone). Ordre : exposer Hermes → events → séparer Intent/Host → devices → cam/mic. |
| 2026-08-07 | Contrat : [`architecture/JARVIS-Tool-Bus.md`](architecture/JARVIS-Tool-Bus.md). |
| 2026-08-07 | **Phase 2** : `HermesBridge.ask` via `/v1/runs` + SSE → `AgentToolEvent` → bus `TOOL_EVENT` + WS `tool_event` + journal. Filtre CoT. Pas de nouveaux outils, pas de HUD. |
| 2026-08-07 | **Surface Decision** validée : `ToolEvent` / intent → `surface_id` (= `app_id`) → snapshot existant → `SURFACE_SNAPSHOT`. Pas de nouveau protocole WS ; pas de registry React. Première règle : `core.monitor` / `system.cpu` → `monitor` → `SystemMonitor`. |
| 2026-08-07 | **Device Capability Discovery Phase 0** : registre mémoire `DeviceRegistry` ; `HostCapability` + `capability_id` (ex. `camera.capture`) ; messages `device.register` / `capabilities` / `heartbeat` + `GET /v1/devices`. Discovery ≠ droits ; pas de Tool Router / Policy / DB obligatoire. |
| 2026-08-07 | **Device 1 — Satellite Discovery HUD** : client navigateur s'annonce au Core via `device.*` (Device 0). `device_id` = UUID localStorage ; `label` décoratif ; `type=pc_client` ; `runtime_kind=web_hud`. Caps navigateur confirmées seulement (pas de sur-déclaration). Override debug `?device_id=`. Pas d'agents natifs, pas de contrôle, pas de Router. |
| 2026-08-07 | **Device Intelligence — ordre figé** : Device 0 inventaire → Device 1 HUD → Device 2 Pi salon → **puis** Capability Router. Interdit maintenant : router, Agentic UI élargi, remodeler Hermes/HA. HA = adaptateur futur (pas cerveau). Hermes = agent #1, Agent Registry plus tard. |
| 2026-08-07 | **Device 2 — Satellite Pi salon** : `jarvis_device_announce.py` (discovery only) → `pi-salon` / `raspberry_pi` / `jarvis_satellite`. Caps détectées localement ; protocole `device.*` inchangé. Pas de Router / HELLO crypto. |

## Déploiement & vendor

| Date | Décision |
|------|----------|
| 2026-08 | Agent-Reach **épinglé** dans `core/requirements.txt` (commit GitHub, pas PyPI) |
| 2026-08 | hermes-agent sur NUC = **clone git amont**, pas copie `vendor/` |
| 2026-08 | voicebox sur VPS = docker-compose amont |
| 2026-08 | `vendor/` = sas temporaire ; Agent-Reach dispatché ; CopilotKit supprimé |
| 2026-08 | Core + HUD tournent sur **portable en dev** ; NUC = Hermes + PG seulement |
| 2026-08-09 | **Sync NUC Core** : alias SSH `jarvis-nuc-wan` (Win) / `jarvis-nuc` (WSL) — **jamais** `root@IP` sans config clé. Script canonique : `sync-core-only-nuc.ps1` (scp → `/tmp` → rsync → `systemctl restart jarvis-core`). Exclusions prod : `.env`, `data/*.db`, `data/users/`, `data/holomat/`. `pip install` optionnel (`-Pip` / `NUC_PIP=1`) — venv NUC existant suffit en routine. Fronts : `sync-fronts-nuc.ps1` après `npm run build`. |


| Date | Décision |
|------|----------|
| longtemps | IP WAN Freebox **fixe** : `82.66.254.106` |
| 2026-08 | NUC WAN SSH port **41222**, clé `jarvis_nuc_ed25519` |
| 2026-08 | Pi salon WAN SSH port **41223**, clé `jarvis_pi_salon_ed25519`, user `pi` |
| 2026-08 | PostgreSQL tunnel local **5433** (pas 5432 — conflit Laragon) |
| 2026-08 | Tout en loopback sur chaque machine ; tunnels = prod, pas bricolage |

## Télémétrie

| Date | Décision |
|------|----------|
| 2026-08 | `record_event` async, file bornée 512, fil unique d'écriture — **hors chemin critique voix** |

## Gestes

| Date | Décision |
|------|----------|
| 2026-08-05 | Pilotage gestuel **désactivé par défaut** (`?gestures=1` ou localStorage) |
