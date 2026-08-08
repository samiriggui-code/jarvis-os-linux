# P2 HUD — contrat Core → React

Le dépôt HUD (`hud/`) n'est pas versionné ici ; ce document fige le contrat WS
que le front doit implémenter.

## Messages WS

### Live — `tool_event`

Émis à chaque étape intent ou outil Hermes. **Format unifié** (Phase 6 P2).

```typescript
interface ToolTimelineEntry {
  type: "tool_event";
  /** intent.started | intent.completed | intent.failed | tool.started | tool.completed | … */
  event: string;
  intent?: string;
  stage?: "started" | "completed" | "failed" | "not_executable";
  owner?: "core" | "hermes" | "device";
  tool?: string;
  toolset?: string;
  run_id?: string;
  status?: "running" | "success" | "failed";
  duration_ms?: number;
  summary?: string;
  device_id?: string;
  route?: Record<string, unknown>;
}
```

Brancher dans le client WS existant :

```typescript
if (msg.type === "tool_event") {
  timelineStore.push(msg as ToolTimelineEntry);
}
```

### Bootstrap — `tool_timeline_snapshot`

Envoyé à la connexion WS (40 derniers événements) + sur demande :

```json
{ "type": "tool_timeline", "action": "snapshot", "limit": 50 }
→ { "type": "tool_timeline_snapshot", "events": [ … ] }
```

### HTTP (Dashboard / debug)

```
GET /v1/tool-events?limit=50
→ { "ok": true, "events": [ … ] }
```

(proxifié via nginx `:8080` comme `/v1/devices/`)

## Surface auto (Hermes tools)

Le Core publie `SURFACE_SNAPSHOT` quand :

| Intent / tool | Surface | Composant |
|---------------|---------|-----------|
| `core.monitor`, `system.cpu`… | `monitor` | SystemMonitor |
| `web.search`, `web_search` | `reach` | ResultPanel |
| `web.browse`, `browser.*` | `browser` | ResultPanel |
| `system.shell`, `terminal` | `terminal` | ResultPanel |

Le HUD **écoute déjà** `SURFACE_SNAPSHOT` sur `app.id` — rien à changer côté protocole.

## Checklist HUD (à coder dans `hud/`)

- [ ] Store timeline (`tool_event` + snapshot initial)
- [ ] Composant `ToolTimeline` (liste chronologique, pas de CoT)
- [ ] Afficher `route` / `device_id` si présents
- [ ] Lier clic timeline → `open_space` de l'app concernée

## Gate Core

```powershell
cd core
python -m jarvis_core._smoke_p2_hud
python -m jarvis_core._smoke_phase6
```
