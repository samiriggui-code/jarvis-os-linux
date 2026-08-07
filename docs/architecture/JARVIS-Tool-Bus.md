# JARVIS — Tool Bus (contrat minimal)

> **2026-08-07** · Décision A · Audit Hermes NUC `hermes-agent` **0.20.0**  
> Boucle agent = Hermes · Core = Policy + events + périphériques  
> **Pas** de package `tools/` tant que ce contrat n'est pas figé.

## Nomenclature

| Concept | Symbole code | Rôle |
|---|---|---|
| **IntentCapability** | `Capability` (`capabilities.py`) + alias `IntentCapability` | Intention produit (tuile / voix) |
| **Tool** | *(à venir — discovery, pas handler Hermes)* | Action namespacée (`terminal`, `home.turn_on`) |
| **HostCapability** | *(à venir)* | Capacité machine (`camera.capture`) |
| **Device** | *(à venir — Device registry)* | NUC / VPS / Pi / téléphone |

Ne **pas** renommer massivement `Capability` → risque de régression. Documenter seulement.

## Chaîne

```text
USER phrase / tuile
        │
        ▼
 IntentCapability     (match_intent / for_app)
        │
        ▼
 Policy → [Approval?] → IntentExecutor
        │
        ├─ owner=CORE  → adapters Core (HA, Plex, metrics, HUD…) = Tools locaux
        │
        └─ owner=HERMES → HermesBridge
                              │
                              ▼
                         Hermes Agent Loop  (inchangée)
                              │
                         Tools Hermes (server-side)
                              │
                         SSE events ──► Core ToolEvent(+ device_id?) ──► HUD
```

HostCapability / Device entrent **après** la visibilité events :

```text
1. Exposer ce que Hermes fait déjà (SSE)
2. ToolEvent → HUD
3. Séparer IntentCapability vs HostCapability
4. Device registry + CapabilityRouter
5. camera / mic / phone comme HostCapabilities
```

## Audit Hermes (NUC, sans modifier Hermes)

Source : `/opt/jarvis/hermes-agent/gateway/platforms/api_server.py` + `GET /v1/capabilities`.

| Canal | Existe ? | Usage JARVIS |
|---|---|---|
| **SSE** `POST /v1/chat/completions` + `stream: true` | Oui | Events `hermes.tool.progress` (`tool`, `toolCallId`, `status`: running\|completed) |
| **SSE** `POST /v1/runs` → `GET /v1/runs/{id}/events` | Oui | Events structurés `tool.started` / `tool.completed` / `run.*` / `reasoning.available` |
| **WebSocket agent** | **Non** (0 hit) | — |
| **Callback tool → Core** | Non dédié | `/api/platforms/{platform}/events` = ingress messagerie, pas tool bus |
| **Logs** | `agent.log` / `gateway.log` | Access log HTTP + housekeeping — **pas** un ledger tool fiable |
| **Discovery** | `GET /v1/toolsets`, `/v1/skills`, `/v1/capabilities` | Déjà partiellement utilisé (`toolsets`) |

`runtime.tool_execution: "server"` — les outils s'exécutent **sur le host Hermes (NUC)**.  
Pas de split-runtime aujourd'hui.

### Récupérer les tool calls **sans** patch Hermes

1. **Implémenté (Phase 2)** : `HermesBridge.ask()` → `POST /v1/runs` + `GET /v1/runs/{id}/events`  
   → `AgentToolEvent` → bus `TOOL_EVENT` + WS `tool_event` + journal.  
   Filtre : `reasoning.*`, `message.delta`, outils `_…`.
2. **Ne pas** parser les logs comme source de vérité.
3. **Ne pas** forker Hermes pour un webhook tool — l'API l'expose déjà en SSE.

```text
Hermes Agent Loop
      │  SSE /v1/runs/{id}/events
      ▼
HermesBridge.ask  (Policy déjà OK)
      │  map_hermes_run_event (filtre CoT)
      ▼
AgentToolEvent
      │
      ├─► EventBus TOOL_EVENT
      ├─► broadcast { type: tool_event, … }   // HUD plus tard
      └─► record_tool_event (journal)
```

`device_id` = `"nuc"` aujourd'hui (Hermes sur NUC). Optionnel pour Pi/VPS/phone.

## Contrat ToolEvent (Core → HUD)

Synthétique uniquement — **jamais** de chaîne de pensée LLM privée  
(`reasoning.available` Hermes → **filtrer**, ne pas relayer au HUD).

```json
{
  "event": "tool.completed",
  "run_id": "…",
  "tool": "terminal",
  "tool_call_id": "call_terminal_1",
  "status": "success",
  "duration_ms": 42,
  "summary": "ls -la",
  "device_id": null
}
```

| Champ | Obligatoire | Note |
|---|---|---|
| `event` | oui | `agent.*` / `tool.*` / `capability.*` / `device.*` |
| `run_id` | oui si Hermes | Corrélation |
| `tool` | si tool.* | Nom outil Hermes ou Tool Core |
| `tool_call_id` | recommandé | Mappe `toolCallId` SSE |
| `status` | si tool.* | `running` / `success` / `failed` |
| `duration_ms` | non | Depuis `duration` runs API |
| `summary` | non | Preview / label — pas stdout brut |
| **`device_id`** | **non (optionnel)** | Réservé architecture distribuée NUC/VPS/Pi/phone |

Mapping Hermes → ToolEvent :

| Hermes | ToolEvent |
|---|---|
| `hermes.tool.progress` status=running | `tool.started` |
| `hermes.tool.progress` status=completed | `tool.completed` |
| runs `tool.started` / `tool.completed` | idem (+ `error` → `tool.failed`) |
| run start / end | `agent.started` / `agent.completed` |
| `reasoning.available` | **drop** (privé) |

## Contrat Intent → Tool → Host → Device

```text
IntentCapability.intent     ex. system.shell, home.control
        │
        │  (toolset Hermes OU tools Core enregistrés)
        ▼
Tool.name                   ex. terminal, home.turn_on, system.cpu
        │
        │  (si l'outil dépend d'une machine)
        ▼
HostCapability.name         ex. camera.capture, microphone.input
        │
        ▼
Device.id                   ex. nuc, vps, pi-salon, phone-samir
```

Règles :

- Un **IntentCapability** peut ouvrir plusieurs **Tools** (plan Hermes).
- Un **Tool** Hermes n'a pas de `handler` Core — exécution server-side Hermes ; Core **observe**.
- Un **Tool** Core (HA/Plex/metrics) a un handler local ; `device_id` souvent `nuc` ou `pi-salon`.
- **HostCapability** ≠ Tool de traitement : `camera.capture` (device) vs `vision.detect_face` (processor).
- `Owner.DEVICE` reste le crochet Intent pour le jour où une intention est purement « appareil ».

## Prochaine implémentation (après validation)

1. Étendre `HermesBridge` : path `/v1/runs` **ou** `stream:true` + forward ToolEvent sur le bus WS Core.  
2. HUD : consommer ToolEvent (timeline) — sans CoT.  
3. **Ensuite** seulement package `tools/` (schema + discovery miroir `/v1/toolsets`).  
4. Device registry + HostCapability plus tard.
