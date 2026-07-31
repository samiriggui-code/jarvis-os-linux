# Architecture — JARVIS OS (monorepo)

## Couches

```
┌─────────────────────────────────────────────────┐
│  setup/     Setup Center (React) — install only │
└──────────────────────┬──────────────────────────┘
                       │ manifeste → deploy/
┌──────────────────────▼──────────────────────────┐
│  HUD / Dashboard React (WIP dans vendor/figma*) │
│  futur : hud/ + dashboard/ servis en kiosque    │
└──────────────────────┬──────────────────────────┘
                       │ ws://host:8765 (+ REST)
┌──────────────────────▼──────────────────────────┐
│  core/      Orchestrateur                       │
│             ├── policy/     Policy Engine       │
│             ├── providers/  AI Provider Manager  │
│             ├── agents/     stubs               │
│             └── api/        WS + REST           │
└──────────────────────┬──────────────────────────┘
                       │
        vendor/refs/jarvis_ai   (pipeline voix — réf.)
        vendor/vision/*         (Holomat — à brancher)
        vendor/agents/hermes-agent  (HTTP :8642)
```

## Contrats

### Client ↔ Core (WebSocket JSON) — cible

Client → Core :
```json
{ "type": "user_event", "event": "chat", "text": "…" }
{ "type": "ping" }
```

Core → Client :
```json
{ "command": "set_orb_state", "state": "thinking" }
{ "command": "display_notification", "message": "…", "duration": 4.0 }
{ "command": "boot" }
```

États orb (cahier §3.2) : `idle` | `listening` | `thinking` | `tool_call` | `speaking` | `gesture` | `error`

Détail voice / panels : s’inspirer de `vendor/refs/jarvis_ai` (docs ARCHITECTURE) — à porter, pas à copier le HUD vanilla.

### Règles

- Fronts = présentation seule (pas de LLM direct)
- Core = décisions via Policy Engine puis Provider Manager
- Setup = écrit `/etc/jarvis/` (config + secrets), ne reste pas en prod kiosque
- Un service systemd par composant au déploiement NUC
- HUD Qt/QML : **retiré** du monorepo

## Cible NUC

```
/opt/jarvis/hud/dist          # build React (quand prêt)
/opt/jarvis/dashboard/dist
/opt/jarvis/core
/opt/jarvis/setup             # optionnel post-install
/storage/jarvis/              # modèles, backups, logs
/etc/jarvis/                  # config.yaml + secrets.env
```

Kiosque : Chromium / cage plein écran → HUD React (pas PySide).

## Cible — Hermes Core & Dashboard (cahier §2, §3, §13)

`core/` aujourd'hui = stub (Policy + Provider). La cible découpe l'orchestrateur Hermes en managers dédiés (§2) :

```
hermes-core/
├── brain/     llm_router (Provider Manager), intent_engine, memory, context
├── entities/  entity_registry, device_manager, capabilities
├── agents/    agent_manager, pairing, authentication, updates
├── tools/     tool_manager, manifests, adapters (whisper, piper, holomat…)
├── skills/    applications, terminal, media, system, homeassistant, automation
└── api/       websocket, rest
```

Managers Core complets (§2) : Health/System, Security, Capability, Tool, Voice, Holomat, Agent, Discovery, Device, Provider, Memory, IoT Gateway, Home Agent, Recovery. Chacun peut tomber sans emporter les autres (§2 « couches indispensables vs modules optionnels »).

Arborescence logique → déploiement (§3) :

```
hud-react/          → /opt/jarvis/hud/dist/          (figma1)
dashboard-react/    → /opt/jarvis/dashboard/dist/    (figma2)
hermes-core/        → /opt/jarvis/core/              (+ Hermes Agent en service séparé)
voice-manager/      → /opt/jarvis/services/voice/
holomat-engine/     → /opt/jarvis/services/vision/
agent-manager/      → dans core/ (§13)
system-manager/     → dans core/ (Health/System Manager)
```

Modules cible du Dashboard React (§13.7) : Command Center, Hermes Core, Voice Manager, Entités, Agents, Tools, Applications, Système/Monitoring, IA — cockpit d'admin distinct du Setup Center (§5) et du HUD (usage quotidien).

Holomat (§6.8) = couche vision/gestes ET identité : authentification **multi-facteurs** (voix + geste + profil), jamais reconnaissance faciale seule.

Agents d'appareil (§13, à ne pas confondre avec les agents fonctionnels du Core) exécutent les actions locales sur chaque machine jumelée (Windows/Linux/Android/Mac) — le navigateur HUD n'a lui-même aucun accès direct à l'OS.
