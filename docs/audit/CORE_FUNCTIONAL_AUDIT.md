# Audit fonctionnel Core — intents, Hermes, surfaces (2026-08-08)

> Complète l'audit **refactor structurel** Phases 0–5 (`CORE_PHASE5.md`).  
> Objectif : cartographier ce que le Core **doit** faire pour que l'app fonctionne,  
> et ce qui reste mal segmenté / cassé / stub.

---

## Verdict en une phrase

Le **squelette** est là (Policy → Router → IntentExecutor → exécutant / surface),  
mais **trois circuits divergent**, **~15 intents sont des stubs**, et le **host gate Phase 5**  
bloque HA et Holomat alors que les adaptateurs tournent **in-process sur le Core**.

---

## 1. Rôles que le Core doit assumer

| Rôle | Responsabilité | Module(s) actuel(s) | Maturité |
|------|----------------|---------------------|----------|
| **Ingress** | WS / HTTP / salon → normaliser | `ws/handlers/*`, `salon_ingest.py` | OK |
| **Policy** | Jamais IA → root ; confirmation HOME/admin | `policy.py` | OK |
| **Intent match** | Phrase / tuile → `Capability` | `capabilities.py` `match_intent` | OK |
| **Router** | Quel device / quelle bouche | `capability_router.py` | **v1 — régression HA/vision** |
| **Core executors** | HA, Plex, HUD, metrics, vision | `intents/executors*.py`, `homeassistant.py`, `plex.py` | Partiel |
| **Hermes delegate** | Toolsets, SSE, tool_event | `hermes.py`, `registry._hermes_handler` | OK mais **double chemin chat** |
| **Surface publisher** | Agentic UI snapshots | `surface.py`, `composer.py`, `surface_decision.py` | Minimal |
| **Auth / session** | Par connexion WS | `auth/`, `session_store.py` | OK post-Phase 3 |
| **Device discovery** | HostCapability registry | `devices.py` | Discovery only |

---

## 2. Circuit de déclenchement (intended)

```
Utilisateur (voix / tuile / composant surface / compose)
        │
        ▼
  match_intent / for_app
        │
        ▼
  PolicyEngine.evaluate          ← toujours AVANT exécution (tuile + voix)
        │
        ▼
  CapabilityRouter (optionnel)     ← origine, device_mode, host cap
        │
        ▼
  IntentExecutor.execute
        ├─ Owner.CORE  → adaptateur local (HA, Plex, HUD, surfaces)
        └─ Owner.HERMES → HermesBridge.ask → SSE → tool_event
        │
        ▼
  SurfaceBroadcaster / hud_command → HUD
```

---

## 3. Entrées réelles (aujourd'hui)

| Entrée | Handler | Chemin |
|--------|---------|--------|
| Chat / voix HUD | `chat.handle_user_chat` | `match_intent` → CORE: `_open_intent` / HERMES: `_chat_via_capability` / sinon LLM |
| Salon Pi STT | `chat.handle_salon_utterance` | → même `handle_user_chat` |
| Clic tuile | `surface.handle_surface` `open` | `for_app` → `_open_intent` |
| Intent in-surface | `surface` `action=intent` | Policy → `_execute_intent` |
| Approval HITL | `surface` `action=approval` | `_execute_intent(granted=True)` |
| Compose LLM | `surface` `action=compose` | `SurfaceComposer` → **providers.complete**, pas Hermes |
| Mission dev | `system.handle_mission_dev` | **hors** registre intents (`core.mission_dev` = stub) |
| Streaming Freebox | `_try_streaming_platforms` | **hors** catalogue (`media.streaming` ad hoc) |

---

## 4. Inventaire intents (39 tuiles)

### CORE — exécutants réels (11)

| Intent | Exécutant | Surface ? |
|--------|-----------|-----------|
| `home.control` | `_execute_home` → HA | Ouvre espace `home` — **bloqué par host gate** |
| `media.video` | `_execute_video` → Plex | TTS seulement |
| `media.pause` | `_execute_media_pause` → HA | TTS |
| `core.holomat` | `_execute_camera_view` | CameraPreview — **bloqué par host gate** |
| `system.capabilities` | `_execute_capabilities` | ResultPanel |
| `system.introspect` | `_execute_introspect` | ResultPanel |
| `hud.*` (8) | `_execute_hud` | `hud_command` NATIVE |

### CORE — stubs (14)

Retournent `{intent, owner, display, note}` sans action :  
`core.preferences`, `core.neural_map`, `core.dashboard`, `core.monitor`,  
`core.security`, `core.providers`, `core.usage`, `core.mission_dev`,  
`core.cursor`, `core.missions` (unavailable), `system.network` (unavailable), etc.

**Note :** `core.monitor` stub + effet de bord via `_maybe_publish_surface_decision` → SystemMonitor.

### HERMES — 11 intents

Tous via `_hermes_handler` ou `_chat_via_capability` → `HermesBridge.ask`.  
Publient `ResultPanel` si texte.  
`vps.docker` / `vps.storage` : `available=False` → refus runtime.

