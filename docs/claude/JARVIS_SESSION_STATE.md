# État de session — JARVIS OS

> **Dernière mise à jour :** 2026-08-17 12h40 — Dashboard **sans Hermes** + usage tokens **OpenRouter / Anthropic / Cursor**.  
> **À lire en premier** dans toute nouvelle conversation Claude/Cursor.  
>
> **Runtime :** Core + HA + chat LLM. **Hermes retiré.**  
> **Dashboard Usage :** graphe OpenRouter + Anthropic + Cursor (sans Ollama). Crédits OpenRouter via `/key` ; Anthropic = tokens locaux + sonde `/v1/models` ; Cursor = `GET /v1/agents/{id}/usage` à la fin de chaque Cloud run.  
> **Caméra :** « montre la caméra du salon » → tuile `salon-camera` + composant `LiveStream` (`<video>` fMP4). Pi libère `/dev/video0` et pause `jarvis-ear` le temps du live (micro exclusif).  
> **Preuve Pi :** `/live.mp4` → 819 Ko, header `ftyp isom/mp41`.  
> **Si muet :** Chrome bloque l’autoplay son → bouton « Activer le son ».

---

## ⚠️ SIGNALEMENT LIVE 2026-08-16 20h (Claude, pour Cursor) — régressions pendant tests réels Samir

**Contexte :** Samir teste en vrai (voix) pendant que le NUC redéploie en parallèle. `jarvis-core` a redémarré **20:11:58** avec `chat_cancel.py` / `chat_research_route.py` / `chat_search_memory.py` tout neufs (jamais vus tourner avant ce redémarrage). Juste après, Samir rapporte en direct :

1. **JARVIS long, ne répond pas à temps** — probablement le sujet latence déjà connu (§ header, `_probe_hermes_latency.py`), pas nouveau.
2. **« il s'interrompt sa recherche quand il entend qqch »** — code lu (`chat_cancel.py::looks_like_cancel_request`) : ne déclenche que sur texte transcrit contenant stop/annule/arrête la recherche, pas sur un simple bruit. Donc soit la STT mistranscrit du bruit ambiant en un mot qui matche un pattern, soit il y a un barge-in/VAD plus bas niveau (pas trouvé où) qui coupe indépendamment de ce fichier. **Pas confirmé avec des logs live** — je n'ai pas eu le temps de capturer l'événement exact avant ce message.
3. **« l'agentic UI ne marche pas, les outils recherche n'affichent rien, ni Google Chrome ni les composants agentic UI »** — pas d'investigation faite côté HUD (hors de portée immédiate depuis Claude, pas de navigateur ouvert sur le HUD live). À vérifier : est-ce que `hud_command action=open_external` et `_publish_result_surface` (dans `hermes/delegate.py`) arrivent bien au HUD et sont bien rendus côté React après le refactor `chat_search_memory`/`chat_research_route` ?

**Pas de code touché par Claude sur ces 3 points** — uniquement lu `chat_cancel.py`, `chat_research_route.py`, `chat_search_memory.py`, `hermes/delegate.py` (déjà à jour, identique au NUC). Aucun redéploiement déclenché par Claude sur ce tour.

**Suggestion :** si Cursor est encore en train d'itérer sur `chat_cancel`/`chat_research_route`/`chat_search_memory`, un point de sync avant le prochain redéploiement éviterait de tester du code à moitié fini en live avec Samir dessus. Sinon, prochaine étape logique : logs live NUC pendant un test volontaire (recherche web + interruption volontaire) pour capturer l'événement exact, + vérif HUD console/network pendant un `web.search`.

**Cursor fix pass 20h15 (post-signalement) :**
- Core resync LAN · `JARVIS_HERMES_CHAT_ONLY=1` · platform_toolsets **web+skills** (2).
- Smokes NUC : toolset rollout · chat_research_route · gateway ALL PASS.

**Cursor fix pass 21h08 (symptômes Samir — interruption + agentic UI vide) :**
- **Cause interruption** : micro HUD en barge-in continu → bruit/STT (« stop », écho TTS) annulait ou coupait la recherche. Fix Core : pendant run Hermes actif → ignorer écho + fragments <12 car / <3 mots ; annulation explicite seulement (« stop la recherche »). Fix HUD : pas de barge-in sur transcripts courts.
- **Cause agentic UI vide** : tuile reach + Chrome n'ouvraient qu'**après** Hermes (10–120 s). Fix : `_prime_web_search_ui` dès le début de `web.search` (open_space reach + Google immédiat).
- **Déployé NUC 21h08** : Core + HUD rebuild/sync (`sync-core-only-nuc.ps1`, `sync-fronts-nuc.ps1`).
- **Test vocal** : « cherche sur google la météo demain » → tuile Internet + Chrome **tout de suite**, recherche continue sans couper au bruit.

---

## Retrait Hermes — clos (Cursor, confirmé 22h35)

Retrait piloté par Cursor (service NUC stop+disable, chat basculé sur LLM providers). Claude n'a pas touché au retrait lui-même — voir en-tête §Runtime pour l'état courant.

Domotique non affectée : `home.control` / `media.*` sont déjà `Owner.CORE`, jamais passés par Hermes.

---

## 🔴 EN COURS 2026-08-16 23h (Claude) — Phase 1 : pont LLM direct (OpenRouter + Anthropic)

**Répartition actée avec Samir** — doc de référence : [`docs/architecture/JARVIS-Post-Hermes-Architecture.md`](../architecture/JARVIS-Post-Hermes-Architecture.md).

- **Claude (moi, ce chantier)** : Phase 1 — chat/recherche via OpenRouter (primaire) + Anthropic direct (secours), réponse structurée `{speech, display}`. Fichiers touchés : `core/jarvis_core/llm_chat.py` (nouveau), `core/jarvis_core/ws/handlers/chat.py`.
- **Cursor** : Phase 2 — Mission Control Dev via Cursor Cloud Agents API (`mission_dev/`, `dev.board.*`, nouveau `cursor_agents.py`).

**Fait et déployé (23h47)** — pas de nouveau fichier finalement : `providers.py` (AI Provider Manager, antérieur à Hermes) était déjà branché par Cursor dans `chat.py` (`self.providers.complete(...)`). J'ai juste :
- Basculé `JARVIS_OPENROUTER_MODEL` de `qwen/qwen3.5-flash-02-23` vers `anthropic/claude-sonnet-4.5` — chat en Claude, mesuré **2,4s** (vs 6-9s avec Hermes).
- Ajouté `_anthropic_complete()` dans `providers.py` — repli direct API Anthropic (`ANTHROPIC_API_KEY` dans `core.env`) si OpenRouter échoue, avant Ollama. Testé isolément : 2,9s, réponse correcte.
- Nouveau smoke `_smoke_providers_fallback.py` — ALL PASS (mock, pas de réseau réel).
- Smokes existants revérifiés : `_smoke_gateway`, `_smoke_chat_capability_routing`, `_smoke_echo_guard`, `_smoke_p2a`, `_smoke_capabilities` tous PASS.

**Régression trouvée, pas de mon fait, pour Cursor :** `_smoke_trigger_disambiguation.py::test_b_analyse_donnees_still_routes_to_data_analyze` échoue — teste encore la capacité `data.analyze` (`Owner.HERMES`, app_id `analyze`), retirée avec Hermes. Test resté périmé après le nettoyage, pas touché ici (hors scope de ce tour).