### DEVICE — 3 intents **non enregistrés**

`vps.code`, `devices.list`, `devices.topology` → `IntentNotExecutable` si appelés.

---

## 5. Hermes vs chat — double chemin (bug de design)

| Chemin | Utilise `IntentExecutor` ? | Publie surface ? | tool_event journal ? |
|--------|---------------------------|------------------|----------------------|
| Tuile / approval | Oui (`_hermes_handler`) | Oui | Via `_execute_intent` |
| Chat voix (`_chat_via_capability`) | **Non** — appelle Hermes direct | Oui | **Non** (sauf SSE parallèle) |

**À unifier** : un seul `HermesIntentDelegate` appelé depuis les deux.

---

## 6. Surfaces agentic UI

| Mécanisme | Déclencheur | Composants |
|-----------|-------------|------------|
| `_publish_result_surface` | Hermes reply, capabilities, web fallback | ResultPanel + open_space |
| `_execute_camera_view` | core.holomat | CameraPreview + ResultPanel |
| `_maybe_publish_surface_decision` | **Seule règle** : monitor / system.cpu | SystemMonitor |
| `SurfaceComposer.propose` | WS compose | LLM → validate → snapshot |
| `open_approval` | Policy confirmation | ApprovalCard |

**Manque vs doc Agentic UI :**
- HA ne publie pas de surface (actions domotiques = TTS + espace home)
- Hermes tools → pas de mapping tool → composant (sauf monitor)
- HUD timeline `tool_event` non consommé
- Compose utilise OpenRouter/Ollama, pas Hermes (documenté comme divergence)

---

## 7. Régression Phase 5 — host gate

`executors_routing._execute_intent` refuse **avant** l'exécutant si :

| Intent | HostCapability requise | Problème |
|--------|------------------------|----------|
| `home.control` | `home_assistant.gateway` | HA = adaptateur **in-process** ; NUC n'annonce pas cette cap |
| `core.holomat` | `camera.capture` | NUC a `camera.capture=false` ; cam = clients / pi-salon |

**Fix attendu :** host gate seulement pour intents qui **délèguent** à un satellite ;  
`Owner.CORE` + adaptateur local = bypass ou cap virtuelle sur `nuc-main`.

---

## 8. Bugs / régressions connus

| Priorité | Issue | Fichier |
|----------|-------|---------|
| **P0** | Imports manquants dans chat (régression Phase 5) | `ws/handlers/chat.py` — **corrigé 2026-08-08** |
| **P0** | Host gate bloque HA + holomat | `executors_routing.py` + `capability_router.py` |
| P1 | Hermes chat bypass IntentExecutor | `executors_routing.py` |
| P1 | DEVICE intents morts | `capabilities.py` / `registry.py` |
| P2 | `core.mission_dev` stub vs `handle_mission_dev` | parallel paths |
| P2 | `executors.py` encore ~650 lignes multi-domaines | refactor Phase 6 |

---

## 9. Segmentation cible (Phase 6 produit)

```
intents/
  catalog.py          ← CAPABILITIES + match (depuis capabilities.py)
  registry.py           ← enregistrement pur
  routing.py            ← _open_intent, _execute_intent
executors/
  home.py               ← HA
  media.py              ← Plex + pause + streaming
  hud.py                ← déjà executors_hud.py
  surfaces.py           ← capabilities, introspect, camera, publish_result
  stubs.py
hermes/
  bridge.py             ← hermes.py
  delegate.py           ← chemin unique tile + chat
  events.py             ← _on_hermes_agent_event
surfaces/
  broadcaster.py        ← depuis surface.py
  admission.py
  composer.py
  decision.py
  publisher.py
routing/
  capability_router.py  ← host gate policy par Owner
devices/
  registry.py
```

---

## 10. Plan d'action recommandé

### Immédiat (app fonctionnelle)

1. ~~Fix imports `chat.py`~~
2. **Host gate** : bypass pour `Owner.CORE` ou enregistrer `home_assistant.gateway` sur NUC
3. Smoke manuel : « allume le salon », tuile Home, tuile Vision

### Court terme (segmentation)

4. Unifier délégué Hermes (tile = chat)
5. Enregistrer ou retirer intents DEVICE
6. Découper `executors.py` → `executors/home.py`, `media.py`, `surfaces.py`
7. Étendre `surface_decision` ou mapping intent → surface template

### Moyen terme (produit)

8. HUD consomme `tool_event` + `surface_result.route`
9. Router v2 (RTT, co-présence)
10. Tests enroll réels + sync NUC

---

## Gate actuelle vs gate produit

| Gate | Couvre |
|------|--------|
| `_smoke_phase5` | Structure refactor + router unitaire |
| **Manque** | E2E intent HA, Hermes mock, surface snapshot, chat routing |

Proposer : `_smoke_intent_circuit.py` (offline, mocks HA/Hermes).