**Suite (23h56, clos) :**
- Palier Ollama entièrement retiré de `providers.py` (mort — jamais configuré, pas de regret) : enum `ProviderMode.LOCAL/REMOTE` supprimés, `_ollama_complete`/`_ollama_base` supprimés, `complete()` simplifié à OpenRouter → Anthropic → message d'erreur propre.
- Agentic UI pour le chat libre : `chat.py` appelle maintenant `_publish_result_surface("reach", title="Jarvis", body=reply, source="chat.free")` en plus de la voix — carte visible à chaque réponse de chat, pas seulement recherche. Réutilise la tuile `reach` existante (pas de nouvelle tuile HUD ce soir — si vous voulez une tuile "Assistant" dédiée avec sa propre icône, c'est un fast-follow côté `hud/src/app/apps/catalog.ts`, pas fait ici).
- Smokes : `_smoke_p2a`, `_smoke_gateway`, `_smoke_chat_capability_routing`, `_smoke_echo_guard`, `_smoke_capabilities`, `_smoke_providers_fallback` (nouveau) — tous PASS.
- Déployé NUC 23h56.

**Suite (00h23, clos) — réponse structurée + choix de composant agentic UI :**
- `providers.py::complete_structured()` — le LLM choisit parmi 4 composants (`ResultPanel`, `DataTable`, `ImageViewer`, `ChartCard`, sous-ensemble des 58 du catalogue) et renvoie `{"speech", "component", "props"}` en JSON strict. Parsing tolérant (`_parse_structured_reply`) : jamais de crash, jamais de composant halluciné accepté, repli `ResultPanel` avec le `speech` préservé si le JSON est invalide.
- `STRUCTURED_COMPONENTS` déclare les props **obligatoires exactes** de chaque composant (vérifiées contre `ui_catalog.json` — `ResultPanel` a `source`+`items` obligatoires même avec valeur par défaut, piège trouvé et corrigé ce soir).
- `surfaces/publisher.py::publish_component_surface()` — généralisation de `publish_result_surface` (conservée telle quelle, compat rétro) pour diffuser n'importe quel composant du catalogue, pas seulement `ResultPanel`.
- `chat.py` : chat libre appelle `complete_structured` au lieu de `complete` ; `speech` → TTS/chat_reply (inchangé), `component`+`props` → `_publish_component_surface("reach", ...)`.
- Nouveau smoke `_smoke_structured_reply.py` — **inclut une vérification anti-dérive** : compare les props obligatoires déclarées dans `STRUCTURED_COMPONENTS` aux `required` réels de `ui_catalog.json`, échoue si le HUD change son schéma sans mise à jour ici.
- **Testé en direct sur le NUC** : demande de comparaison → Claude choisit `DataTable` tout seul, remplit les bonnes colonnes/lignes (4,8s). Chat casual → `ResultPanel` (3,5s). Les deux confirmés avec le vrai réseau, pas mockés.
- Layout HUD (orbe qui se réduit en bas quand une surface s'ouvre) : **déjà existant**, rien touché — `App.tsx` bascule automatiquement sur `<MiniOrb position="bottom-center">` dès qu'une seule app est visible (`hudMode === 'surface'`).

**Pas encore fait (fast-follow, hors scope ce soir) :** tuile HUD "Assistant" dédiée (réutilise `reach` pour l'instant) ; les 54 autres composants du catalogue (Terminal, CodeBlock, DeviceGrid…) non exposés au chat libre — ajout trivial dans `STRUCTURED_COMPONENTS` si besoin, un composant à la fois.

**Suite (00h57, clos) — intuitivité (accueil + suggestion + mémoire) :**
- `ws/handlers/auth.py::_speak_welcome_greeting()` — après login réussi, génère (via `providers.complete`) et parle une phrase d'accueil dynamique et contextuelle (heure, jamais figée), termine par une question ouverte. Lancé en tâche de fond (`asyncio.create_task`) — un échec ne bloque jamais le login. Testé en direct NUC : 2,8s, cohérent avec la personnalité JARVIS.
- `providers.py::_STRUCTURED_INSTRUCTIONS` — ajout d'une consigne : suggestion de suite naturelle en fin de `speech` seulement quand pertinent (jamais systématique, jamais sur une réponse déjà complète).
- `chat.py::_handle_user_chat_body` — recherche mémoire (`jarvis_memory_search`, lecture seule) injectée en contexte avant `complete_structured` si des souvenirs pertinents existent. Respecte l'invariant existant : le chat ne fait jamais écrire en mémoire (ça reste réservé au pipeline Vérification).
- Nouveau smoke `_smoke_intuitivite.py` (8 checks : accueil nominal/échec sans crash, mémoire avec/sans hits, mémoire indisponible sans crash) — ALL PASS.
- `CURSOR_API_KEY` posée dans `core.env` NUC pour la Phase 2 Cursor. `JARVIS_CURSOR_REPO_URL` **pas posée** — pas de remote git sur ce repo local, à fournir par Samir/Cursor.
- Déployé NUC 00h57 (+ `systemctl daemon-reload` après le warning unit-file changé par le passage de Cursor).

---

## ✅ Phase 2 CLOS — Cloud Agents API (Cursor, 2026-08-17)

**Livré :**
- `core/jarvis_core/cursor_agents.py` — client API (`POST /v1/agents`, Basic auth, `autoCreatePR=False` toujours).
- `dev_agent/dispatch.py::start_run` — si `agent=="cursor"` + `CURSOR_API_KEY` → cloud ; sinon device Windows (inchangé).
- Registry : champs `cloud_agent_id` / `cloud_run_id`.
- Smoke : `python -m jarvis_core._smoke_cursor_agents` → **ALL PASS**.
- Policy : toujours via `mission_board` avant `start_run` (pas contourné).
- CLAIM vs OBSERVATIONS : respecté (pas de patch inventé).

**Reste ops (Samir / sync) :** poser `CURSOR_API_KEY` + `JARVIS_CURSOR_REPO_URL` dans `/etc/jarvis/core.env` NUC, sync Core, tester un `dev.board.start_run` réel.

**Détail :** [`docs/architecture/JARVIS-Post-Hermes-Architecture.md`](../architecture/JARVIS-Post-Hermes-Architecture.md) §6.

---

## HANDOFF 2026-08-13 (nuit, Cursor) — Graph3D V0 (primitive Agentic)

**Périmètre :** HUD local. Pas NUC. Pas `OrbVoyage` / `OrbLite`.

**Livré :** primitive `Graph3D` dans le catalogue Agentic (`definitions` + `renderers` + `ui_catalog.json`). DemoStage `3D / Orb Graph` = lab qui **importe** `Graph3D`, pas un renderer parallèle. Adapter Architecture = premier jeu de données.

**Focus :** parent-owned. Clic 3D → `onFocusChange(id)` → inspecteur 2D (`KeyValueList`). Puce lab → même `focus` → caméra lerp.

**STOP.** Pas bloom lourd, pas 10k défaut, pas force-layout, pas sync NUC.

---

## HANDOFF 2026-08-13 (soir 4, Cursor) — Dashboard V2 + vues HUD (iframe)

**Périmètre :** Dashboard admin + contrat HUD iframe. Pas NUC/Pi/VPS. Pas Agentic UI (`AgentSurface`, composer, Layout Engine).

**Livré :** une seule connexion Core (`CoreSessionContext` + `dashRequest`) — plus de WebSocket par page. Recovery hors face-gate. `?skipAuth=1` DEV. `open_space hub` → iframe Dashboard. Sidebar Hermes réel. Agents = DeviceRegistry.

**HUD :** iframe `Figma2Stage` + `postMessage` `jarvis:navigate` / `jarvis:inputMode`. DEV iframe = `http://127.0.0.1:5174/?skipAuth=1`. Memory / Verification / Vision / Tool timeline HUD = Core direct, **pas** le Dashboard.

**STOP.** Pas page Memory Dashboard, pas migration auth vocale gate, pas commit, pas sync.

---

## HANDOFF 2026-08-13 (soir 3, Cursor) — HUD consommateur Core

**Livré :** `surface_result.verification` → VerificationCard (library) ; `tool_event` → ToolTimeline (ToolCall) ; `VISION_SCENE` → ObjectDetectionOverlay sur Holomat ; monitor passe par AgentSurface.

**STOP.** Pas nouveau chantier sans GO Samir.

---

## HANDOFF 2026-08-13 (soir 2, Cursor) — Audit global + bus Memory runtime

**Périmètre :** tout JARVIS hors caméra/Pi. Aucun déploiement.

**Corrigé :** MemoryAPI n'émettait pas `MEMORY_*` en prod (`_emit is None`). `get_memory_api(emit=…)` + `bind_emit` depuis `orchestrator_lifecycle`. `load_memories()` passe par MemoryAPI (plus de JSON forcé). Smoke M1 12/12 OK.

**STOP :** pas Layout Engine dans App, pas overlay vision HUD, pas cutover Hermes memory live, pas tests HA équipements.

---

## HANDOFF 2026-08-13 (soir, Cursor) — Memory V2 PgAdapter + M4

**GO Samir** : PG = backend prod derrière Memory V2 ; M4 Hermes → Core MemoryAPI. Aucun commit.

**Socle inchangé :** `MemoryAPI` + `MemoryPolicy` + types + Verification.

**PgAdapter (prod) :** `memory/adapters/pg.py` · Alembic `005_memories` (PK `id+user_id`, FTS PG, pas de pgvector) · `build_memory_api()` choisit PG si DSN postgresql, sinon LocalJson · migration `python -m jarvis_core.memory.migrate_json` (JSON conservé). MemPalace = spike M3. CBM hors Memory.

**M4 :** `memory/service.py` (`jarvis_memory_search|recall|store_note`) · HTTP `POST /v1/memory/*` (salon ingest :8766) · intents Core sans triggers HUD · skill `deploy/hermes/skills/jarvis-memory/` · toolset Hermes `memory` conservé (transitoire).

**Preuves :** `_smoke_memory` · `_smoke_verification_memory` · `_smoke_memory_pg` · `_smoke_memory_m4` · `_smoke_verification_wiring` · `_smoke_capabilities` — ALL OK.

**STOP :** pas KG / Closets / embeddings / MemPalace mining / reviewers LLM / commit / push / HUD / Vision / HA / CBM.

---

## HANDOFF 2026-08-13 (matin, Cursor) — intent Core `architecture.explain`

**Fil Cursor uniquement.** Claude = HA/Salon.

**Livré :** intent `architecture.explain` joignable depuis le chat (triggers) → `_open_intent` → `explain_live()` → `chat_reply` (pas de TTS).

**Fichiers :**
- `core/jarvis_core/capabilities.py` — `architecture-explain`
- `core/jarvis_core/executors/architecture.py` — mixin (pas speak / HUD / HA / Hermes)
- `core/jarvis_core/executors/__init__.py` — mixin branché
- `core/jarvis_core/intents/registry.py` — binding
- `core/jarvis_core/_smoke_architecture_intent.py`
- `core/jarvis_core/_smoke_capabilities.py` — `NO_TRIGGER_OK`

**Chemin :** `intents.execute("architecture.explain", {prompt, skip_llm})` → dict `{ok, explanation, snapshot_id, meta}`.

**Preuve :** `python -m jarvis_core._smoke_architecture_intent`

**STOP :** pas de TTS · pas HUD Architecture View · pas Hermes · pas D3.1 · pas propose.

---

## HANDOFF 2026-08-13 (session Claude) — Chantier HA + Salon : implémentation M2.2 + extension homeassistant.py

**Feu vert Samir** pour passer de la cartographie à l'implémentation (après validation du rapport précédent). Périmètre : doublon Freebox Player, extension `homeassistant.py`, M2.2 (Verification HA). **Pas de test réel sur équipement exécuté** — proposé, Samir a choisi d'attendre.

**Fichiers modifiés :**
- `core/jarvis_core/homeassistant.py` — doublon Freebox Player réglé côté Core (`EXCLUDED_ENTITY_IDS = {"media_player.freebox_player_pop"}`, garde `androidtv_remote`, aucune entité désactivée côté HA) ; `SERVICES_BY_DOMAIN` remplace l'ancien `SERVICES` plat (cover ≠ media_player — `cover.turn_on` n'existe pas côté HA, l'ancien code l'aurait appelé) ; mots-clés `media_player` dans `_domain_of()` (tv/télé/apple tv/bravia/freebox player) ; actions `pause`/`play`/`mute` dans `_action_of()` ; `Entity.attributes` ajouté (nécessaire pour vérifier `is_volume_muted`, qui ne change pas `state`) ; `execute()` renvoie `pre_state`.
- `core/jarvis_core/verification_hooks.py` — **M2.2** : `_observe_home_reobserve()` remplace `_observe_home_deferred()` (le stub M2.1 disait déjà littéralement *"independent HA reobserve = M2.2"*). Relit `/api/states` après l'action (2 essais bornés, 0,5 s puis 1 s — dette 6.1-2), compare à un état attendu par domaine/action, jamais une cible devinée pour toggle/stop sans `pre_state` connu. `build_observation`/`build_verification_request` passés en `async` (seul `home.control` fait un vrai appel réseau ; les autres intents restent synchrones en interne).
- `core/jarvis_core/intents/executors_routing.py` + `core/jarvis_core/ws/handlers/terminal.py` — points d'appel adaptés à l'async.
- `core/jarvis_core/_smoke_verification_wiring.py` — les 9 tests adaptés à l'async (signature changée, logique inchangée).
- `core/jarvis_core/_smoke_verification_home_m22.py` — **nouveau**, 9 smokes M2.2 dédiés (turn_off validé, claim HA "ok" mais état inchangé → DISPUTED, online ≠ preuve d'action, HA injoignable ≠ échec device, entité disparue, mute via attribut, toggle sans pre_state jamais deviné, 2 tests bout-en-bout via VerificationPipeline).

**Preuve — tout exécuté réellement, pas relu :**
```
D1 snapshot 9/9 · D3 audit 14/14 · D2 explain 14/14 · M2.1 wiring 9/9 (async)
M2 memory 7/7 · Memory M1 10/10 · P3 tiles 15/15 · M2.2 home reobserve 9/9 (nouveau)
```

**STOP :** aucune action réelle sur un équipement (Apple TV/Freebox Server/Bravia/Freebox Player) — 4 tests proposés avec risque annoté chacun, Samir a choisi d'attendre. Ne pas les déclencher sans nouvelle demande explicite.

---

## HANDOFF COMPLET — Architecture Awareness (arrêt après D2.1)

**Spec :** [`docs/architecture/JARVIS-Architecture-Awareness.md`](../architecture/JARVIS-Architecture-Awareness.md) (B′ + §14 / §14.1 / §15).  
**Pipeline figé en code :**

```text
ArchitectureSnapshot (D1)
  → architecture.audit() (D3)
  → architecture.explain() templates (D2.0)
  → build_llm_bound_payload(snapshot, audit) ancre (D2.1)
  → [D2.2 LLM réel — PAS COMMENCÉ, feu vert requis]
```

### 1. État exact actuel — fichiers

| Fichier | Rôle |
|---------|------|
| `core/jarvis_core/architecture/__init__.py` | Exports publics package |
| `core/jarvis_core/architecture/schema.py` | `SCHEMA_VERSION`, invariant AVAILABLE, redaction secrets |
| `core/jarvis_core/architecture/snapshot.py` | D1 — `snapshot()` compilateur READ-ONLY IN_MEMORY |
| `core/jarvis_core/architecture/audit.py` | D3 — `audit(snapshot)` diagnostics déterministes |
| `core/jarvis_core/architecture/explain.py` | D2.0 — `explain()` templates + `build_explain_llm_context` + `validate_llm_explanation` |
| `core/jarvis_core/architecture/llm_payload.py` | D2.1 — `build_llm_bound_payload(snapshot, audit)` ancre pure |
| `core/jarvis_core/architecture/llm_live.py` | D2.2 — `explain_live()` + `prompt_from_bound_payload` |
| `core/jarvis_core/_smoke_architecture_snapshot.py` | Smokes D1 |
| `core/jarvis_core/_smoke_architecture_audit.py` | Smokes D3 (+ `device_online_does_not_prove_action_success`) |
| `core/jarvis_core/_smoke_architecture_explain.py` | Smokes D2 |
| `core/jarvis_core/_smoke_architecture_llm_payload.py` | Smokes D2.1 |
| `core/jarvis_core/_smoke_architecture_llm_live.py` | Smokes D2.2 |
| `docs/architecture/JARVIS-Architecture-Awareness.md` | Spec B′ + contrats D2/D2.1 |

**Phases livrées :** A (audit) · B′ (spec) · D1 · D3 · D2.0 · D2.1 · **D2.2**.  
**Phases non livrées :** D3.1 (ON_DEMAND probes) · propose · F HUD · G graphe · wiring vocal/Hermes/WS.

### 2. Tests — exécutés / validés / non validés

| Smoke | Commande | Résultat dernière session |
|-------|----------|---------------------------|
| D1 | `python -m jarvis_core._smoke_architecture_snapshot` | `=== ALL OK ===` |
| D3 | `python -m jarvis_core._smoke_architecture_audit` | `=== ALL OK ===` |
| D2 | `python -m jarvis_core._smoke_architecture_explain` | `=== ALL OK ===` |
| D2.1 | `python -m jarvis_core._smoke_architecture_llm_payload` | `=== ALL OK ===` |
| D2.2 | `python -m jarvis_core._smoke_architecture_llm_live` | `=== ALL OK ===` |

**Validé par ces smokes :**

- Snapshot JSON + `schema_version` / `snapshot_id` / freshness / provenance  
- Invariant AVAILABLE (OBSERVED + evidence + ¬stale) ; downgrade sinon  
- Conflit Hermes NUC/VPS (`conflict=true`, `resolved_by=null`)  
- Secrets redactés ; pas de mutation registry/snapshot  
- Audit déterministe + chain `depends_on` Netflix/Apple TV  
- Device ONLINE ≠ preuve d’action  
- Explain : Ghost non inventé ; CONFIGURED/UNKNOWN non promus ; historique Hermes ignoré  
- Payload D2.1 : identité déterministe ; pas d’`agent:ghost` ; STALE conservé ; no LLM/réseau  
- D2.2 : prompt = payload borné ; hallucination rejetée ; SYSTEM skip ; erreur → template  

**Non validé (hors scope actuel) :**

- Appel OpenRouter **live** (smoke D2.2 = provider injecté, pas de réseau)  
- Branchement Hermes / voix / WebSocket / HUD  
- Probes BACKGROUND / ON_DEMAND (SSH, ADB, HA deep, Ollama HTTP)  
- `capability.propose()`  
- Déploiement NUC / sync prod Architecture Awareness  
- E2E utilisateur « JARVIS explique à voix haute »

### 3. Contrats / invariants garantis

| Invariant | Garantie |
|-----------|----------|
| AVAILABLE | ⇒ provenance OBSERVED ∧ evidence≠[] ∧ ¬stale |
| UNKNOWN | ne peut pas être promu en AVAILABLE |
| CONFIGURED | ≠ AVAILABLE (config ≠ observation) |
| STALE | reste visible ; pas de AVAILABLE stale |
| Conflits DOC | conservés (ex. Hermes NUC/VPS) ; pas de résolution silencieuse |
| Secrets | redactés (snapshot, audit, explain, payload) |
| Snapshot | **seule** source de vérité runtime Architecture |
| Audit | déterministe ; consomme le snapshot ; pas 2ᵉ vérité |
| Explain | n’invente pas de nœuds ; templates CODE + audit |
| Payload LLM (D2.1) | strictement dérivé de snapshot + audit |
| LLM live (D2.2) | Provider Manager + payload D2.1 ; rejet → template |

### 4. Ce qui n’est PAS encore branché

- Hermes (tools / skills / seed)  
- Pipeline vocal / TTS / voicebox  
- HUD / Dashboard Architecture View  
- Intent / WS chat → `explain_live`  
- Probes réseau / BACKGROUND_HTTP  
- SSH / ADB d’audit ON_DEMAND (D3.1)  
- `capability.propose()`  
- Graphe runtime / Graphify  
- NeuralMap comme vérité  
- Auto-remediation / auto-install  

### 5. Prochaine étape recommandée (Architecture Awareness)

**Brancher `explain_live` sur un intent Core / WS** (pas voix, pas HUD) — **feu vert Samir**.

Alternatives (également sous feu vert) : D3.1 probes budgetés · propose · HUD — **pas** dans le même chantier que HA/Salon.

### 6. Contexte parallèle (HA + Salon)

> Le chantier HA + Salon est actuellement traité séparément par Claude.  
> Architecture Awareness ne doit **pas** modifier Home Assistant, Freebox, Pi, ADB ou les équipements pendant cette phase.

Détail HA : handoff Claude ci-dessous (rapports Artifact uniquement à ce stade côté Claude).

### 7. Règle pour demain / prochaine session

1. Lire **ce handoff** en premier.  
2. Demander / attendre une **décision explicite** sur la phase suivante (intent/WS, D3.1, propose, HUD).  
3. **Aucune** nouvelle fonctionnalité Architecture Awareness commencée par défaut.  
4. Ne pas mélanger avec le chantier HA/Salon sans arbitrage Samir.

---

## HANDOFF 2026-08-13 — Architecture Awareness D2.1 (détail court)

**Livré :** `llm_payload.build_llm_bound_payload(snapshot, audit)` — pur, déterministe, redacté.  
**Doc :** §14.1.  
**Séparation :** D2 `explain` / `build_explain_llm_context` ≠ D2.1 ancre.  
**Preuve :** `_smoke_architecture_llm_payload` ALL OK.

---

## HANDOFF 2026-08-13 (session Claude, journée) — Écosystème HA + Salon + review Memory V2 M1

**Contexte :** en parallèle du chantier Architecture Awareness (D1/D3/D2/D2.1, Cursor), cette session Claude a traité deux fils séparés.

### 1. Chantier Home Assistant + Freebox + Salon (rapport uniquement, zéro code/déploiement)

- **Audit code** : `homeassistant.py` ; `salon_player.py` ; `plex.py`.  
- **Sonde réelle** + livrables Artifact (`audit-ha-ecosystem`, `probe-ha-ecosystem`, `chantier-ha-salon-proposal`).  
- **STOP HA :** en attente feu vert Samir — **ne pas modifier HA/Freebox/Pi/ADB depuis le fil Architecture Awareness**.

### 2. Review code Memory V2 M1 (Cursor)

- **P1** : `policy.py::admit()` ne scanne pas `draft.summary` pour secrets — à corriger avant M2.  
- **Verdict review :** REQUEST CHANGES (P1).

---

## HANDOFF 2026-08-13 — Architecture Awareness D2 (détail court)

**Pipeline :** `snapshot → audit → explain → (optional llm_formatter mock)`.  
**Preuve :** `_smoke_architecture_explain` ALL OK.  
**Pas** de LLM réseau réel ni branchement vocal.

---

## HANDOFF 2026-08-13 — Architecture Awareness D3 (détail court)

**Livré :** `architecture.audit(snapshot)`.  
**Preuve :** `_smoke_architecture_audit` ALL OK.

---

## HANDOFF 2026-08-13 — Architecture Awareness D1 (détail court)

**Livré :** `architecture.snapshot()` schema `1.0.0`.  
**Preuve :** `_smoke_architecture_snapshot` ALL OK.

---

## HANDOFF 2026-08-13 — Architecture Awareness PHASE B′

Spec figée : [`JARVIS-Architecture-Awareness.md`](../architecture/JARVIS-Architecture-Awareness.md).

---

## HANDOFF 2026-08-12 — Architecture Awareness (PHASE A+B)

PHASE A audit read-only · PHASE B spec — voir doc.

---

## HANDOFF 2026-08-12 — Memory V2 M2.1 (wiring Core)

**Branché :** `orchestrator_lifecycle` instancie `VerificationPipeline` · `_execute_intent` · `_terminal_run`.  
**Helper :** `verification_hooks.py` (allowlist + observers).  
**Règle :** Hermes/texte/agent ok ≠ preuve · seul Core émet `RESULT_VALIDATED`.  
**Evidence :** `details` + `reviews[]` (vide, prêt reviewers).  
**Preuve :** `_smoke_verification_wiring` + M1 + M2 → ALL OK.  
**STOP :** pas M3 / pas reviewers LLM sans feu vert.

---

## HANDOFF 2026-08-12 — Memory V2 M2 (Verification → Memory)

**Audit :** aucun `RESULT_VALIDATED` Core n’existait (cahier §7 + HUD VerificationCard « non branché »).  
**Créé :** `core/jarvis_core/verification.py` — pipeline déterministe + gate Memory.  
**Idempotence :** `mr:{mission_id}` upsert.  
**Séparation :** `RESULT_VALIDATED` ≠ `MEMORY_STORE_REJECTED` (reject Memory ne casse pas la validation).  
**Preuve :** `_smoke_verification_memory` + `_smoke_memory` → ALL OK.  
**Hors scope :** MemPalace · Hermes · HUD · NUC · wire executors globaux · P2 hard-forget/trust evidence.

**STOP :** pas de M3 sans feu vert Samir.

---

## HANDOFF 2026-08-12 — Memory V2 M1 (code)

**Scope respecté :** PAS MemPalace · PAS Hermes · PAS HUD · PAS NUC · PAS M2.

**Package :** `core/jarvis_core/memory/` — `api.py` · `policy.py` · `types.py` · `events.py` · `adapters/local_json.py`  
**Bus :** `MEMORY_STORED|RECALLED|FORGOTTEN|REJECTED` dans `bus.py`  
**Compat V1 :** `list_items` / `add_item` / `delete_item` (WS inchangé)  
**Preuve :** `python -m jarvis_core._smoke_memory` → `=== ALL OK ===`

**STOP :** attendre review Claude + feu vert Samir avant M2.

---

## HANDOFF 2026-08-12 — MemPalace + Memory API V2 (spec)

**Décision Samir (figée) :** MemPalace = candidat sérieux Memory V2 · `vendor/mempalace/` référence auditée · **pas** `Core → MemPalace` direct · Memory ≠ Policy ≠ auth ≠ exécution · KG/Closets plus tard.

**Livrable :** [`docs/architecture/JARVIS-Memory-V2.md`](../architecture/JARVIS-Memory-V2.md) — abstraction `MemoryAPI` + adapters, Memory Policy, lien Verification → `MEMORY STORE`, phases M0→M5.

---

## HANDOFF 2026-08-11 (soir, session Claude) — Layout Engine V1 + Glass System + Agentic Component Library

**⚠️ Corrige le handoff Cursor ci-dessous** : la ligne *« Layout Engine V1 demandé : analysé, pas de vrai LayoutSnapshot encore »* est **obsolète** — cette session l'a entièrement implémenté et dépassé. Ne pas se fier à cette ligne plus bas, se fier à celle-ci.

**Plan complet (architecture, décisions, tables composant-par-composant) :**
`C:\Users\samir\.claude\plans\atomic-purring-blum.md` — **relire ce fichier en premier** avant de continuer, il contient tout le détail que ce résumé compresse.

### Fait et vérifié (typecheck propre, browser-testé pour le Layout Engine)

1. **Layout Engine V1** (`hud/src/agentic/layout/{node,solver,priority,snapshot,gridRenderer,runtime}.ts`) — construit, browser-vérifié (agent-browser) plus tôt dans la session : shelf-packing + dégradation par priorité `preferred→compact→collapsed→hidden`, zéro `maxRows` arbitraire (compare à `availableHeight` réel). **Étendu cette session** : `aspectRatio` (couplage largeur/hauteur dans `sizeAtTier`) + `expandBehavior` (`'fill'|'preserveAspect'|'center'|'horizontal'|'vertical'`, seuls `fill`/`preserveAspect` implémentés, le reste retombe sur `fill` + `console.warn`). Vérifié par script `tsx` autonome (9 scénarios, supprimé après usage) — tous passés.
2. **Glass System consolidé** dans `hud/src/visual/glass/` (nouveau, canonique). Avant cette session il y avait **3 systèmes Glass parallèles** — `components/glass/` (nommé « legacy » par le code lui-même), `spatial/GlassSurface`+famille (déjà utilisé en prod sous SectionFrame/MetricTile/vision.tsx), et du CSS ad-hoc. Décision validée avec Samir : `spatial/GlassSurface` devient le socle, relocalisé + étendu → `visual/glass/{tokens,GlassSurface,GlassPanel,GlassCard,GlassButton,GlassOverlay,GlassHeader,index}.ts(x)`. Anciens fichiers `spatial/Glass*` **supprimés**, `spatial/tokens/materials.ts` scindé (`spatial/tokens/spatial.ts` garde parallax/spring). `components/glass/` (legacy, ~15 fichiers chrome app) **non touché** — dette de suivi documentée dans `docs/JARVIS_V2_CAHIER_DES_CHARGES.md` §8.19 (corrigé cette session).
3. **Bibliothèque de composants Agentic** dans `hud/src/agentic/components/` (nouveau, ~50 fichiers, 9 familles : metrics/charts/data/system/agent/text/media/navigation, + containers en cours). Règle appliquée partout : réutiliser l'existant (`agentic/library/*` via `shared/adaptLibraryComponent.tsx`) plutôt que dupliquer, un seul renderer de base par famille + presets sémantiques (ex. `ChartCard` unique → LineChart/AreaChart/BarChart/DonutChart ; `MediaFrame` unique → CameraPreview/ImageViewer/VideoPreview/Screenshot ; `StatusCard` unique → ErrorCard/WarningCard/SuccessCard). Contrat `LayoutCapabilities` dans `agentic/components/capabilities.ts` (table `CAPABILITIES_BY_KIND`, adapté en `LayoutNode` via `capabilitiesToNode()`).
4. Addendum admin/observabilité (demande mi-session) : presets `ServerStatus/ServiceStatus/RuntimeHealth/SystemHealth/UptimeCard/HealthOverview` (`system/adminPresets.tsx`), `MicrophoneStatus/CameraStatus/AudioStatus/GPUStatus/StorageStatus` (`system/hardwarePresets.tsx`), `DiagnosticCard/DiagnosticResult/RecoveryCard/RecoveryActions` (`agent/diagnosticsPresets.tsx`), `maskSecret()` (`shared/maskSecret.ts`) — aucune clé/secret en clair dans un composant.
5. `hud/src/visual/Icon.tsx` étendu (trend/chevron/server/memory/success/error/video/image/quote/code/…) pour couvrir les nouveaux composants.

### Suite de session (même jour, après le point ci-dessus) — Containers + Workspace fait

- [x] **Containers family** créée (`agentic/components/containers/`) : `Workspace.tsx` (extrait tel quel du bloc `useLayoutSnapshot`+`orderForGrid`+`rectToGridColumn`+`LayoutGroup`+`AnimatePresence`+`SectionFrame` qui vivait inline dans `AgenticDemoStage.tsx`), `Dashboard.tsx` (`GlassHeader` + `Workspace`, hauteur header retranchée), `Flex.tsx` (Stack/Row/Grid), `SplitView.tsx`, `Panel.tsx` (wrapper `GlassPanel`), `Section.tsx` (alias `SectionFrame`), + `containers/index.ts` barrel.
- [x] `agentic/components/index.ts` — barrel top-niveau, `export * from` chaque famille (containers inclus).
- [x] `sim/adapters.ts::secToNode` — branché : si `CAPABILITIES_BY_KIND[s.kind]` existe → `capabilitiesToNode()`, sinon fallback `constraintForSize(s.size)` inchangé (zéro régression, les kinds décoratifs actuels ne matchent aucune clé de la table donc empruntent toujours l'ancien chemin).
- [x] `AgenticDemoStage.tsx` — bloc inline remplacé par `<Workspace nodes={nodes} space={...} renderContent={...} onClose={closeSection} onCollapse={toggleCollapse} onExpand={toggleExpand} />`. `toggleCollapse`/`toggleExpand` extraits en callbacks nommés (étaient inline avant). **Vérifié navigateur** (`agent-browser`, `?agenticDemo=1&skipAuth=1`) : 1 section (System Metrics/KPI) puis 6 sections (dégradation par priorité, carte étendue + grille) — rendu identique au comportement pré-refacto, zéro chevauchement.
- [x] `npm run typecheck` : toujours **11 erreurs, toutes préexistantes** (mêmes qu'avant cette suite), zéro nouvelle après l'extraction Workspace + le branchement adapters.

### PAS encore fait (à reprendre directement)

- [ ] **`Sec.kind` pas encore étendu** — `AgenticDemoStage.tsx` a toujours l'union décorative `'kpi'|'terminal'|'app4'|'app6'|'list'|'spark'|'text'|'mix'` ; `CAPABILITIES_BY_KIND` (déjà complet dans `capabilities.ts`, ~50 kinds) n'est donc jamais exercé en pratique tant que les scènes n'utilisent pas les nouveaux kinds. Prochaine étape logique : étendre l'union + `renderBody(s, density)` + les vrais composants `agentic/components/*` dans le `switch`.
- [ ] Les 5 scènes nommées (Monitoring/Agent execution/Vision/Action critique/Dense) + la 6e scène « System Health » (addendum) + sélecteur de scène dans la barre de chrome — dépendent du point ci-dessus.
- [ ] `TopBar.tsx` — ajouter un raccourci Dashboard (bouton appelant `requestDashboard()` de `useApp()`, déjà existant et câblé, confirmé par lecture directe — zéro nouvelle logique nécessaire).
- [ ] Greps de garde de périmètre (voir plan § Verification) — pas encore lancés cette suite.
- [ ] Script `tsx` autonome des 9 scénarios solveur `aspectRatio`/`expandBehavior` (fait pour Layout Engine V1 générique, pas refait pour les nouveaux kinds `CAPABILITIES_BY_KIND`).

### Pièges spécifiques à cette session

- Le dev server tourne parfois déjà (`npm run dev` sur :5173) — vérifier avant d'en lancer un second.
- `import.meta.env.DEV` **ne fonctionne pas** dans un script `tsx` autonome hors Vite (cassé une fois, corrigé) — les fichiers `layout/*.ts` doivent rester testables sans Vite, éviter cette dépendance.
- `MaterialSpec` (déplacé dans `visual/glass/tokens.ts`) doit être une `interface` explicite (pas `typeof ... as const`) sinon TS rejette les valeurs calculées du boost light-mode — déjà corrigé, ne pas régresser en le retouchant.
- Beaucoup de composants `agentic/components/*` passent par `adaptLibraryComponent()` pour réutiliser `agentic/library/*` **sans jamais importer `agentic/registry/`** — c'est intentionnel (garde de périmètre), ne pas « simplifier » en réintroduisant `getRenderer`/`validateProps`.

---

## HANDOFF 2026-08-11 — reprise maison

### Deux briefs HUD (ne pas fusionner)

| Doc | Rôle | État |
|-----|------|------|
| [`BRIEF_HUD_VEILLE_COMPOSITION.md`](../BRIEF_HUD_VEILLE_COMPOSITION.md) | Mode **repos** (présence) | **Fait en local** : TopBar réel, fake bandeau out, ChatPeek, accès voix/DEV |
| [`BRIEF_CURSOR_HUD_V2_AGENTIC.md`](../BRIEF_CURSOR_HUD_V2_AGENTIC.md) | Surfaces agentic (ToolCall, Terminal…) | **Parallèle** — ne bloque pas la veille |

### Ce qui est fait aujourd’hui (local, pas sync NUC)

**Veille HUD**
- TopBar : Core online · CPU · RAM · Disque via `SYSTEM_METRICS` / `isCoreOnline` (sinon `—`) — `hud/src/app/components/TopBar.tsx`
- Bandeau fake « 1,2 T / 98,7 % » **retiré** de `App.tsx`
- `ChatPeek` monté (peek → tiroir `CommandConsole`)
- Démo agentic **ne démarre plus** toute seule (seulement `?agenticDemo=1` ou Ctrl+Shift+U)
- Accès sans boutons TopBar :
  - Voix : apps / paramètres / gestes / dashboard
  - DEV : Ctrl+Shift+**A** apps · **S** settings · **G** gestes · **D** dashboard · **C** chat · **L** lock · **U** agentic

**Voix**
- ElevenLabs `voice_id` = `HhLkLX9WkAwlzDXzuHzd` → pack `core/data/voice/cache/jarvis3/` (738 WAV, manifest OK)
- `cache_config.yaml` : `voice_name: jarvis3` (ancien `jarvis2` intact en bascule)
- Voice Filter **hologramme ACTIF** à la lecture : `hud/src/app/bridge/voiceFilter.ts` ← `ttsCore.ts`
- Lab : `hud/tools/voice-filter-lab.html` (serveur local `python -m http.server 8760` à la racine repo)
- Speechma voix 3 = tiroir / référence oreille (`vendor/test.mp3` peut rester)
- 13 clips « hors bande » pitch conservés (surtout fragments / enroll) — non bloquant

**Docs / idées**
- Control Room Hermes → idées only : `docs/architecture/JARVIS-Agent-Control-Plane.md` ; `vendor/hermes-agent-control-room-main` **supprimé**
- Layout Engine V1 demandé (brief long) : **analysé**, sim `AgenticDemoStage` = labo ; **pas** de vrai LayoutSnapshot encore (packer CSS grid actuel)

### Ce qui N’EST PAS fait / phase 2

- [ ] Validation visuelle Samir veille (`npm run dev`)
- [ ] Sync fronts NUC + sync cache vocal `jarvis3` sur NUC
- [ ] Dashboard « tout agentic-capable » (surfaces `SURFACE_*` pour pages Dashboard) — **phase 2**, lien Dashboard figé OK
- [ ] Layout Engine V1 (snapshots x/y/w/h + priorités) dans la sim
- [ ] Brief agentic étape Terminal surface
- [ ] Profil voicebox cloné / aligné sur jarvis3 (live maison = encore Kokoro presets)

### Comment reprendre (prompt type)

```
Objectif : valider veille HUD + voix jarvis3/hologramme en local
Contexte : docs/claude/JARVIS_SESSION_STATE.md § HANDOFF 2026-08-11
Contraintes : pas de sync NUC sans go ; ne pas mélanger brief veille et brief agentic
```

### Fichiers clés touchés

`hud/src/app/App.tsx` · `TopBar.tsx` · `ChatPeek.tsx` · `ttsCore.ts` · `voiceFilter.ts` · `chatPipeline.ts` · `hud/tools/voice-filter-lab.html` · `core/data/voice/cache_config.yaml` · `core/data/voice/cache/jarvis3/` · `core/data/voice/voice_filter_candidate.yaml` · briefs + DECISIONS + vendor/README

### Pièges

- Port **8080** souvent pris (Laragon) → lab voix sur **8760**
- Sans Core WS : TopBar montre `—` / « Hors ligne » (normal, pas de fake)
- `SYSTEM_METRICS` = machine Core ; portable en dev sans Core = tirets
- Ne pas confondre : panneaux Settings/Apps **toujours montés** React, juste plus de boutons permanents en veille

---

## Vision prochaine évolution

Doc figée : [`docs/architecture/JARVIS-VISION-ORCHESTRATION.md`](../architecture/JARVIS-VISION-ORCHESTRATION.md)  
Résumé : Core orchestre · agents proposent · Core **vérifie** (preuves ≠ rapport) · voix filtrée · HUD supervise · humain tranche l’archi.

---

## Deploy NUC (méthode validée — ne pas improviser)

| Quoi | Commande | Cible NUC |
|------|----------|-----------|
| **Core seul** | `pwsh deploy/scripts/sync-core-only-nuc.ps1` | `/opt/jarvis/core/jarvis_core/` + restart |
| **HUD + Dashboard** | build local puis `pwsh deploy/scripts/sync-fronts-nuc.ps1` | `/opt/jarvis/hud/dist/` · `/opt/jarvis/dashboard/dist/` |
| **SSH** | alias `jarvis-nuc-wan` (Windows) | pas `root@192.168.1.37` nu |

Ports prod : Core WS **8765 loopback** · nginx **8080** (HUD + `/ws`). Détail : `deploy/README.md`.

**Samir finalise HUD/dashboard en dev** — remplacement NUC sur demande explicite uniquement.

---

## Topologie foyer

| Machine | IP / accès | Rôle runtime |
|---|---|---|
| **NUC** | LAN `192.168.1.37` · WAN SSH `:41222` (`jarvis-nuc-wan`) | Core + Hermes + nginx HUD · **pas** de kiosk Chromium |
| **Pi salon** | LAN `192.168.1.27` · WAN `:41223` souvent HS → **`jarvis-pi-via-nuc`** | HA + cam LG + jack + ear/cam |
| **Freebox Player** | `192.168.1.49:5555` (ADB via Pi) | Affichage apps / recherche |
| **VPS Hostinger** | `hostinger` | voicebox + Ollama (pas touché le 06/08 soir salon) |
| **Clients** | Twingate ou LAN | HUD web à la demande |

SSH Pi depuis l’extérieur : `ssh jarvis-pi-via-nuc` (`ProxyJump` NUC).

---

## Ce qui tourne (vérifié 2026-08-07)

### NUC

| Unité / chemin | État |
|---|---|
| `jarvis-core` | **active** · WS `127.0.0.1:8765` · ingest salon `127.0.0.1:8766` |
| nginx `:8080` | HUD + `/ws` + **`/v1/salon/` → :8766** |
| `/opt/jarvis/core/jarvis_core/` | `salon_ingest.py`, `salon_player.py`, `salon_speaker.py`, `__init__.py` |
| `JARVIS_SALON_SPEAKER_URL` | `http://192.168.1.27:8767` (dans `/etc/jarvis/core.env`) |
| `jarvis-hud` (kiosk) | **disabled** |

### Pi salon — deploy source : `deploy/pi-salon/`

| Unité | Port | Fichier deploy |
|---|---|---|
| `jarvis-ear` | **:8767** | `jarvis_ear.py` + `jarvis-ear.service` |
| `jarvis-cam` | **:8768** | `jarvis_cam.py` + `jarvis-cam.service` |
| HA container | **:8123** | (config `deploy/homeassistant/`) |

Install runtime Pi : `/opt/jarvis/pi-salon/` + units systemd.

`jarvis-ear` fait :
- **bouche** `POST /v1/play.json` → jack Headphones
- **oreilles** wake `hey_jarvis` → capture → Core `/v1/salon/utterance.json`
- **mains** `POST /v1/player.json` → `adb` Freebox (apps / URL)

Env Pi (service) :
- `JARVIS_CORE_SALON_URL=http://192.168.1.37:8080`
- `JARVIS_PLAYER_ADB=192.168.1.49:5555`
- `JARVIS_EAR_WAKE=1` · modèle `hey_jarvis` · seuil `0.55`

### VPS

| Conteneur | Rôle |
|---|---|
| `voicebox` | STT/TTS amont |
| `qwen-ollama` | LLM local VPS |

---

## Chaîne voix salon

```
« hey Jarvis » → wake Pi → micro → POST NUC /v1/salon/utterance.json
→ STT → handle_user_chat (Core / Hermes / Policy)
→ Netflix|YouTube|Disney|cam → POST Pi /v1/player.json → Freebox
→ TTS → POST Pi /v1/play.json → jack
```

## Freebox apps (affichage)

| App | Package / note |
|---|---|
| TV Bro | `com.phlox.tvwebbrowser` — Google / web |
| VLC | cam MJPEG `http://192.168.1.27:8768/` |
| YouTube TV / Netflix / Disney+ / Plex | déjà présents |
| Chrome | Play Store (optionnel ; sinon TV Bro) |

## HA Pi

- http://192.168.1.27:8123 · user `admin` (mdp hors git)

## Modèle foyer — devices & sessions (vision 2026-08-08)

**Un seul Core** (NUC). Tout le reste = **satellites**. Pas d’enroll urgent tant que la famille est absente ; c’est la cible produit.

### Trois types de satellite

| Type | Exemples | Utilisateur | Comportement auth |
|------|----------|-------------|-------------------|
| **Partagé foyer** | Pi salon, tablette murale | Aucun fixe | Tout le monde interagit ; le Core **identifie** (face / voix) ou session ouverte par un membre |
| **Personnel** | Tablette fille, iPhone, PC portable | **1 profil** appairé | Connexion = **son** profil (session persistante sur l’appareil) |
| **Gateway** | Pi (capteurs, jack, ADB) | Aucun UI | Prête micro/cam/speaker au Core ; pas de session propre |

### Membres & appareils visés

| Personne | Appareils personnels (profil fixe) |
|----------|-------------------------------------|
| Samir (ADMIN) | PC portable, desktop, iPhone |
| Ines, Yasmine | Leur tablette |
| Zahra | Tablette + téléphone |
| Malika | Ses appareils |

**Partagés** (toute la famille) : **Pi salon** + **tablette murale** — interaction Jarvis pour tous.

### Règles session (intent produit)

1. **Satellite partagé** : n’importe qui peut parler / se montrer à la cam → Jarvis répond **au nom du profil reconnu** (face multi-profil, voix plus tard).
2. **Samir admin sur partagé** : session **ADMIN** ouverte → peut agir pour le foyer (domotique, media, chat…) ; le **Dashboard admin** reste **renforcé** (`elevate_admin` / PIN — pas la même porte que « être admin dans le salon »).
3. **Satellite personnel** : appairage device → `user_id` ; pas besoin de rescanner à chaque fois ; permissions = rôle du profil (CHILD vs USER vs ADMIN).

### Écart Core actuel (à combler avant prod)

- ~~`AuthService.active` = une session globale~~ → **Phase 3 (2026-08-08)** : session par `connection_id` WS ; logout/disconnect scoped.
- ~~`DeviceRegistry` sans `device_mode`~~ → **Phase 3** : `personal|shared|gateway` + `bound_user_id` (discovery only, pas encore routing intent).
- Face multi-profil offline OK ; appairage device → session perso = **Phase 4+**.

Réf. architecture : `docs/architecture/JARVIS-Satellites.md` §9 point 7.

## Suite

- Freebox redirect WAN **41223** à rétablir (secours = via-nuc)
- Chrome / Spotify sur Player si besoin
- Zigbee / vraies commandes HA
- Token `JARVIS_SALON_TOKEN` (optionnel)
- **Hermes skills (2026-08-10)** : DeerFlow **dispatché** — idées dans Hermes skills + `vendor/README.md` § Déjà dispatchés ; `vendor/deerflow2.0-enhanced-main` supprimé. NUC seedé + health ok.

## Tool Bus (2026-08-07)

- **Décision A** figée : boucle dans Hermes ; Core = events + périphériques.
- Nomenclature : IntentCapability = `Capability` (+ alias) ; HostCapability = machine — pas de rename massif.
- **Phase 2 implémentée** : `HermesBridge.ask` → `/v1/runs` + SSE events → `AgentToolEvent` → bus/`tool_event`/journal. Filtre CoT. Pas de package `tools/`, pas de changement HUD.
- Contrat : `docs/architecture/JARVIS-Tool-Bus.md`.
- **Surface Decision (preuve verticale)** : `surface_decision.py` — règle unique `core.monitor` / `system.cpu` → `surface_id=monitor` → `SystemMonitor` via `snapshot` + `open_space`. Branché depuis `_execute_intent` + `_on_hermes_agent_event`. Pas de nouveau protocole / pas de modif React.
- **Device Capability Discovery Phase 0** : `devices.DeviceRegistry` (mémoire) ; NUC auto-register ; HTTP `/v1/devices` + WS `type=device` ; `capability_id` stable (`camera.capture`). Pas de router / Policy / HUD. Seed test : `deploy/scripts/seed-pi-device-caps.sh`.
- **Device 1 VALIDÉ (2026-08-07)** : HUD → `device.*` → registre. Preuve NUC : `nuc-main` + UUID(s) `pc_client`/`web_hud` (portable + iPhone) avec caps confirmées. Identité UUID + label décoratif. Couche indépendante (pas Hermes / Surface / Intent / Auth / HA).
- **Device 2 VALIDÉ (2026-08-07)** : `deploy/pi-salon/jarvis_device_announce.py` + systemd `jarvis-device-announce` — `pi-salon` online avec `camera.capture`, `audio.input`, `audio.output`, `home_assistant.gateway`, `freebox.player`. Discovery only.
- **Stratégie Device Intelligence** : inventaire d’abord ; **pas** Capability Router / Agentic UI maintenant. HA = futur adaptateur (pas cerveau). Hermes = premier agent, pas dépendance absolue (Agent Registry plus tard).
- **Services (2026-08-07 13:04)** : restart `jarvis-core` + `jarvis-hermes` — PG/nginx/ear/cam active ; Holomat FaceEngine prêt (~739 ms).
- **UI auth HUD** : **repoussé** — pas de travail HUD tant que Core face/auth n’est pas figé. Référence dev : `core/tools/face_vault.html` + `ws_cli.py`. **Smoke = auth faciale seule** (voix auth hors scope jusqu’à service speaker-ID dédié).
- **Core Phase 5 TERMINÉE (2026-08-08)** : Capability Router + routing intent ; gate `_smoke_phase5`. Doc `docs/audit/CORE_PHASE5.md`.
- **Core Phase 4 TERMINÉE (2026-08-08)** : package `vision/` ; lifecycle découpé ; gate `_smoke_phase4`.
- **Core Phase 3 TERMINÉE (2026-08-08)** : sessions WS isolées ; `device_mode` ; gate `_smoke_phase3`.
- **Tests enroll réels** : **REPORTÉS** — foyer vide (webcam uniquement). Refactor Core continue.
- **Core Phase 6 TERMINÉE (2026-08-08)** : circuit intent unifié ; gate `_smoke_phase6`.
- **Core P0 executors TERMINÉ (2026-08-08)** : tuiles système — `executors/system.py` ; docker/storage → toolset `terminal` ; gate `_smoke_p0_executors`.
- **Core P1 TERMINÉ (2026-08-08)** : mission dev ↔ kanban Hermes ; entrée unique `_start_mission_dev_run` ; chat `JARVIS_CHAT_PROVIDER=hermes|llm` ; `surface_decision` étendu ; gate `_smoke_p1` · doc `docs/audit/CORE_P1.md`.
- **Face Auth Core VALIDÉ (2026-08-08)** : MediaPipe Face Mesh dans `vision/face_mesh.py` + `vision/face_engine.py` ; contrat WS inchangé (`FACE_AUTH_CONTRACT.md`).

## Exploitation — latence & « Hermes indisponible » (2026-08-08)

**Symptôme utilisateur :** Jarvis « réfléchit » longtemps, parfois ne répond pas, ou affiche  
`Hermes indisponible — réponse locale. (délai SSE dépassé pour run run_…)`

**Cause technique (figée) :**

| Couche | Comportement |
|--------|----------------|
| **Hermes** | Run agent démarré (`POST /v1/runs`) — boucle LLM + outils (`web_search`, etc.) souvent **> 45 s** sur NUC |
| **Core** | Écoute SSE `/v1/runs/{id}/events` — **`DEFAULT_TIMEOUT = 120 s`** (`hermes/bridge.py`, env `JARVIS_HERMES_TIMEOUT`) |
| **Timeout** | `HermesUnavailable("délai SSE dépassé pour run …")` — phrase vocale explicite + Google (`_fallback_web_surface`) |
| **Fallback web** | `web.search` → message distinct **timeout** vs **panne**, puis lien Google |
| **Chat libre** | **OpenRouter cloud** par défaut (boot NUC : « mode IA : cloud ») — timeout HTTP **60 s** |
| **Voix** | voicebox sans profil `jarvis-fr` → **repli ElevenLabs** (logs NUC) = TTS lent en plus du LLM |

**Ce n’est pas :** Hermes down (supervisor `hermes: ready`, `/health` 200).

**Tests live NUC (sans sync obligatoire) :**

- WS prod : `wss://jarvis.global-it-ss.com/ws` · LAN : `ws://192.168.1.37:8080/ws`
- Script : `core/tools/nuc_p1_live.py` (défaut = domaine prod)
- Session HUD admin **≠** session `ws_cli` : pour Hermes en admin via script → `JARVIS_TEST_PIN` + `JARVIS_TEST_USER=samir`
- **Ne pas sync** le Core juste pour observer l’existant ; P1 local pas encore sur `/opt/jarvis/core` au 2026-08-08

**P3 Core (local, 2026-08-08) :** `core.missions` (magasin JSON) · `vps.code` (projets) · `JARVIS_SPOTIFY_ENABLED` · gate `_smoke_p3_tiles`.

**Tests live — À FAIRE plus tard (Samir) :** voir checklist `docs/audit/CORE_P3.md` § ops.

1. Lancer `setup-voicebox-profiles.sh` sur le NUC (profils `jarvis-fr` / `jarvis-en` / `jarvis-soft`)
2. Sync Core P0+P1+P2a → `/opt/jarvis/core` quand Samir valide
3. Requêtes web plus courtes / modèle plus rapide côté Hermes

**Diag run bloqué :** `journalctl -u jarvis-hermes -n 50 | grep <run_id>`
